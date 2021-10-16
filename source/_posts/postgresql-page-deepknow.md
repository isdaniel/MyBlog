---
title: postgresql Page 深入淺出
date: 2021-09-28 00:30:11
tags: [DataBase,Turning,postgresql]
categories: [Turning,postgresql]
photos: 
    - "https://i.imgur.com/mYYjXFg.jpg"
keywords: DataBase,Turning,postgresql
description: 因為工作需要最近在研究 postgresql DB，發現跟 sql-server 相比有許多不同之處，所以一開始就先研究 Page 差別，沒想到還真的有不少細節上的差異，在postgresql DB Page size 預設是 8KB
---

## 前言

因為工作需要最近在研究 postgresql DB，發現跟 sql-server 相比有許多不同之處，所以一開始就先研究 Page 差別，沒想到還真的有不少細節上的差異

在postgresql DB Page size 預設是 8KB

我們想要看page使用大小在 Sql-Server 可以用 `DBCC`命令在 postgresql DB 沒有 `DBCC` 還好有其他方式可以查看 Page 儲存原理

如果要了解存儲怎麼辦呢?

## 關於 page 存儲

使用sample data

```sql
CREATE TABLE t1 (id int PRIMARY KEY);

insert into t1 select generate_series(1,2000);
insert into t1 select generate_series(2001,4000);
```

建立完表後我們透過 `\d+ t1` 指令查看資料表訊息，可以看到PK成功被建立

```cmd
postgres=# \d+ t1
                                    Table "public.t1"
 Column |  Type   | Collation | Nullable | Default | Storage | Stats target | Description
--------+---------+-----------+----------+---------+---------+--------------+-------------
 id     | integer |           | not null |         | plain   |              |
Indexes:
    "t1_pkey" PRIMARY KEY, btree (id)
```

查看 `pg_class` 儲存訊息發現，我明明是儲存 4000 筆 int 資料，理論上會存放 2 左右的Page number (int 4 byte)

4 byte * 4000 ~= 16kB

為什麼數量分別是 table page = 18,index page = 13

```sql=
SELECT reltuples,relpages,relname
FROM pg_class
WHERE  relname IN ('t1','t1_pkey');
```

查詢結果如下圖

