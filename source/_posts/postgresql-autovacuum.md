---
title: Postgresql AutoVacuum 介紹
date: 2022-01-21 08:12:43
tags: [Postgresql,Vacuum,AutoVacuum]
categories: [Postgresql,Vacuum]
photos: 
    - "https://i.imgur.com/U1iC4ez.png"
keywords: Postgresql,Vacuum
---

## 前言

AutoVacuum 在 Postgresql 是一個很重要的機制(甚至可以說最重要也不為過)，但裡面有些地方需要了解今天就帶大家初探

## 資料 & 測試資料資訊

本次執行 Sample Data

```sql
CREATE TABLE T1 (
    ID INT NOT NULL PRIMARY KEY,
	val INT NOT NULL,
	col1 UUID NOT NULL,
	col2 UUID NOT NULL,
	col3 UUID NOT NULL,
	col4 UUID NOT NULL,
	col5 UUID NOT NULL,
	col6 UUID NOT NULL
);


INSERT INTO T1
SELECT i,
       RANDOM() * 1000000,
	   md5(random()::text || clock_timestamp()::text)::uuid,
	   md5(random()::text || clock_timestamp()::text)::uuid,
	   md5(random()::text || clock_timestamp()::text)::uuid,
	   md5(random()::text || clock_timestamp()::text)::uuid,
	   md5(random()::text || clock_timestamp()::text)::uuid,
	   md5(random()::text || clock_timestamp()::text)::uuid
FROM generate_series(1,20000000) i;


CREATE TABLE T2 (
    ID INT NOT NULL PRIMARY KEY,
	val INT NOT NULL,
	col1 UUID NOT NULL,
	col2 UUID NOT NULL,
	col3 UUID NOT NULL,
	col4 UUID NOT NULL,
	col5 UUID NOT NULL,
	col6 UUID NOT NULL
);

INSERT INTO T2
SELECT i,
       RANDOM() * 1000000,
	   md5(random()::text || clock_timestamp()::text)::uuid,
	   md5(random()::text || clock_timestamp()::text)::uuid,
	   md5(random()::text || clock_timestamp()::text)::uuid,
	   md5(random()::text || clock_timestamp()::text)::uuid,
	   md5(random()::text || clock_timestamp()::text)::uuid,
	   md5(random()::text || clock_timestamp()::text)::uuid
FROM generate_series(1,1000000) i;

vacuum ANALYZE T1;
vacuum ANALYZE T2;
```

查詢 sample code

```sql
EXPLAIN (ANALYZE,TIMING ON,BUFFERS ON)
SELECT t1.*
FROM T1 
INNER JOIN T2 ON t1.id = t2.id 
WHERE t1.id < 1000000 
```

此次查詢如期走 `Merge Join`

```
"Gather  (cost=1016.37..30569.85 rows=53968 width=104) (actual time=0.278..837.297 rows=999999 loops=1)"
"  Workers Planned: 2"
"  Workers Launched: 2"
"  Buffers: shared hit=38273 read=21841"
"  ->  Merge Join  (cost=16.37..24173.05 rows=22487 width=104) (actual time=11.993..662.770 rows=333333 loops=3)"
"        Merge Cond: (t2.id = t1.id)"
"        Buffers: shared hit=38273 read=21841"
"        ->  Parallel Index Only Scan using t2_pkey on t2  (cost=0.42..20147.09 rows=416667 width=4) (actual time=0.041..69.947 rows=333333 loops=3)"
"              Heap Fetches: 0"
"              Buffers: shared hit=6 read=2732"
"        ->  Index Scan using t1_pkey on t1  (cost=0.44..48427.24 rows=1079360 width=104) (actual time=0.041..329.874 rows=999819 loops=3)"
"              Index Cond: (id < 1000000)"
"              Buffers: shared hit=38267 read=19109"
"Planning:"
"  Buffers: shared hit=4 read=8"
"Planning Time: 0.228 ms"
"Execution Time: 906.760 ms"
```

