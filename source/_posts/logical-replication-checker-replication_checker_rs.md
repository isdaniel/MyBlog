---
title:  Rust 實作的 PostgreSQL logical replication checker (replication_checker_rs)
date: 2025-08-10 10:30:11
tags: [Rust,PostgreSQL, logical-replication]
categories: [Rust, PostgreSQL, logical-replication]
keywords: Rust,Linux,logical-replication
---

## 前言


大家好，今天要和大家介紹我近期開發的一個開源專案 [replication_checker_rs][1] 如果你想用一個輕量、可讀性高的工具實時觀察 PostgreSQL 邏輯複寫（logical replication）流，或想把複寫協議的學習變成可執行的實驗場，`replication_checker_rs` 是一個不錯的起點：它是 Rust 實現 PostgreSQL logical replication protocol 使用 `libpq-sys` 的實作，能連上資料庫、建立 replication slot，並將 INSERT / UPDATE / DELETE / TRUNCATE 等變更以可讀格式顯示出來。(https://github.com/isdaniel/replication_checker_rs)

---

## 為什麼會想用它？

* **學習角度**：它直接實作 PostgreSQL 的 logical replication protocol（WAL message parsing、relation/tuple 格式）以可讀、可改造的 Rust 程式碼呈現，適合希望理解底層協議的人。
* **快速驗證**：想知道 publication 有沒有正確產生事件、或某些 schema 變更會如何呈現時，可以直接跑這個工具觀察實際輸出。
* **Rust + libpq 真實範例**：展示如何用 `libpq-sys` 與 Tokio 做低階連線管理與 parser 實作
* **延伸空間大**：可以把它當作 PoC（proof of concept），加上 JSON 化、推到 Kafka/Redis、做到可重啟的 consumer。

---

## 功能與限制（快速掃描）

**主要功能**

* 用作邏輯複寫客戶端（logical replication client），可建立 replication slot 並接收變更。
* 支援顯示 `BEGIN`、`COMMIT`、`INSERT`、`UPDATE`、`DELETE`、`TRUNCATE` 以及 relation／tuple 資訊，並能處理 streaming（大型）交易。

**目前限制**

* 目前只把變更**顯示為人類可讀格式**，沒有把事件推到 Kafka/Redis 等下游處理器。
* 只對文字型別（text types）有良好處理；binary 類型會以 raw 形式顯示。
* slot 管理、錯誤復原邏輯較簡單（遇到大部分錯誤會結束程式）

---

## 實作前準備（PostgreSQL 與系統）

1. **PostgreSQL 必須開啟 logical WAL**：`wal_level = logical`（修改後需重啟 PostgreSQL）。這是 logical replication 的必要條件。
2. **建立 publication**（只複寫你想要的 table，或 `FOR ALL TABLES`）：`CREATE PUBLICATION my_publication FOR TABLE table1, table2;`。
3. **建立有 replication 權限的 user**：例如 `CREATE USER replicator WITH REPLICATION LOGIN PASSWORD 'password';` 並給予必要的 SELECT 權限。
4. **系統相依套件**：需要 `libpq` 開發檔（例如 Debian/Ubuntu 的 `libpq-dev`、macOS 用 Homebrew 安裝 `postgresql`），並使用 Rust 1.70+。


> 請注意：PostgreSQL DB 版本必須等於或高於版本 14，更多資訊請參閱以下連結。

https://www.postgresql.org/docs/14/protocol-replication.html
https://www.postgresql.org/docs/current/protocol-logical-replication.html#PROTOCOL-LOGICAL-REPLICATION-PARAMS

### PostgreSQL 設定（必要）

1. `postgresql.conf`：

```conf
wal_level = logical
max_replication_slots = 10    # 視需求調整
max_wal_senders = 10
```

修改後重啟 PostgreSQL。

2. 建 publication 與 replication user（在 psql 下執行）：

```sql
-- 建 replication user
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replicator_pw';
-- 建 publication（只複寫特定 table 或使用 FOR ALL TABLES）
CREATE PUBLICATION my_publication FOR TABLE public.my_table;
```

> 注意：不要無限制地建立 replication slot（未刪除會造成 WAL 快速累積），測試時留意 WAL 使用量。

---

## 快速上手（編譯 & 執行）

**從原始碼編譯**

```bash
git clone https://github.com/isdaniel/replication_checker_rs.git
cd replication_checker_rs
cargo build --release
```

（注意系統需先安裝 libpq 開發庫）。

**範例執行方式**（README 範例改寫，實務上把 db 參數用空格分開的 key-value 傳入）

```bash
# 設定 slot / publication 名稱（可用環境變數）
export slot_name="my_slot"
export pub_name="my_publication"

# 執行（參數順序為 key value key value ...）
./target/release/pg_replica_rs user azureuser **replication database** host 127.0.0.1 dbname redis_fdw_rs port 5432
```

> 連接字串需要使用 replication database 代表是 replication 操作
> 你也可以用 `RUST_LOG` 控制日誌等級（例：`RUST_LOG=debug`）。

**Docker 方式**

```bash
docker build -t pg_replica_rs .
docker run -e slot_name=my_slot -e pub_name=my_pub \
  pg_replica_rs user postgres password secret host host.docker.internal port 5432 dbname mydb
```

方便在隔離環境做測試。

## 實戰：建立 publication、產生測試資料、觀察輸出

### 在資料庫上建立測試 table 與 publication

```sql
CREATE TABLE public.my_table (
  id serial primary key,
  msg text
);

CREATE PUBLICATION my_publication FOR TABLE public.my_table;
```

### 在另一個 psql session 產生變更

```sql
INSERT INTO public.my_table (msg) VALUES ('hello replication');
UPDATE public.my_table SET msg = 'altered' WHERE id = 1;
DELETE FROM public.my_table WHERE id = 1;
```

### 觀察 `replication_checker_rs` 的輸出（示例）

```
025-08-10T02:57:54.417412Z  INFO Started receiving data from database server
2025-08-10T02:58:01.488499Z  INFO BEGIN: Xid 1522
2025-08-10T02:58:01.489158Z  INFO Received relation info for public.t1
2025-08-10T02:58:01.489235Z  INFO TRUNCATE
2025-08-10T02:58:01.489255Z  INFO public.t1
2025-08-10T02:58:01.489318Z  INFO COMMIT: flags: 0, lsn: 43614824, end_lsn: 43614944, commit_time: 2025-08-10 02:58:01.484 UTC
2025-08-10T02:58:07.583760Z  INFO BEGIN: Xid 1523
2025-08-10T02:58:07.583925Z  INFO Received relation info for public.t1
2025-08-10T02:58:07.584000Z  INFO table public.t1: INSERT:
2025-08-10T02:58:07.584012Z  INFO a: 1
2025-08-10T02:58:07.584040Z  INFO table public.t1: INSERT:
2025-08-10T02:58:07.584062Z  INFO a: 2
2025-08-10T02:58:07.584104Z  INFO COMMIT: flags: 0, lsn: 43615128, end_lsn: 43615176, commit_time: 2025-08-10 02:58:07.580 UTC

```
---

## 程式碼結構與關鍵模組導覽

（以 repo 常見的檔案分佈為範例）

* `main.rs`：啟動、參數解析、log 設定
* `server.rs` / `connection.rs`：與 Postgres 建立 replication 連線、處理 libpq loop
* `parser.rs`：負責把 raw WAL message 解析成內部事件（BEGIN/RELATION/INSERT/UPDATE/DELETE/TRUNCATE/COMMIT）
* `types.rs`：定義 relation、tuple 與欄位型別
* `utils.rs`：byte 解析、LSN 處理、輔助 function

---

## 深入：實踐中的概念與操作建議

下面幾點是把工具從「觀察器」進化到「可實際應用」時會用到的概念與工程建議。

1. **Replication Slot**

   * Slot 決定了你從哪個 WAL LSN 開始讀，並讓 PostgreSQL 保留 WAL（直到被確認消費）。測試時注意不要無限建立未刪除的 slot（會造成 WAL 累積）。`replication_checker_rs` 可建立 slot，但目前在程式中 slot cleanup 還是簡單處理，所以測試環境中你要管理好。

2. **Publication 與 Schema 一致性**

   * Publication 決定哪些 table 的變更會被發送。上線前請確認 schema（尤其 REPLICA IDENTITY、nullable、type 改動）在 source 與 downstream 處理端的一致性，否則解析或重放會有問題。`replication_checker_rs` 會顯示 relation 資訊，能幫你驗證。

3. **Streaming 交易**

   * 對大交易（very large transactions），Postgres 可能以 streaming 模式傳送。此專案已處理 streaming 交易，這讓它在面對大批量資料變更時不會輕易崩潰。(

4. **Feedback（ack）機制**

   * Logical replication protocol 支援回報已處理的 WAL 位置（可用於讓 primary safe remove WAL）。專案實作有 feedback 機制，但在 production 要確保回報策略（多久 ack、持久化 LSN 等）與你下游同步策略一致。
   *

5. **從「顯示」到「處理」：把事件送到下游**

   * 如果你要把變更送到 Kafka、Redis 或寫入另一個 DB，建議把 parser 與 message handling 拆成兩層：**（1）可靠地接收並 ack WAL（LSN）**、**（2）異步或批次地把事件轉送到下游並重試**。目前 `replication_checker_rs` 主要做第（1）與可視化，延伸第（2）需要你加上連線池、backpressure 與錯誤重試。

---

## 實務上常見問題（與排解）

* `libpq not found`：請安裝系統的 PostgreSQL 開發套件（如 `libpq-dev`、`postgresql-devel` 或 Homebrew 的 `postgresql`）。
* 權限錯誤：Replication user 需要 `REPLICATION` 權限，且 publication 應包含你想觀察的 tables。
* Slot 已存在：若 slot 名稱衝突，請手動刪除舊 slot 或指定不同名稱再試。

---

## 延伸建議（如果你想把它用到更真實的場景）

1. 將輸出轉成 **structured JSON** 並發到 Kafka 或 Event Hub（便於 downstream consumer 處理）。
2. 增加 **slot cleanup & resume 機制**：遇錯不要直接停，保存最後 ack 的 LSN，重啟時從該位置恢復。
3. 支援 binary 類型與更完整的 type mapping（目前以 raw 顯示 binary）。
4. 把 `replication_checker_rs` 包成一個可監控的 service，加上 metrics（Prometheus）與 health-check endpoint。
   這些方向都屬於從 PoC → production 的典型演進路線。

---

## 結語

`replication_checker_rs` 是一個很實用的學習與測試工具：它把 PostgreSQL logical replication protocol 的各個重要面向（slot、publication、BEGIN/COMMIT、tuple parsing、streaming 交易、feedback）用 Rust + libpq 呈現出來，適合用來做教學、驗證複寫行為或作為你自製複寫處理器的起點。想進一步把它變成 production-ready，需要在錯誤復原、slot 管理、下游整合跟 binary type 處理上補強。([GitHub][1])

* [replication_checker_rs][1]
* 歡迎 Star、開 issue、PR 一起改進專案！


[1]: https://github.com/isdaniel/replication_checker_rs "GitHub - isdaniel/replication_checker_rs"