![](https://i.imgur.com/BG5gFsL.png)

### pageinspect extension

想要查看 postgresql DB 底層 Page [pageinspect](https://www.postgresql.org/docs/12/pageinspect.html) extension.

如下語法

```sql
create extension pageinspect -- 打開可以查看底層 Page 功能，需要有 admin 權限

SELECT *
FROM bt_page_stats('ix_t2', 1); --查看 Index 統計資訊分佈

SELECT *
FROM bt_page_items('ix_t2', 1); --查看 Index 儲存 Data & Refer to Heap Data Address Info

SELECT * 
FROM heap_page_items(get_raw_page('t2', 0)); --查看Heap Table 資料
```

pageinspect extension 說明如下，可以查看底層 page 資料

>　The pageinspect module provides functions that allow you to inspect the contents of database pages at a low level, which is useful for debugging purposes. All of these functions may be used only by superusers.

```sql
SELECT * 
FROM heap_page_items(get_raw_page('t1', 0));
```

我們使用 `heap_page_items` function就可以查看底層heap page 資訊.

能發現每一個 Page 都只存 226 個 int，但226 * 4 只等於 904

![](https://user-images.githubusercontent.com/9159452/134297549-de401b2f-3099-45ed-8520-18c50ff0a115.png)

接著我們利用 `bt_page_items` 查看 b+tree Page 內部儲存資料

```sql
SELECT * 
FROM bt_page_items('t1_pkey', 1);
```

b+tree 有幾個重要欄位

* t_data：欄位是存放 Index key 資料
* t_ctid：欄位是存放 lookup 回 heap table 位置

![](https://user-images.githubusercontent.com/9159452/134297563-dfebcaf3-1bd4-4a4c-8766-8636fce4e80b.png)

![](https://i.imgur.com/yX4Uzty.png)

我們可以利用 postgresql DB table 的 CTID 欄位來查詢.

發現 `CTID = '(1,1)'` 的確是 227 證實我上面說的

```sql
SELECT CTID,*
FROM t1 
WHERE CTID = '(1,1)';
```

這邊介紹 Page 存放資訊原理想要知道 為什麼 Page 明明是8KB但存的資料卻不到，這邊就要來說明 postgresql 對於 tuple 儲存方式

### Database Page Layout

這邊我們要介紹 Page 中兩種重要的 metadata

* PageHeaderData Layout：每張 page 都有一份資料
 ![](https://i.imgur.com/CXzHfHU.png)
8 + 12 `(2*6)` + 4 = 24 bytes
* HeapTupleHeaderData Layout：每個 tuple row 都有自己的 Header metadata
 ![](https://i.imgur.com/bdl4SrM.png)
16 `(4*4)` + 6 + 4 + 1 + 1 `(NullBitMap)` = 28

![](https://i.imgur.com/qPYa76M.png)

> ItemIdData : Array of item identifiers pointing to the actual items. Each entry is an (offset,length) pair. 4 bytes per item.

tuple 除了有 TupleHeader + RealData + ItemIdData

我們可以利用 `SELECT pg_column_size(row(1));` 查看

![](https://i.imgur.com/0FTwHHe.png)

> `ItemIdData (4) + TupleHeader (28) + RealData (4)`

經過上面資訊我們可以推導出 `36 * 226 + 24 = 8160`

證明226列tuple的原理

### 關於 lp_len

所以每個 tuple 會存放 16 `(4*4)` + 6 + 4 + 1 + 1 `(NullBitMap)` + 4 `(RealDat)` = 32

> 此外 postgressql DB 用 t_bits 來儲存 null 數值，另外 tuple 大小會對於 8 bit 倍數進行對齊

關鍵資訊我在這邊標註跟提供連結有興趣的在自己研究

```c
#define MAXALIGN(LEN) TYPEALIGN(MAXIMUM_ALIGNOF, (LEN))
//....
MAXIMUM_ALIGNOF                          => 8,
```

> https://github.com/postgres/postgres/blob/e529b2dc37ac80ccebd76cdbb14966d3b40819c9/src/tools/msvc/Solution.pm#L457
> https://github.com/postgres/postgres/blob/c30f54ad732ca5c8762bb68bbe0f51de9137dd72/src/include/c.h#L745-L757

我們再使用一個例子來了解

```sql
CREATE TABLE tt1 (a char(2),b int,c char(1));

INSERT INTO tt1 (a,b,c) 
SELECT 'aa',id,'c'
FROM generate_series(1,2000) v(id);
```

使用 `heap_page_items` 查詢如下圖

```sql
SELECT *                                
FROM heap_page_items(get_raw_page('tt1', 0));
```

![](https://i.imgur.com/corjLq6.png)

`lp_len` = 27 (tupleHeader) + 7 = 34 + 6 (NullBitMap) => 40

> `lp_len` 下一個 8 倍數就是 40 byte，8152-8112 = 40 就能證明我上面說的

## TOAST

下面有個案例關於 `text` 儲存 Pages 上

```sql
CREATE TABLE t8 (id char(2100) PRIMARY KEY);

CREATE UNIQUE INDEX  ix_t8 on t8(id);

insert into t8 (id) values (repeat('A',2100));
insert into t8 (id) values (repeat('B',2100));
insert into t8 (id) values (repeat('C',2100));
insert into t8 (id) values (repeat('D',2100));
insert into t8 (id) values (repeat('E',2100));
insert into t8 (id) values (repeat('F',2100));
insert into t8 (id) values (repeat('G',2100));
insert into t8 (id) values (repeat('H',2100));

--更新統計資訊
analyze t8;
```

利用 `pg_class` 資料表查詢我們資料 Pages 分布，看到明明已經新增8筆 2100 bytes char資料

`8 * 2100 byte = 16.8 Kb ~= 3 page` 才對，但下圖顯示不管是 heap table 還是 b+tree 都不到3 pages.

這是因為在

```sql
select relname,relpages,reltuples,relkind,oid  
from pg_class 
where relname in ('t8','t8_pkey');
```

![](https://i.imgur.com/3nvd96Y.png)

我們利用`\d+`查詢一下，能發現資料表 `char(2100)` 使用 Storage = extended

```cmd
postgres-# \d+ t8
                                         Table "public.t8"
 Column |      Type       | Collation | Nullable | Default | Storage  | Stats target | Description
--------+-----------------+-----------+----------+---------+----------+--------------+-------------
 id     | character(2100) |           | not null |         | extended |              |
Indexes:
    "t8_pkey" PRIMARY KEY, btree (id)
    "ix_t8" UNIQUE, btree (id)
```

因為 postgresql DB 不支援跨表存放 tuple(不像是 sql-server 有 Forwarding Pointers )，所以對於大資料儲存衍伸出 `TOAST` 概念，`TOAST`壓縮資料的壓縮技術是 LZ 系列壓縮技術中相當簡單且非常快速的方法

儲存 TOAST 欄位有四種不同策略：

* PLAIN
* EXTENDED
* EXTERNAL
* MAIN

因為預設使用 extended 會幫我們壓縮並存放在 toast 資料表區段，不方便我們查看資料存儲原理

我們可以透過下面語法查詢 t8 資料表上 toast 資訊

```sql
SELECT oid::regclass,
       reltoastrelid::regclass,
       pg_relation_size(reltoastrelid) AS toast_size
FROM pg_class
WHERE relkind = 'r'
  AND reltoastrelid <> 0
  AND oid::regclass = 't8'::regclass;
```

所以這邊我會建議大家改成使用 external 儲存 id 欄位，因為這個模式會把資料存在 toast 且不會壓縮資料.

> 修改 column 儲存模式不會回朔修改之前的資料，所以在下面範例中我把資料清除改完模式再重新塞入

```sql
alter table t8 alter id set storage external;

truncate t8;

insert into t8 (id) values (repeat('A',2100));
insert into t8 (id) values (repeat('B',2100));
insert into t8 (id) values (repeat('C',2100));
insert into t8 (id) values (repeat('D',2100));
insert into t8 (id) values (repeat('E',2100));
insert into t8 (id) values (repeat('F',2100));
insert into t8 (id) values (repeat('G',2100));
insert into t8 (id) values (repeat('H',2100));
```

一樣透過下面語法查詢

```sql
SELECT oid::regclass,
       reltoastrelid::regclass,
       pg_relation_size(reltoastrelid) AS toast_size
FROM pg_class
WHERE relkind = 'r'
  AND reltoastrelid <> 0
  AND oid::regclass = 't8'::regclass;
```

利用完語法查完，在我電腦上儲存 t8的toast 是 `pg_toast_34504` 資料表

![](https://i.imgur.com/FKDZFFz.png)

所以我們可以利用下面語法查詢 toast 資料表資訊

```sql
select chunk_id,chunk_seq,length(chunk_data)
from pg_toast.pg_toast_34504
```

我們會發現在 `pg_toast` 中的資料只要超過 2KB 就會自動幫我們切割，切割完的資料會規在同一個 `chunk_id` 中並利用 `chunk_seq` 來還原原始資料.

> 我們這邊新增8筆 2100 byte 的資料，因為 postgresql toast 預設使用 2KB 就會切片

![](https://i.imgur.com/r8lkQvi.png)

## 小結

經過本篇文章希望可以幫助大家了解 postgresql DB block (Page) 儲存原理，沒想到 MVCC 會造成儲存上那麼大消耗.

用開車來比較 sql-server 和 postgresql DB 我個人感覺 sql-server 像是自排車很多東西幫你封裝好不能動使用起來比較簡單，postgresql DB 像是手排車可以調整的地方必較多，效能就取決於操作者用的好效能可以很棒，用的不好會很慘...

> 我上面說的是成本因子部分

會有本篇文章是因為之前對於sql server page 有一定了解，但最近在使用 postgresql DB 的 Page 發現跟 sqlserver 有差異，所以在[網路上詢問](https://www.facebook.com/groups/pgsql.tw/posts/2648311168807477/?comment_id=2648357518802842&reply_comment_id=2653135421658385&notif_id=1631765518157440&notif_t=group_comment&ref=notif)，感協 張友謙大大 熱心回答釐清整個脈絡.