假如更新如多資料，但未觸發臨界值

```sql
update T1
set id = id + 100000000
where id < 1000000
```

在查詢可以發現使用執行計畫，還是 `Merge Join` (但依照現在資料量，理當不走 `Merge Join`) 那是甚麼原因造成的呢?

那是因為目前統計資訊並未與最新資料量對齊

```text
"Gather  (cost=1016.37..30707.83 rows=53968 width=104) (actual time=51.403..55.517 rows=0 loops=1)"
"  Workers Planned: 2"
"  Workers Launched: 2"
"  Buffers: shared hit=8215"
"  ->  Merge Join  (cost=16.37..24311.03 rows=22487 width=104) (actual time=6.736..6.738 rows=0 loops=3)"
"        Merge Cond: (t2.id = t1.id)"
"        Buffers: shared hit=8215"
"        ->  Parallel Index Only Scan using t2_pkey on t2  (cost=0.42..20147.09 rows=416667 width=4) (actual time=0.024..0.024 rows=1 loops=3)"
"              Heap Fetches: 0"
"              Buffers: shared hit=8"
"        ->  Index Scan using t1_pkey on t1  (cost=0.44..50848.71 rows=1133330 width=104) (actual time=6.710..6.710 rows=0 loops=3)"
"              Index Cond: (id < 1000000)"
"              Buffers: shared hit=8207"
"Planning:"
"  Buffers: shared hit=2745"
"Planning Time: 3.938 ms"
"Execution Time: 55.550 ms"
```

### ANALYZE & VACUUM

* ANALYZE：
  1. 主要是更統計資訊，可以提供ＱＯ更好執行計畫
  2. 建立 visibility map 檔案
* VACUUM：
  1. 將 dead tuple 空出來，但硬碟空間不會釋放出來（如果要釋放硬碟空間需要使用 FULL Vacuum)
  2. 更新 transaction ID 序號

### 使用 ANALYZE & VACUUM 後續

執行 `vacuum ANALYZE T1;`，再次執行就可發現目前執行計畫就很正確了，跑 `Nested Loop` 演算法，並且只有 read 3 個 block & 執行時間也大幅降低

```text
"QUERY PLAN"
"Nested Loop  (cost=0.86..8.90 rows=1 width=104) (actual time=0.004..0.004 rows=0 loops=1)"
"  Buffers: shared hit=3"
"  ->  Index Scan using t1_pkey on t1  (cost=0.44..4.46 rows=1 width=104) (actual time=0.003..0.003 rows=0 loops=1)"
"        Index Cond: (id < 1000000)"
"        Buffers: shared hit=3"
"  ->  Index Only Scan using t2_pkey on t2  (cost=0.42..4.44 rows=1 width=4) (never executed)"
"        Index Cond: (id = t1.id)"
"        Heap Fetches: 0"
"Planning:"
"  Buffers: shared hit=20"
"Planning Time: 0.232 ms"
"Execution Time: 0.027 ms"
```

所以擁有正常的統計資訊，可以讓QO選擇正確決策

## Auto vacuum 時機

如果不了解 Auto vacuum 觸發時機的人會詢問， Postgresql 不是會自動幫我們做 `vacuum` 為什麼上面例子還需要自己執行?

> 因為上面案例還沒觸發閥值，所以不會做 Vacuum

我們可以用 `pg_settings` 查看當前 postgres 關於 AutoVacuum 關鍵資訊設定

```sql
select name,setting
from pg_settings 
where name in ('autovacuum_vacuum_scale_factor','autovacuum_analyze_scale_factor','autovacuum_analyze_threshold','autovacuum_vacuum_threshold');
```

AutoVacuum 主要是由下面兩個公式判斷是否需要執行 vacuum 或 analyze，會有一個類似累積池概念，累績目前資料表 dead tuple 數量

```text
觸發 auto_analyze = autovacuum_analyze_scale_factor * dead tuple count + autovacuum_analyze_threshold
觸發 auto_vacuum = autovacuum_vacuum_scale_factor * dead tuple count + autovacuum_vacuum_threshold
```

