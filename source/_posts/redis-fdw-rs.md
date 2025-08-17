---
title: 【開源介紹】redis_fdw_rs：讓 PostgreSQL 直接查 Redis 的 FDW 擴充套件（Rust 編寫）
date: 2025-08-16 11:12:43
tags: [rust,opensource,redis]
categories: [rust,opensource,redis,fdw]
keywords: rust,opensource,redis,fdw
---

大家好，今天要和大家介紹我近期開發的一個開源專案 —— [`redis_fdw_rs`](https://github.com/isdaniel/redis_fdw_rs)，這是一個使用 Rust 語言與 [pgrx](https://github.com/pgcentralfoundation/pgrx) 框架實作的 **Redis Foreign Data Wrapper (FDW)**，讓你能夠在 PostgreSQL 中直接查詢 Redis 資料，就像操作一般的資料表一樣。

## 為什麼需要 Redis FDW？

Redis 是高效的快取資料庫，常被用於儲存 session、排行榜、事件流等資料。但當你想從 PostgreSQL 中同步存取 Redis 資料，就必須透過額外程式碼或 ETL 工具，相對麻煩。

`redis_fdw_rs` 就是為了解決這個痛點而生：**透過 FDW 介面，讓 PostgreSQL 能用 SQL 查 Redis！**

---

## 🚀 專案特色與支援功能

這個 FDW 專案目前已經支援以下功能，適合實際部署與使用：

* ✅ **支援 Redis Cluster**
* ✅ **WHERE 條件下推**（Pushdown）：減少資料搬移量，提升查詢效率
* ✅ **連線池管理**：避免反覆連線 Redis 的開銷
* ✅ **Stream 大量資料支援**：批次查詢、分頁等場景皆可處理
* ✅ **支援 PostgreSQL 14\~17**
* ✅ **Unit Test & Integration Test**：專案有測試覆蓋，確保穩定性

---

## 使用範例（超簡單）

只需要幾行 SQL，就能連結 Redis 並開始查詢：

```sql
-- 建立 Redis 伺服器連線
CREATE SERVER redis_server
FOREIGN DATA WRAPPER redis_wrapper
OPTIONS (host_port '127.0.0.1:6379');

-- 宣告一個 Redis hash 的外部表格
CREATE FOREIGN TABLE user_profiles (
  field text,
  value text
)
SERVER redis_server
OPTIONS (table_type 'hash', table_key_prefix 'user:profiles');

-- 開始使用 SQL 操作 Redis！
INSERT INTO user_profiles VALUES ('name', 'John');
SELECT * FROM user_profiles WHERE field = 'email';
```

## Redis Cluster 模式支援

`redis_fdw_rs` 也完全支援 Redis Cluster 架構。你只需指定多個節點的 `host_port`，即可享有以下好處：

### Cluster 優勢

* **自動故障轉移**：節點失效時自動轉移到健康節點
* **自動 sharding**：資料分散在多節點，自動分片
* **節點自動探索**：只需指定一個節點，驅動程式會自動發現整個叢集
* **高可用性**：節點損壞仍可正常讀寫

### 範例設定：

```sql
-- 建立 cluster foreign server
CREATE SERVER redis_cluster_server
FOREIGN DATA WRAPPER redis_wrapper
OPTIONS (
    host_port '127.0.0.1:7000,127.0.0.1:7001,127.0.0.1:7002',
    password 'your_redis_password'  -- 可選
);

-- 建立 cluster 對應的外部表格
CREATE FOREIGN TABLE user_sessions (
    field TEXT,
    value TEXT
)
SERVER redis_cluster_server
OPTIONS (
    database '0',
    table_type 'hash',
    table_key_prefix 'session:active'
);

-- 與單節點操作無異
INSERT INTO user_sessions VALUES ('user123', 'session_token_abc');
SELECT * FROM user_sessions WHERE field = 'user123';
```


### 範例結果

```sql
redis_fdw_rs=# INSERT INTO user_profiles (key, value)
SELECT i, 'value_' || i
FROM generate_series(1,100000) i;
INSERT 0 100000
Time: 12911.183 ms (00:12.911)
redis_fdw_rs=# SELECT * FROM user_profiles where key = '5';
 key |  value
-----+---------
 5   | value_5
(1 row)

Time: 15.380 ms
redis_fdw_rs=# SELECT * FROM user_profiles where key in ('10', '15', '20');
 key |  value
-----+----------
 10  | value_10
 15  | value_15
 20  | value_20
(3 rows)

redis_fdw_rs=#  SELECT * FROM user_profiles where key like '555%';
  key  |    value
-------+-------------
 55556 | value_55556
 55581 | value_55581
 55569 | value_55569
 55561 | value_55561
 55516 | value_55516
 55538 | value_55538
 55549 | value_55549
 55539 | value_55539
 55531 | value_55531
 55545 | value_55545
 55590 | value_55590
 55512 | value_55512
 55523 | value_55523
 55534 | value_55534
 55518 | value_55518
 55560 | value_55560
 55564 | value_55564
 55592 | value_55592
 55572 | value_55572
 55519 | value_55519
 55526 | value_55526
 5559  | value_5559
 55530 | value_55530
 55511 | value_55511
 55562 | value_55562
 55542 | value_55542
 55582 | value_55582
 55580 | value_55580
 55501 | value_55501
 55540 | value_55540
 55554 | value_55554
 55546 | value_55546
 55513 | value_55513
 55548 | value_55548
--More--
```


---

## 支援的 Redis 資料型態

目前支援以下 Redis 資料型別，並標示已實作的操作：

| Redis Type | SELECT | INSERT | UPDATE | DELETE | Status |
|------------|--------|--------|--------|--------|--------|
| Hash       | ✅     | ✅     | ❌     | ✅     | **Partial** (UPDATE not supported) |
| List       | ✅     | ✅     | ❌     | ✅     | **Partial** (UPDATE not supported) |
| Set        | ✅     | ✅     | ❌     | ✅     | **Partial** (UPDATE not supported) |
| ZSet       | ✅     | ✅     | ❌     | ✅     | **Partial** (UPDATE not supported) |
| String     | ✅     | ✅     | ❌     | ✅     | **Partial** (UPDATE not supported) |
| Stream     | ✅     | ✅     | ❌     | ✅     | **Full** (Large data set support with pagination) |


可透過 `table_type` 和 `table_key_prefix` 指定資料類型與 key 前綴，也支援選擇 Redis 的 `database`（預設為 0）。

---

## 專案資源

* GitHub 倉庫：[https://github.com/isdaniel/redis\_fdw\_rs](https://github.com/isdaniel/redis_fdw_rs)
* 文件與安裝說明完整、範例齊全
* 歡迎 Star、開 issue、PR 一起改進專案！

---

## 結語：一起打造更強的資料存取能力！

這個專案仍持續演進中，如果你有 Redis / PostgreSQL 混合架構的需求，或是對 Rust、FDW 開發有興趣，非常歡迎你一起參與改進。

有任何回饋，歡迎透過 GitHub 討論，我會持續更新與優化這個實用的工具！

