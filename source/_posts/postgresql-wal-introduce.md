---
title: postgresql WAL (Write-Ahead Logging) 機制
date: 2021-10-07 20:30:11
tags: [DataBase,Turning,postgresql,WAL]
categories: [Turning,postgresql]
keywords: DataBase,Turning,postgresql,WAL
---

## 前言

WAL 是一種 Tx Log實踐機制

WAL 核心概念是先寫 tx log，在把資料寫資料，資料的修改必须發生在**寫入** Tx Log之後，使用 WAL 紀錄資料庫系統在commit transaction

使用 WAL 機制後我們不需要在每次 Commit Transaction 後就把資料 flush 到 Disk 上(提高IO效率)， WAL 需要保證 Dirty Block flush 到 Disk 之前，該 Block 對應 Tx log 紀錄已經 flush 到 Disk 中

> 因為假如系統突然崩潰我們可以藉由 WAL 寫入 Tx Log 來 roll-forward recovery (REDO)

## WAL 寫入時機簡介

`LSN`序號是一個 globale 變數(透過 `info_lck` 輕量鎖設計避免同一時間取得同一個 LSN )

寫入資料會經由下面幾個步驟

1. Log (LSN–Log) 是一個有順序性標誌的紀錄 (可以想像是一個 sequence ) ，一開始存在 RAM 中，在 RAM 中有一個 flushLSN 位置會記錄 log LSN 寫入 Disk 最後位置.
2. 每個 block 在 pageheader 會有一個欄位 `PageXLogRecPtr pd_lsn;` 指到 log 紀錄位置，此位置在 Dirty Block 存在 buffer Pool 時就會決定
3. 最後把　Dirty Block flush 到 Disk 之前 postgresSQL 會檢查是否滿足此條件 `pd_lsn <= flushLSN` ，確保 Log 已經寫入 Disk 上才會把資料 flush 到資料庫中
4. 如果是 `synchronous_commit = ON` 代表同步提交，在 Transaction commit 時會把對應的 Tx Log 馬上 flush 進 Disk中才能返回成功

經過上面步驟我們就可以確保 先寫 Tx Log 歷程，後寫 Dirty Block

> 假如目前系統某個 Block 操作很頻繁，系統不會 block 等待資料寫入 是因為我們可以一直寫 (LSN–Log) 後面在補寫資料 (兩個不衝突 )

## 查看系統目前 LSN

經過前面說明我們可以理解 LSN 重要性，

我們可以透過 `select pg_current_wal_lsn();` 取得目前系統的 `LSN`，

```sql=
CREATE TABLE tt1(id int);
SELECT pg_current_wal_lsn();
insert into tt1 values (1);
SELECT pg_current_wal_lsn();
```

執行結果如下，能發現每次 DDL or DML 異動 LSN 都會增長，因為這是我們 Tx log 重要歷程流水號

```bash=
postgres=# CREATE TABLE tt1(id int);
CREATE TABLE
postgres=# SELECT pg_current_wal_lsn();
 pg_current_wal_lsn
--------------------
 0/E00D6C8
(1 row)

postgres=# insert into tt1 values (1);
INSERT 0 1
postgres=# SELECT pg_current_wal_lsn();
 pg_current_wal_lsn
--------------------
 0/E00D768
(1 row)

postgres=# SELECT pg_current_wal_lsn();
 pg_current_wal_lsn
--------------------
 0/E00D768
(1 row)
```

## 透過 pg_waldump 查看 WAL log