---
| name                            | setting |
|---------------------------------|---------|
| autovacuum_analyze_scale_factor | 0.05    |
| autovacuum_analyze_threshold    | 50      |
| autovacuum_vacuum_scale_factor  | 0.1     |
| autovacuum_vacuum_threshold     | 50      |

舉個例子上面 `T1` 資料表目前有 `20000000` 筆資料

`0.05 * 20000000 + 50 = 1000050` 所以觸發 `auto_analyze` 資料表需要有 `1000050` 筆 dead tuple 資料

`0.1 * 20000000 + 50 = 2000050` 所以觸發 `auto_vacuum` 資料表需要有 `2000050` 筆 dead tuple 資料

我們能發現一個問題是如果資料量越大，觸發的條件越困難....

所以假如線上執行計畫跑掉可以利用下面語法查詢，上次更新執行 vacuum 時間

```sql
SELECT
  schemaname, relname,
  last_vacuum, last_autovacuum,
  --vacuum_count, autovacuum_count,
  last_analyze,last_autoanalyze
FROM pg_stat_user_tables
where relname = 't2';
```

![](https://i.imgur.com/OadcNdT.png)

### By Table 設定 autovacuum

因為每張資料表都有不一樣情境邏輯．postgres 可以針對每個 Table 設定閥值

我把們 t2 的 `auto_analyze` & `auto_vacuum` 閥值改成修改 1000，讓 autovacuum 更容易觸發

> 為了更好理解我把 `autovacuum_vacuum_threshold` 和 `autovacuum_analyze_threshold` 設定成 0

```sql
ALTER TABLE t2 SET (autovacuum_vacuum_scale_factor = 0.001);
ALTER TABLE t2 SET (autovacuum_vacuum_threshold = 0);
ALTER TABLE t2 SET (autovacuum_analyze_scale_factor = 0.001);
ALTER TABLE t2 SET (autovacuum_analyze_threshold = 0);
```

* autovacuum_analyze = `0.001 * 1000000 + 0 = 1000`
* autovacuum_vacuum = `0.001 * 1000000 + 0 = 1000`

我利用下面語法查詢，了解某張資料表 dead tuple 數量

```sql
select relname,schemaname,n_dead_tup as "死元組數",
(case  when n_live_tup > 0 then 
	 n_dead_tup::float8/n_live_tup::float8
else
	 0
end) as "死/活元組的比例"
from pg_stat_all_tables
where relname = 't2'
```

換句話說 t2 資料表只需要有超過 1000 個 dead tuple 就會出發更新 (就類似所謂的校正回歸XDD)

```sql
UPDATE t2
SET val = 20000
WHERE id < 1002
```

在過一陣子後 postgrsql console log 會在背景執行 autovacuum 並把那些資料 mark

![](https://i.imgur.com/4hec84Q.png)

假如我們更新的資料還沒到臨界值就會造成，造成統計資訊和 dead tuple 過多

```sql
UPDATE t2
SET val = 100
WHERE id <= 999
```

## 小結

經過查找一系列資料跟比較之前使用 sql-server 經驗，postgres 可以針對每個 Table 特性設定他適合的 `autovacuum` 閥值，來定期更新統計資訊

執行 `vacuum` 會針對資料表上 `SHARE UPDATE EXCLUSIVE` lock 且會有少許 IO 操作

> 雖然資料表可以照常 CRUD 但還是對於資料表會有些許負擔

所以我會建議做 vacuum 時，最好在系統離峰，但如果統計值偏差很大要更新還是更新不然會造成問題更大

至於是否要 by table 去做 autovacuum 閥值設定，就可以看情況

另外假如有些 Table 大部分都在新增資料，很少異動(Delete or Update)，這可能會造成 Dead Tuple 量較難觸發 Auto Vacuum，這時候就可以考慮使用 Daily Vacuum 來確保統計資訊有更新