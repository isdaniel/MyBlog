---
title: PostgreSQL 效能調校實戰：從高 CPU、高記憶體到慢查詢的排查
date: 2026-07-31 21:30:00
tags: [PostgreSQL, Performance-Tuning, Troubleshooting, pg_stat_statements, EXPLAIN]
categories: [PostgreSQL, Performance-Tuning]
keywords: PostgreSQL,效能調校,performance-tuning,高CPU,高記憶體,慢查詢,pg_stat_statements,EXPLAIN,ANALYZE,wait-event,pg_stat_activity,work_mem,autovacuum,lock,blocking,cache-hit-ratio,PgBouncer,troubleshooting
description: "一套可實作的 PostgreSQL 效能排查：用 wait event、pg_stat_statements、EXPLAIN 由上而下定位高 CPU、高記憶體、慢查詢、鎖等待與表膨脹問題，每個症狀都附上可直接執行的 SQL。"
lang: zh-tw
---
## 前言

當 PostgreSQL 效能變差時，最常見的錯誤是「憑感覺」直接跳到某個 SQL 去猜哪裡慢。真正有效率的排查方式是 **由上而下 (top-down)**：先看作業系統與實例層級的指標（哪個資源、哪個時間點被打爆），再看 **wait event**（backend 到底卡在哪一類瓶頸），最後才進到 **query 層級** 去針對元凶做 `EXPLAIN`。

其他相關基礎可以搭配我之前寫的文章一起看：