我們可以透過 [pg_waldump](https://www.postgresql.org/docs/10/pgwaldump.html)

在 `postgresql/data/pg_wal` 有一個資料夾裡面會放 WAL log 歷程記錄

![](https://i.imgur.com/oAARCvo.png)

我們可以透過 `pg_waldump` 查詢

* `-s`：查詢開始 LSN 編號
* `-e`：查詢結束 LSN 編號

```bash=
root@ce3649bb9b5e:/var/lib/postgresql/data/pg_wal#  pg_waldump  -s 0/E00D6C8 -e 0/E00D768

rmgr: Heap        len (rec/tot):     59/    59, tx:       1730, lsn: 0/0E00D6C8, prev 0/0E00D530, desc: INSERT+INIT off 1, blkref #0: rel 1663/13067/24677 blk 0
rmgr: Transaction len (rec/tot):     34/    34, tx:       1730, lsn: 0/0E00D708, prev 0/0E00D6C8, desc: COMMIT 2021-10-07 01:46:16.557911 UTC
rmgr: Standby     len (rec/tot):     54/    54, tx:          0, lsn: 0/0E00D730, prev 0/0E00D708, desc: RUNNING_XACTS nextXid 1731 latestCompletedXid 1729 oldestRunningXid 1730; 1 xacts: 1730
```

藉由此命令我們就可以很清楚看到 log 歷程，Commit Transation時間，資料新增到哪個區域

> 因為此資料表沒有 index 所以資料只有新增在 heap table 上

```bash
postgres=# SELECT pg_current_wal_lsn();
 pg_current_wal_lsn
--------------------
 0/E057FD0
(1 row)


postgres=# CREATE INDEX ix_id ON tt1(id);
CREATE INDEX
postgres=# SELECT pg_current_wal_lsn();
 pg_current_wal_lsn
--------------------
 0/E064950
(1 row)


postgres=# UPDATE tt1
postgres-# SET ID = ID + 1;
UPDATE 1
postgres=# SELECT pg_current_wal_lsn();
 pg_current_wal_lsn
--------------------
 0/E064A38
(1 row)
```

上面跑完後我們可以看到每個執行過程的 `LSN` 接著我們在透過 `pg_waldump` 來查詢相關紀錄資訊

```bash
root@ce3649bb9b5e:/var/lib/postgresql/data/pg_wal#  pg_waldump  -s  0/E057FD0 -e  0/E064A38

rmgr: Storage     len (rec/tot):     42/    42, tx:          0, lsn: 0/0E057FD0, prev 0/0E057F98, desc: CREATE base/13067/24690
rmgr: Standby     len (rec/tot):     42/    42, tx:       1770, lsn: 0/0E058018, prev 0/0E057FD0, desc: LOCK xid 1770 db 13067 rel 24690
rmgr: Heap        len (rec/tot):     54/  2282, tx:       1770, lsn: 0/0E058048, prev 0/0E058018, desc: INSERT off 2, blkref #0: rel 1663/13067/1259 blk 5 FPW
rmgr: Btree       len (rec/tot):     53/  2093, tx:       1770, lsn: 0/0E058938, prev 0/0E058048, desc: INSERT_LEAF off 100, blkref #0: rel 1663/13067/2662 blk 2 FPW
rmgr: Btree       len (rec/tot):     53/  5489, tx:       1770, lsn: 0/0E059168, prev 0/0E058938, desc: INSERT_LEAF off 37, blkref #0: rel 1663/13067/2663 blk 1 FPW
rmgr: Btree       len (rec/tot):     53/  3713, tx:       1770, lsn: 0/0E05A6F8, prev 0/0E059168, desc: INSERT_LEAF off 177, blkref #0: rel 1663/13067/3455 blk 4 FPW
rmgr: Heap        len (rec/tot):     54/  7182, tx:       1770, lsn: 0/0E05B580, prev 0/0E05A6F8, desc: INSERT off 48, blkref #0: rel 1663/13067/1249 blk 48 FPW
rmgr: Btree       len (rec/tot):     53/  2773, tx:       1770, lsn: 0/0E05D1A8, prev 0/0E05B580, desc: INSERT_LEAF off 96, blkref #0: rel 1663/13067/2658 blk 13 FPW
rmgr: Btree       len (rec/tot):     53/  3093, tx:       1770, lsn: 0/0E05DC80, prev 0/0E05D1A8, desc: INSERT_LEAF off 150, blkref #0: rel 1663/13067/2659 blk 9 FPW
rmgr: Heap        len (rec/tot):     54/   938, tx:       1770, lsn: 0/0E05E8B0, prev 0/0E05DC80, desc: INSERT off 5, blkref #0: rel 1663/13067/2610 blk 3 FPW
rmgr: Btree       len (rec/tot):     53/  2913, tx:       1770, lsn: 0/0E05EC60, prev 0/0E05E8B0, desc: INSERT_LEAF off 140, blkref #0: rel 1663/13067/2678 blk 1 FPW
rmgr: Btree       len (rec/tot):     53/  2913, tx:       1770, lsn: 0/0E05F7C8, prev 0/0E05EC60, desc: INSERT_LEAF off 141, blkref #0: rel 1663/13067/2679 blk 1 FPW
rmgr: Heap        len (rec/tot):     54/  2658, tx:       1770, lsn: 0/0E060348, prev 0/0E05F7C8, desc: INSERT off 43, blkref #0: rel 1663/13067/2608 blk 55 FPW
rmgr: Btree       len (rec/tot):     53/  7261, tx:       1770, lsn: 0/0E060DB0, prev 0/0E060348, desc: INSERT_LEAF off 224, blkref #0: rel 1663/13067/2673 blk 39 FPW
rmgr: Btree       len (rec/tot):     53/  7261, tx:       1770, lsn: 0/0E062A28, prev 0/0E060DB0, desc: INSERT_LEAF off 149, blkref #0: rel 1663/13067/2674 blk 45 FPW
rmgr: XLOG        len (rec/tot):     49/   109, tx:       1770, lsn: 0/0E0646A0, prev 0/0E062A28, desc: FPI , blkref #0: rel 1663/13067/24690 blk 1 FPW
rmgr: XLOG        len (rec/tot):     49/   129, tx:       1770, lsn: 0/0E064710, prev 0/0E0646A0, desc: FPI , blkref #0: rel 1663/13067/24690 blk 0 FPW
rmgr: Heap        len (rec/tot):    188/   188, tx:       1770, lsn: 0/0E064798, prev 0/0E064710, desc: INPLACE off 2, blkref #0: rel 1663/13067/1259 blk 5
rmgr: Transaction len (rec/tot):    242/   242, tx:       1770, lsn: 0/0E064858, prev 0/0E064798, desc: COMMIT 2021-10-07 09:59:29.422711 UTC; inval msgs: catcache 50 catcache 49 catcache 50 catcache 49 catcache 7 catcache 6 catcache 32 relcache 24677 relcache 24690 relcache 24690 relcache 24677 snapshot 2608
rmgr: Standby     len (rec/tot):     50/    50, tx:          0, lsn: 0/0E064950, prev 0/0E064858, desc: RUNNING_XACTS nextXid 1771 latestCompletedXid 1770 oldestRunningXid 1771
rmgr: Heap        len (rec/tot):     69/    69, tx:       1771, lsn: 0/0E064988, prev 0/0E064950, desc: UPDATE off 2 xmax 1771 ; new off 3 xmax 0, blkref #0: rel 1663/13067/24677 blk 0
rmgr: Btree       len (rec/tot):     64/    64, tx:       1771, lsn: 0/0E0649D0, prev 0/0E064988, desc: INSERT_LEAF off 2, blkref #0: rel 1663/13067/24690 blk 1
rmgr: Transaction len (rec/tot):     34/    34, tx:       1771, lsn: 0/0E064A10, prev 0/0E0649D0, desc: COMMIT 2021-10-07 09:59:29.458812 UTC
```

我們會發現上面 tx log 長很多，大部分都是在新建立 Btree 跟新增 Btree 中的資料

```bash
rmgr: Storage     len (rec/tot):     42/    42, tx:          0, lsn: 0/0E057FD0, prev 0/0E057F98, desc: CREATE base/13067/24690
rmgr: Standby     len (rec/tot):     42/    42, tx:       1770, lsn: 0/0E058018, prev 0/0E057FD0, desc: LOCK xid 1770 db 13067 rel 24690
rmgr: Heap        len (rec/tot):     54/  2282, tx:       1770, lsn: 0/0E058048, prev 0/0E058018, desc: INSERT off 2, blkref #0: rel 1663/13067/1259 blk 5 FPW
rmgr: Btree       len (rec/tot):     53/  2093, tx:       1770, lsn: 0/0E058938, prev 0/0E058048, desc: INSERT_LEAF off 100, blkref #0: rel 1663/13067/2662 blk 2 FPW
rmgr: Btree       len (rec/tot):     53/  5489, tx:       1770, lsn: 0/0E059168, prev 0/0E058938, desc: INSERT_LEAF off 37, blkref #0: rel 1663/13067/2663 blk 1 FPW
rmgr: Btree       len (rec/tot):     53/  3713, tx:       1770, lsn: 0/0E05A6F8, prev 0/0E059168, desc: INSERT_LEAF off 177, blkref #0: rel 1663/13067/3455 blk 4 FPW
rmgr: Heap        len (rec/tot):     54/  7182, tx:       1770, lsn: 0/0E05B580, prev 0/0E05A6F8, desc: INSERT off 48, blkref #0: rel 1663/13067/1249 blk 48 FPW
rmgr: Btree       len (rec/tot):     53/  2773, tx:       1770, lsn: 0/0E05D1A8, prev 0/0E05B580, desc: INSERT_LEAF off 96, blkref #0: rel 1663/13067/2658 blk 13 FPW
rmgr: Btree       len (rec/tot):     53/  3093, tx:       1770, lsn: 0/0E05DC80, prev 0/0E05D1A8, desc: INSERT_LEAF off 150, blkref #0: rel 1663/13067/2659 blk 9 FPW
rmgr: Heap        len (rec/tot):     54/   938, tx:       1770, lsn: 0/0E05E8B0, prev 0/0E05DC80, desc: INSERT off 5, blkref #0: rel 1663/13067/2610 blk 3 FPW
rmgr: Btree       len (rec/tot):     53/  2913, tx:       1770, lsn: 0/0E05EC60, prev 0/0E05E8B0, desc: INSERT_LEAF off 140, blkref #0: rel 1663/13067/2678 blk 1 FPW
rmgr: Btree       len (rec/tot):     53/  2913, tx:       1770, lsn: 0/0E05F7C8, prev 0/0E05EC60, desc: INSERT_LEAF off 141, blkref #0: rel 1663/13067/2679 blk 1 FPW
rmgr: Heap        len (rec/tot):     54/  2658, tx:       1770, lsn: 0/0E060348, prev 0/0E05F7C8, desc: INSERT off 43, blkref #0: rel 1663/13067/2608 blk 55 FPW
rmgr: Btree       len (rec/tot):     53/  7261, tx:       1770, lsn: 0/0E060DB0, prev 0/0E060348, desc: INSERT_LEAF off 224, blkref #0: rel 1663/13067/2673 blk 39 FPW
rmgr: Btree       len (rec/tot):     53/  7261, tx:       1770, lsn: 0/0E062A28, prev 0/0E060DB0, desc: INSERT_LEAF off 149, blkref #0: rel 1663/13067/2674 blk 45 FPW
rmgr: XLOG        len (rec/tot):     49/   109, tx:       1770, lsn: 0/0E0646A0, prev 0/0E062A28, desc: FPI , blkref #0: rel 1663/13067/24690 blk 1 FPW
rmgr: XLOG        len (rec/tot):     49/   129, tx:       1770, lsn: 0/0E064710, prev 0/0E0646A0, desc: FPI , blkref #0: rel 1663/13067/24690 blk 0 FPW
rmgr: Heap        len (rec/tot):    188/   188, tx:       1770, lsn: 0/0E064798, prev 0/0E064710, desc: INPLACE off 2, blkref #0: rel 1663/13067/1259 blk 5
rmgr: Transaction len (rec/tot):    242/   242, tx:       1770, lsn: 0/0E064858, prev 0/0E064798, desc: COMMIT 2021-10-07 09:59:29.422711 UTC; inval msgs: catcache 50 catcache 49 catcache 50 catcache 49 catcache 7 catcache 6 catcache 32 relcache 24677 relcache 24690 relcache 24690 relcache 24677 snapshot 2608
```

而在最後 Update 時會對於 Heap 跟 Btree 異動，原因是我們異動 ID 這個欄位，在 Btree 和 Heap 資料表都有

詳細原因我有寫一篇文章　[postgresql HOT (heap only tuple) update 深入淺出](https://isdaniel.github.io/postgresql-hotupdate-vacuum/)

```bash
rmgr: Heap        len (rec/tot):     69/    69, tx:       1771, lsn: 0/0E064988, prev 0/0E064950, desc: UPDATE off 2 xmax 1771 ; new off 3 xmax 0, blkref #0: rel 1663/13067/24677 blk 0
rmgr: Btree       len (rec/tot):     64/    64, tx:       1771, lsn: 0/0E0649D0, prev 0/0E064988, desc: INSERT_LEAF off 2, blkref #0: rel 1663/13067/24690 blk 1
rmgr: Transaction len (rec/tot):     34/    34, tx:       1771, lsn: 0/0E064A10, prev 0/0E0649D0, desc: COMMIT 2021-10-07 09:59:29.458812 UTC
```

### pg_waldump 屬性簡介

下面我針對於幾個我認為比較重要的欄位來說明

* rmgr: PostgreSQL 把 WAL 歸類許多不同的種類，除了 Heap 還有 Btree,Transaction....等等。我們可以透過 `pg_waldump  --rmgr=list` 查看所有資源
```bash
root@ce3649bb9b5e:/var/lib/postgresql/data/pg_wal# pg_waldump  --rmgr=list
XLOG
Transaction
Storage
CLOG
Database
Tablespace
MultiXact
RelMap
Standby
Heap2
Heap
Btree
Hash
Gin
Gist
Sequence
SPGist
BRIN
CommitTs
ReplicationOrigin
Generic
LogicalMessage
```
* tx: 1770 Transaction 編號(同一個編號代表同一個Transaction)
* lsn: 0/0E0649D0 目前記錄的LSN
* prev: 0/0E064950 前一個紀錄的LSN

### 小結

PostgreSQL WAL 用一句話來解釋是 先寫 Tx Log 歷程，後寫 Dirty Block ，但實際過程中會有許多細節需要考慮 (ex: checkpoint機制，資料庫突然崩潰...等等)

透過 `pg_waldump` 可以讓我們更好學習 WAL 檔案中的內容