* [postgresql 執行計畫重要因子 (成本因子調教)](https://isdaniel.github.io/postgresql-cost-factor-tuning/)
* [Postgresql AutoVacuum 介紹](https://isdaniel.github.io/postgresql-autovacuum/)
* [PostgreSQL WAL 介紹](https://isdaniel.github.io/postgresql-wal-introduce/)

## 前置作業：先把觀測能力打開

在做任何 query 層級的診斷之前，下面這些參數必須先就位，否則很多統計表根本沒資料。

* **`pg_stat_statements`**：要先加進 `shared_preload_libraries`、**重啟** DB（分配共享記憶體，reload 不夠），再在目標 DB 執行 `CREATE EXTENSION pg_stat_statements;`。
* **`track_activities = on`**（預設開）：`pg_stat_activity` 才會回報 `state`、`query`、`wait_event`。
* **`track_counts = on`**（預設開）：`pg_stat_user_*`、`pg_statio_*`、`pg_stat_database` 的計數器才會累積，否則「未使用索引」、「cache hit ratio」查出來都是空的。
* **`track_io_timing = on`**（預設關）：`pg_stat_statements` 與 `EXPLAIN (BUFFERS)` 的 **I/O 時間**欄位才有值（block 數量欄位一直都有）。這個有額外開銷，正式環境開之前先壓測。

```sql
-- postgresql.conf
shared_preload_libraries = 'pg_stat_statements'
track_io_timing = on

-- 重啟後在目標 DB 執行
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

## 排查方法論：三層由上而下定位

| 層級 | 問「什麼」 | 工具 |
| --- | --- | --- |
| Tier 1 — OS / 實例指標 | **何時**、**哪個資源**被打爆 | CPU% / IOPS / Throughput、`top`、`iostat`、`vmstat`、`pg_stat_database` |
| Tier 2 — Wait event | backend **卡在哪一類瓶頸** | `pg_stat_activity.wait_event_type` |
| Tier 3 — Query 層級 | **哪一條** SQL 是元凶 | `pg_stat_statements`、`EXPLAIN (ANALYZE, BUFFERS)` |

Tier 2 是很多人忽略但最關鍵的一層。判讀 `wait_event_type` 先看「類別」：

| `wait_event_type` | 代表的瓶頸類別 |
| --- | --- |
| `NULL` 且 `state='active'` | **On-CPU** — backend 正在真的跑（CPU-bound）。PostgreSQL 沒有一個叫 `'CPU'` 的 wait type，on-CPU 是靠「active + 沒有 wait event」推論出來的 |
| `Lock` | 重量級鎖競爭（例如 `wait_event='relation'` 卡在 table lock） |
| `LWLock` | 共享記憶體結構競爭（例如 `ProcArray`） |
| `IO` / `BufferPin` | 儲存 / buffer 瓶頸 |
| `Client` | 在等應用程式 / 網路 — **不是** DB 的瓶頸 |
| `IPC` | 在等另一個 backend |
| `Activity` / `Timeout` | 設計上就在閒置的背景程序 — **不是**使用者查詢問題 |

> **重要觀念**：`wait_event` 是 **瞬時取樣 (point-in-time)**，不是累積時間。單看一次快照只知道「此刻」誰在等。要把時間歸因到 CPU / IO / Lock，必須 **反覆取樣**（例如每秒一次）或用擴充套件。

下面這條快照查詢會把所有 client backend 依「瓶頸類別」分桶，是排查第一步最好用的一條：

```sql
SELECT
    CASE
        WHEN wait_event_type IS NULL                            THEN 'CPU/Running (no wait)'
        WHEN wait_event_type IN ('Lock', 'LWLock', 'BufferPin') THEN 'Lock/Contention'
        WHEN wait_event_type = 'IO'                             THEN 'IO'
        ELSE 'Wait: ' || wait_event_type
    END                                            AS bottleneck_class,
    coalesce(wait_event, '(none)')                 AS wait_event,
    count(*)                                       AS backends,
    string_agg(DISTINCT state, ', ')               AS states
FROM pg_stat_activity
WHERE backend_type = 'client backend'
  AND pid <> pg_backend_pid()
GROUP BY 1, 2
ORDER BY backends DESC;
```

判讀：如果 `CPU/Running` 這桶 backend 數量爆多 → 往 [高 CPU](#高-CPU-排查) 走；`Lock/Contention` 多 → 往 [鎖與 blocking](#鎖與-Blocking-排查) 走；`IO` 多 → 往 [cache hit 與 I/O](#Cache-hit-ratio-與-I-O-排查) 走。

## 高 CPU 排查

持續高 CPU 常見成因：(a) 單條很貴的查詢、(b) 便宜但呼叫超頻繁的查詢、(c) long transaction / idle-in-transaction、(d) 連線數過多、(e) 統計資訊過期或表膨脹逼出爛執行計畫。

### 找「每次執行最貴」的查詢（mean_exec_time）

```sql
SELECT userid::regrole, dbid, query, mean_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 5;
```

### 找「總成本最高」的查詢（total_exec_time）

這個抓的是「單次便宜、但被呼叫幾萬次」那種累積殺手：

```sql
SELECT userid::regrole, dbid, total_exec_time, query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 5;
```

> **版本雷點**：PG13 以後請用 `mean_exec_time` / `total_exec_time`。舊名 `mean_time` / `total_time` 在 PG13 被 **移除**（拆成 `*_exec_time` + `*_plan_time`），所以 Postgres 12 那組用 `mean_time` / `total_time` 的查詢在 v13+ 會直接報錯。

### 總時間 + 每條的 cache 命中率

一次看出「哪條 SQL 花最多時間、而且 cache 命中率差」：

```sql
SELECT query,
       calls,
       total_exec_time,
       rows,
       100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 5;
```

`hit_percent` 偏低代表這條查詢一直在讀 disk（cache miss），通常是缺索引或工作集超過 `shared_buffers`。

### 找「穩定慢」的查詢（過濾掉一次性偶發）

`calls > 50` 濾掉偶發，看平均 / 最大 / 標準差：

```sql
SELECT query,
       calls,
       mean_exec_time,
       max_exec_time,
       stddev_exec_time,
       rows::numeric / nullif(calls, 0) AS mean_rows
FROM pg_stat_statements
WHERE calls > 50
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### 看「當下正在跑」的查詢與它在等什麼

`state='active'` 且 `wait_event_type IS NULL` 的那一列，就是你正在燒 CPU 的查詢：

```sql
SELECT pid,
       now() - query_start AS query_duration,
       now() - xact_start  AS xact_duration,
       state,
       wait_event_type,
       wait_event,
       query
FROM pg_stat_activity
WHERE state = 'active'
  AND pid <> pg_backend_pid()
  AND backend_type = 'client backend'
ORDER BY query_start ASC;
```

> 想只看長時間跑的，加上 `AND now() - query_start > interval '5 seconds'`。

### 揪出跑超過 5 秒的 long-running query，並抓它的 EXPLAIN

排查慢查詢最實戰的一步：先用 `pg_stat_activity` 撈出 **已經跑超過 5 秒** 的查詢（門檻自己調），拿到它的 `pid` 與完整 SQL，再對那條 SQL 跑 `EXPLAIN` 看它為什麼慢。

**Step 1：撈出跑超過 5 秒、當下 active 的查詢**

```sql
SELECT pid,
       now() - query_start           AS running_for,   -- 這條查詢已經跑多久
       state,
       wait_event_type,
       wait_event,
       query
FROM pg_stat_activity
WHERE state = 'active'
  AND backend_type = 'client backend'
  AND pid <> pg_backend_pid()
  AND now() - query_start > interval '5 seconds'        -- 只看跑超過 5 秒的
ORDER BY running_for DESC;
```

判讀：`running_for` 由大到小排，最上面那條就是「跑最久還沒結束」的元凶。搭配 `wait_event_type` 判斷它卡在什麼——`NULL` 代表正在燒 CPU（多半是缺索引 / 爛計畫）；`Lock` 代表被別人擋住（跳到[鎖與 Blocking](#鎖與-Blocking-排查)）；`IO` 代表在等磁碟。

> `query` 欄位預設會被 `track_activity_query_size`（預設 1024 bytes）截斷，長 SQL 會看不全，必要時可調大這個參數（需重啟）。

**Step 2：對這條慢查詢跑 EXPLAIN**

從 Step 1 拿到完整 `query` 後，把它貼到 `EXPLAIN` 裡分析。先用 **不帶 `ANALYZE`** 的版本（只看預估計畫、不會真的執行，安全）：

```sql
EXPLAIN (VERBOSE, SETTINGS) <把上面查到的 query 貼進來>;
```

如果這條查詢可以安全地再跑一次（純 `SELECT`、或你能接受它實際執行），再用 `ANALYZE` 拿到真實執行時間與 buffer 命中狀況，這才看得出「預估 vs 實際」的落差：

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) <同一條 query>;
```

> **對 `INSERT` / `UPDATE` / `DELETE` 用 `ANALYZE` 會真的改到資料**，一定要包在交易裡（見[慢查詢分析](#慢查詢分析：讀懂-EXPLAIN-ANALYZE-BUFFERS)）：`BEGIN; EXPLAIN (ANALYZE, BUFFERS) <DML>; ROLLBACK;`

**Step 3（可選）：確定是元凶且影響線上，就先取消它**

用 Step 1 查到的 `pid` 取消它（優先 `pg_cancel_backend`，只取消查詢、保留連線）：

```sql
SELECT pg_cancel_backend(12345);   -- 換成 Step 1 查到的 pid
```


### 找 long transaction / idle-in-transaction

這類 session 會一直卡住 CPU、持鎖、並釘住 xmin horizon 讓 VACUUM 無法回收（延伸閱讀：[Postgresql AutoVacuum 介紹](https://isdaniel.github.io/postgresql-autovacuum/)）：

```sql
SELECT pid, usename, datname, state, wait_event_type,
       now() - xact_start  AS xact_duration,
       now() - query_start AS query_duration,
       query
FROM pg_stat_activity
WHERE pid <> pg_backend_pid()
  AND backend_type = 'client backend'
  AND state IN ('idle in transaction', 'active')
  AND xact_start IS NOT NULL
ORDER BY xact_duration DESC NULLS LAST;
```

### 看連線數分佈（連線太多 = CPU + 記憶體雙重負擔）

```sql
SELECT state, count(*)
FROM pg_stat_activity
WHERE pid <> pg_backend_pid()
GROUP BY state
ORDER BY state ASC;
```

> 背景輔助程序的 `state` 是 `NULL`，會多出一列，屬正常現象。

### 高 CPU 的處置

* **貴的查詢**：拿 `EXPLAIN (ANALYZE, BUFFERS)` 分析（見[慢查詢分析](#慢查詢分析：讀懂-EXPLAIN-ANALYZE-BUFFERS)），補索引 / 更新統計 / 改寫 SQL。
* **連線太多、短連線頻繁**：前面架 **PgBouncer** 連線池（transaction 模式），不要一味調高 `max_connections`。
* **已知某個 PID 是元凶要處理**：優先用 `pg_cancel_backend`（送 SIGINT，只取消當前查詢、保留 session），不行再用 `pg_terminate_backend`（送 SIGTERM，直接砍掉整個 backend 並 rollback）：

```sql
SELECT pg_cancel_backend(12345);     -- 溫和：取消當前查詢
SELECT pg_terminate_backend(12345);  -- 強硬：砍掉整個 session（會 rollback 進行中的工作）
```

## 高記憶體排查

> 高記憶體不像高 CPU 有那麼多現成的診斷 SQL 可以排名——它主要是「參數配置」問題（`work_mem`、`max_connections` 的乘法效應），SQL 層面能看到徵兆的只有 `EXPLAIN (ANALYZE, BUFFERS)` 裡的 sort/hash 溢出。所以本節重點在「哪些參數會吃記憶體、怎麼避免 OOM」。

### `work_mem` 溢出陷阱（最大的記憶體風險）

`work_mem` 是 **每個 sort / hash 運算、每條查詢、每個連線** 各自分配的，最壞情況會相乘：

```text
最壞情況記憶體 = work_mem × (單條查詢的 sort/hash 運算數) × 併發連線數
```

預設 4 MB。會吃 `work_mem` 的：`ORDER BY`、`DISTINCT`、merge join（sort）；hash join、hash aggregate、`IN` 子查詢（hash）。在 `max_connections` 很大時把 `work_mem` 全域調高，很容易乘出 OOM。**正確做法是針對特定重查詢在 session / role 層級調高**，而不是全域。

> `hash_mem_multiplier`（預設 2.0）會再把 hash 類運算的記憶體上限放大成 `work_mem × 2.0`。

### 連線太多 → 用 PgBouncer 而不是調高 max_connections

PostgreSQL 是 **process-per-connection** 模型，每個 backend 都可能吃掉 `work_mem` / `temp_buffers`，所以 `max_connections` 是直接的記憶體乘數。要服務大量 client，正確做法是前面架 **PgBouncer**（transaction pooling），讓後端只用少量連線就能撐住上萬個 client 連線。

使用 PgBouncer 時要注意 pool 模式與 prepared statement 的相容性：

* **statement pool 模式與 prepared statement 不相容**。
* **transaction 模式** 只有在 `max_prepared_statements > 0`（預設 0）時才支援 protocol-level 的 prepared statement。
* 若是用託管服務（managed service）內建的 PgBouncer，通常會另外開一個埠（常見是 **6432**），且不一定所有規格層都支援，實際以你的服務規格為準。

### 唯一能看到記憶體徵兆的查詢：EXPLAIN + BUFFERS

單純 `EXPLAIN ANALYZE` 看不到記憶體，要加 `BUFFERS`：

```sql
EXPLAIN (ANALYZE, VERBOSE, BUFFERS) <your_query>;
```

判讀重點在 sort 節點：

* `Sort Method: quicksort  Memory: NNNkB` → 塞得進 `work_mem`，很好。
* `Sort Method: external merge  Disk: NNNkB` → **溢出到硬碟**，代表 `work_mem` 不夠。

> **版本雷點**：專門顯示 planner 記憶體的 `EXPLAIN (MEMORY)` 是 **PG17 才有**，v13–16 不能用。但每個 Sort / Hash 節點的記憶體用量，`ANALYZE` 本來就會印出來。

### 相關記憶體參數

| 參數 | 預設 | 說明 |
| --- | --- | --- |
| `maintenance_work_mem` | 64 MB | VACUUM / CREATE INDEX / ADD FK 用；可設得比 `work_mem` 大。但它是每個 autovacuum worker 的上限 → autovacuum 實際吃 `maintenance_work_mem × autovacuum_max_workers` |
| `autovacuum_work_mem` | -1 | `-1` = 繼承 `maintenance_work_mem`；`maintenance_work_mem` 設很大時，設一個明確較小值來壓 autovacuum 併發記憶體 |
| `shared_buffers` | 128 MB | 全域單一分配（非每連線）；建議 ~25% RAM，別超過 ~40%；**改了要重啟** |
| `temp_buffers` | 8 MB | 每個 session 給暫存表用；屬每連線記憶體 |

## 慢查詢分析：讀懂 EXPLAIN (ANALYZE, BUFFERS)

推薦的完整寫法：

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS) <query>;
```

* 有寫入時再加 `WAL`（需搭配 `ANALYZE`）。
* `SETTINGS` 只印出「和預設值不同」的 planner GUC（空的代表全預設）。

### 怎麼讀輸出

* **預估值**：`(cost=STARTUP..TOTAL rows=N width=W)` — cost 是 **無單位** 的 planner 估算值（以 `seq_page_cost=1.0` 為基準），**永遠不要拿 cost 去跟實際 ms 比**。想深入理解 cost 怎麼算出來，可看我的 [成本因子調教](https://isdaniel.github.io/postgresql-cost-factor-tuning/)。
* **實際值（ANALYZE）**：`(actual time=STARTUP..TOTAL rows=N loops=L)` — 真實毫秒與執行次數。
* **BUFFERS**：`shared hit` = 命中 cache（省了讀取）、`read` = 從 disk 讀（miss）、`dirtied` = 這次改髒的 block、`written` = 被這個 backend 逐出的髒 block。

### 爛執行計畫的訊號（診斷清單）

1. **預估 rows vs 實際 rows 差 10～1000 倍以上** — *最重要的訊號*。代表 planner 的選擇性統計爛了，通常導致選錯 join 型態（該用 hash join 卻跑 nested loop）。**修法**：`ANALYZE`、調高 `default_statistics_target`（或對特定欄位 `ALTER TABLE ... ALTER COLUMN ... SET STATISTICS`）、建 extended statistics。
2. **`loops > 1`** — 印出來的 `actual time` 與 `rows` 是 **每次執行的平均值**，要乘上 `loops` 才是真正總量。一個看起來很便宜、卻被跑一萬次的內層節點，可能才是真正的瓶頸（超級常見的誤判）。
3. **`Sort Method: external merge  Disk: NkB`**（或 Hash 節點分成多個 batch）→ 溢出到 disk → **調高 `work_mem`**。
4. **大表上出現 `Seq Scan` 且 `Rows Removed by Filter` 很大** → 缺索引 / 索引沒被用到。（但小表的 Seq Scan 是正確的，要看表大小 + 過濾掉的行數判斷，不是看到節點名就下結論。）
5. **BUFFERS 裡 `read` 遠大於 `hit`** → cache 太冷或工作集超過 `shared_buffers`。

### 對 DML 做 EXPLAIN ANALYZE 一定要包在交易裡

`EXPLAIN ANALYZE` 會 **真的執行** 語句（含 INSERT/UPDATE/DELETE/DDL 的副作用！），所以分析寫入語句時務必包起來：

```sql
BEGIN;
EXPLAIN (ANALYZE, BUFFERS, WAL) DELETE FROM tenk1 WHERE unique1 < 100;
ROLLBACK;
```

### auto_explain：抓那些「當下重現不了」的慢查詢

正式環境裡有些慢查詢你無法在 psql 手動重現，這時用 `auto_explain` 自動把超過門檻的查詢計畫寫進 log：

```bash
# postgresql.conf
shared_preload_libraries = 'auto_explain'
auto_explain.log_min_duration = 0      # 記錄的最小執行時間 (ms)，0 = 全記錄
auto_explain.log_analyze = true        # 記錄 EXPLAIN ANALYZE (false 只會是 ANALYZE)
auto_explain.log_buffers = true        # 需要 log_analyze = true 才有用
auto_explain.log_timing = true
auto_explain.log_nested_statements = true
```

> 正式環境請 **不要** 開 `log_statement` / `log_duration` 去記全部語句，那會把 log 灌爆；用 `auto_explain` 針對慢查詢才對。

## 鎖與 Blocking 排查

當 [方法論](#排查方法論：三層由上而下定位) 那條快照查詢顯示 `Lock/Contention` 一堆時，就進來這一節。關於各種 lock 模式的互斥對照，可以搭配我的 [dblock 系列](https://isdaniel.github.io/dblock-1/) 一起看。

### 快速看誰被鎖住

```sql
SELECT pid, wait_event_type, wait_event
FROM pg_stat_activity
WHERE wait_event_type = 'Lock';
```

### Blocking 樹：被鎖的 backend ↔ 鎖住它的 backend

`pg_blocking_pids()`（PG9.6+）是關鍵，直接把「誰被誰擋住」攤開：

```sql
SELECT blocked.pid              AS blocked_pid,
       blocked.usename          AS blocked_user,
       blocked.query            AS blocked_query,
       blocking.pid             AS blocking_pid,
       blocking.usename         AS blocking_user,
       blocking.state           AS blocking_state,
       blocking.query           AS blocking_query,
       now() - blocking.xact_start AS blocking_xact_age
FROM pg_stat_activity AS blocked
JOIN LATERAL unnest(pg_blocking_pids(blocked.pid)) AS b(blocking_pid) ON true
JOIN pg_stat_activity AS blocking ON blocking.pid = b.blocking_pid
WHERE blocked.wait_event_type = 'Lock';
```

### 直接看 pg_locks（過濾未授予的鎖 = 正在等的）

```sql
SELECT l.pid, l.locktype, l.mode, l.granted,
       l.relation::regclass AS relation,
       a.state, a.query
FROM pg_locks l
JOIN pg_stat_activity a ON a.pid = l.pid
WHERE NOT l.granted
ORDER BY l.pid;
```

### 揪出 idle-in-transaction 元凶

這類 session 開著交易不 commit，會持鎖 + 釘住 xmin horizon 擋住 VACUUM 清理，`backend_xmin` 越舊問題越大：

```sql
SELECT pid,
       state,
       now() - xact_start   AS xact_age,
       now() - state_change AS idle_duration,
       wait_event_type,
       wait_event,
       backend_xmin,
       query AS last_query
FROM pg_stat_activity
WHERE state IN ('idle in transaction', 'idle in transaction (aborted)')
ORDER BY xact_start ASC;
```

**處置**：設 `idle_in_transaction_session_timeout`（例如 `'5min'`，預設 0 = 停用）自動終止這類 session；或對特定 PID 用 `pg_terminate_backend(pid)`。另外 `deadlock_timeout`（預設 1s）控制 backend 等多久才觸發死鎖偵測，也決定 `log_lock_waits = on` 何時記錄 Lock 等待。

## Cache hit ratio 與 I/O 排查

> 這裡的 "read" 指「不在 `shared_buffers`」，它仍可能命中 OS page cache，所以 ratio 沒到 0.99 不代表一定有物理磁碟 I/O。健康的 OLTP 通常 > 0.99。

> **注意整數除法陷阱**：社群常見的 cache-hit 片段常直接 `bigint / bigint`，這是 **整數除法**，結果會被截成 `0`。下面全部都有 `::numeric` 轉型。

### 資料庫層級 cache 命中率

```sql
SELECT
    datname,
    blks_read,
    blks_hit,
    round(blks_hit::numeric / nullif(blks_hit + blks_read, 0), 4) AS cache_hit_ratio
FROM pg_stat_database
WHERE datname = current_database();
```

### Heap / Index 命中率

```sql
-- Heap (資料表本體)
SELECT
    sum(heap_blks_read) AS heap_read,
    sum(heap_blks_hit)  AS heap_hit,
    sum(heap_blks_hit)::numeric
        / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0) AS ratio
FROM pg_statio_user_tables;

-- Index
SELECT
    sum(idx_blks_read) AS idx_read,
    sum(idx_blks_hit)  AS idx_hit,
    sum(idx_blks_hit)::numeric
      / nullif(sum(idx_blks_hit) + sum(idx_blks_read), 0) AS ratio
FROM pg_statio_user_indexes;
```

命中率長期偏低 → 工作集超過 `shared_buffers` → 調高 `shared_buffers`（~25% RAM）並把 `effective_cache_size` 設實際一點，讓 planner 願意選 index scan。

### 逐條查詢的 I/O 元凶

```sql
SELECT query, calls, shared_blks_read, shared_blks_hit,
       shared_blks_dirtied, shared_blks_written,
       temp_blks_read, temp_blks_written
FROM pg_stat_statements
ORDER BY shared_blks_read DESC
LIMIT 20;
```

`shared_blks_read` 高 = cache miss 多；`temp_blks_*` 高 = `work_mem` 溢出到 disk。

> **版本雷點**：想用 I/O **時間** 排序（需 `track_io_timing = on`），欄位名稱依版本不同：v13–16 是 `blk_read_time` / `blk_write_time`；PG17+ 改名成 `shared_blk_read_time` / `shared_blk_write_time`。v13–16 請用前者：
>
> ```sql
> SELECT query, calls, blk_read_time, blk_write_time,
>        blk_read_time + blk_write_time AS total_io_time
> FROM pg_stat_statements
> ORDER BY total_io_time DESC
> LIMIT 20;
> ```

### 找沒被用到的索引（浪費寫入與記憶體）

沒用到的索引會拖慢寫入、佔記憶體、還會排擠 cache。`idx_scan = 0` 就是候選：

```sql
SELECT
    n.nspname                                      AS schemaname,
    c.relname                                      AS tablename,
    c.reltuples::bigint                            AS num_rows,
    pg_size_pretty(pg_relation_size(c.oid))        AS table_size,
    psai.indexrelname                              AS index_name,
    pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size,
    CASE WHEN i.indisunique THEN 'Y' ELSE 'N' END  AS "unique",
    psai.idx_scan                                  AS number_of_scans
FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_index i ON c.oid = i.indrelid
    JOIN pg_stat_all_indexes psai ON i.indexrelid = psai.indexrelid
WHERE c.relkind IN ('r', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  -- AND psai.idx_scan = 0        -- 取消註解可只看「完全沒用到」的索引
ORDER BY 1, 2;
```

> **刪索引前務必注意**：這些統計是從上次 `pg_stat_reset` 起才累積的；replica 上的 `idx_scan` 是分開計數的（主庫沒用到的索引，可能在讀取副本上有在用）；**絕對不要**因此刪掉 unique / PK / 約束用的索引。

## 表膨脹與 Autovacuum 排查

統計資訊過期與 dead tuple 膨脹會拖爛執行計畫、抬高 CPU。原理與觸發時機我在 [Postgresql AutoVacuum 介紹](https://isdaniel.github.io/postgresql-autovacuum/) 有完整說明，這裡給排查用的查詢。

### Dead tuple / 膨脹排名

```sql
SELECT
    schemaname,
    relname,
    n_live_tup,
    n_dead_tup,
    CASE WHEN n_live_tup > 0
         THEN round(n_dead_tup::numeric / n_live_tup, 4)
         ELSE NULL
    END AS dead_tuple_ratio,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE n_dead_tup > 0
ORDER BY n_dead_tup DESC, dead_tuple_ratio DESC NULLS LAST;
```

判讀：`n_dead_tup` 大、`dead_tuple_ratio` 高，且 `last_autovacuum` 很舊或空 → autovacuum 在這張熱表上沒跟上。

**短期手動修**（語法所有版本通用）：

```sql
VACUUM ANALYZE <table>;
```

**Autovacuum 關鍵參數**：

| 參數 | 預設 | 建議 |
| --- | --- | --- |
| `autovacuum` | on | 保持開啟 |
| `autovacuum_vacuum_scale_factor` | 0.2 | 大熱表調到 ~0.05–0.1（固定 20% 對大表太粗，資料量越大越難觸發） |
| `autovacuum_max_workers` | 3 | 會乘上 autovacuum 總記憶體（見 `maintenance_work_mem`） |
| `autovacuum_vacuum_cost_delay` / `_cost_limit` | 2ms / -1(→200) | 寫入量大時降低 delay / 提高 limit，讓 autovacuum 跟得上 |

> 也可以 **針對單張表** 設定閾值，例如 `ALTER TABLE t SET (autovacuum_vacuum_scale_factor = 0.02);`，細節見 autovacuum 那篇。

## 關鍵設定參數速查表

下表預設值為 PostgreSQL 上游預設；若跑在託管服務或雲端，實際值通常會依機器規格（vCore / 記憶體）自動調整，以你環境查到的 `SHOW <參數>;` 為準。

| 參數 | 預設 | 作用 / 影響 | 建議 | 需重啟 |
| --- | --- | --- | --- | --- |
| `shared_buffers` | 128 MB | 全域 buffer cache（單一分配），決定 cache-hit ratio | ~25% RAM，別超過 ~40% | **是** |
| `work_mem` | 4 MB | **每 sort/hash 運算、每查詢、每連線** 溢出前的記憶體 | 最壞 = `work_mem × ops × connections`；針對重查詢在 session/role 層調高，別全域 | 否 |
| `hash_mem_multiplier` | 2.0 | hash 類運算的 `work_mem` 倍數 | 調高可減少 hash 溢出，但也放大 work_mem 風險 | 否 |
| `effective_cache_size` | 4 GB | **純 planner 提示**（不分配任何記憶體），影響是否偏好 index scan | 專用機設 ~50–75% RAM | 否 |
| `maintenance_work_mem` | 64 MB | VACUUM / CREATE INDEX / ADD FK | 可比 `work_mem` 大；乘上 `autovacuum_max_workers` 才是 autovacuum 總量 | 否 |
| `max_connections` | 100 | 最大併發連線，**直接的記憶體乘數** | 別靠調高它服務大量 client，前面架 **PgBouncer** | **是** |
| `random_page_cost` | 4.0 | 成本模型：隨機讀一頁的相對成本（相對 `seq_page_cost=1.0`） | SSD / cache 熱的工作負載調到 ~1.1，讓 planner 偏好 index scan | 否 (reload) |
| `default_statistics_target` | 100 | `ANALYZE` 收集的欄位統計解析度 | 預估與實際 rows 差很多時調高並重新 `ANALYZE` | 否 |
| `track_io_timing` | off | 開啟 block I/O **時間** 統計 | 要分辨 CPU-bound vs I/O-bound 時開；有開銷 | 否 (reload) |
| `idle_in_transaction_session_timeout` | 0 (關) | 自動終止卡在 idle-in-transaction 的 session | 設 `'5min'` 避免它持鎖 / 釘住 xmin 擋 VACUUM | 否 |

> `pg_stat_statements.max`（預設 5000）：超過時會淘汰最少執行的項目，長尾查詢會悄悄消失，改它要 **重啟**；`.track = all` 可看到 PL/pgSQL 函式內部的查詢；`.track_planning`（預設 off）開了才有 plan-time 欄位（有額外開銷）。

## 小結

整套排查手冊的核心就一句話：**由上而下，先分類再定位**。

1. **Tier 1**：看 OS / 實例指標，確定是哪個資源、哪個時間點。
2. **Tier 2**：用 `pg_stat_activity` 的 `wait_event_type` 把 backend 分桶（CPU / Lock / IO），決定往哪個方向查——這一步最省時間，卻最常被跳過。
3. **Tier 3**：用 `pg_stat_statements` 排名找元凶，再用 `EXPLAIN (ANALYZE, BUFFERS)` 針對單條查詢驗證。

幾個最容易踩的雷再提醒一次：

* `wait_event` 是 **瞬時取樣**，要看趨勢得反覆取樣。
* `EXPLAIN ANALYZE` 讀 `loops` 時記得 **actual time / rows 是每次平均**，要乘 `loops`。
* `EXPLAIN ANALYZE` 對 DML **會真的執行**，一定包 `BEGIN ... ROLLBACK`。
* PG13 之後 `pg_stat_statements` 用 `total_exec_time`（不是 `total_time`）；`pg_wait_events`、`EXPLAIN (MEMORY)` 是 PG17 才有。
* 調 `work_mem` 前先想清楚 **× ops × connections** 的乘法，避免 OOM。

把這幾條查詢存成書籤，下次線上出事時就能照著症狀一路查下去，而不是憑感覺瞎猜。

## References

* [Troubleshoot high CPU utilization (Microsoft Learn)](https://learn.microsoft.com/en-us/azure/postgresql/troubleshoot/how-to-high-cpu-utilization?tabs=mean-postgres13%2Ctotal-postgres13)
* [Troubleshoot high memory utilization (Microsoft Learn)](https://learn.microsoft.com/zh-tw/azure/postgresql/troubleshoot/how-to-high-memory-utilization)
* [PostgreSQL Docs — pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html)
* [PostgreSQL Docs — Monitoring Statistics (pg_stat_activity / wait events)](https://www.postgresql.org/docs/current/monitoring-stats.html)
* [PostgreSQL Docs — Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html)
* [PostgreSQL Wiki — Index Maintenance](https://wiki.postgresql.org/wiki/Index_Maintenance)
* [PostgreSQL Wiki — Lock Monitoring](https://wiki.postgresql.org/wiki/Lock_Monitoring)
