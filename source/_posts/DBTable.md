---
title: SqlServer資料表深入淺出
date: 2020-01-26 23:10:43
tags: [DataBase,Turning,Sql-server]
categories: [DataBase,Turning]
---
# Agenda<!-- omit in toc -->
- [前文](#%e5%89%8d%e6%96%87)
- [關於Page](#%e9%97%9c%e6%96%bcpage)
- [Heap資料表](#heap%e8%b3%87%e6%96%99%e8%a1%a8)
  - [IAM(index allocation map)](#iamindex-allocation-map)
- [forwarding pointer](#forwarding-pointer)
  - [forwarding pointer(Demo)](#forwarding-pointerdemo)
  - [RID Lookup](#rid-lookup)
- [dbcc page 語法](#dbcc-page-%e8%aa%9e%e6%b3%95)

## 前文

本篇會跟大家對於`SQL-Server`資料表深入淺出的介紹.

## 關於Page

資料會存在Page中
而一個`Page`大小為 8K/Page => 8092(8060 bytes)

> 每個Page除了存取資料還會存放一些`MetaData`，我們可以先當作是每個Page大小是8K

## Heap資料表

如果一張資料表沒有`Clustered Index`就會為Heap資料表，這意味著`Heap`資料表的資料不會有排序一直把資料新增進資料表中，`Heap`資料表`Insert`資料快

> 適合使用在Log資料表、Event資料表、稽核資料表....一直新增資料但比較少查詢表

### IAM(index allocation map)

當Heap資料表要搜尋資料`SQL-Server`透過IAM(index allocation map)去尋要掃描Page範圍，因為IAM會以範圍存在於檔案中的順序來表示它們，這代表循序的堆積掃描都將依檔案順序進行。

> 使用IAM分頁設定掃描順序也表示堆積中的資料列通常不會依插入順序傳回

IAM Page在讀取資料的示意圖

可以看到讀取Page中資料順序和新增資料順序不一樣.

![](https://i.imgur.com/Qw8Kx1q.png)

## forwarding pointer

假如在Heap資料表更新欄位資料，就可能會造成`forwarding pointer`

製造`forwarding pointer`是因為原本`Page`塞不下更新後資料就會先把資料搬到另一個新建立`Page`上並在原本`Page`建立一個類似指標東西指向它.

> 這個指標會存在原本的Page大小是16 byte

![](https://i.imgur.com/5drfCFZ.png)

### forwarding pointer(Demo)

一個Page大小是8k

我們建立一個`ForwardingPointers`資料表，並且新增3筆資料進去

> 其中有一筆資料`replicate('2',7800)`佔據78xxBytes.

```sql
create table dbo.ForwardingPointers
(
 ID int not null,
 Val varchar(8000) null
);

insert into dbo.ForwardingPointers(ID,Val)
values(1,null),(2,replicate('2',7800)),(3,null);
```

新增完後我們利用`DMV`查詢目前`ForwardingPointers`使用的Page數量可以看到只使用一頁

> 因為目前資料大小可以放在同一個Page

```sql
select page_count, avg_record_size_in_bytes, avg_page_space_used_in_percent
 ,forwarded_record_count
from sys.dm_db_index_physical_stats(db_id(),object_id(N'dbo.ForwardingPointers'),0
 ,null,'DETAILED');
```

![](https://i.imgur.com/7F9Kmcg.png)

我們將`dbo.ForwardingPointers`另外兩個
`Val IS NULL`更新成`replicate('2',7800)`

```SQL
UPDATE dbo.ForwardingPointers
SET Val = replicate('2',7800)
WHERE Val IS NULL
```

再查詢一次`dbo.ForwardingPointers`使用Page，能發現已經使用了3個Page(因為已經觸發`forwarding pointer`)

已經把這次更新的資料搬到新Page上，因為更新後的資料大小已經超過目前Page可以負擔的大小

![](https://i.imgur.com/ZcgdAhc.png)

### RID Lookup

在[資料庫索引深入淺出(一)](https://isdaniel.github.io/DBIndex-1/)有說，資料表沒有`Clustered Index`且使用`Index`所有查詢欄位不包含在`Converting Index`中就會透過`RID Lookup`查找確切Page上的Row(藉由Row-Id)

> 此資料表是`Heap`資料表在`NonClustered Index`中會存放`Heap RID`

![](https://i.imgur.com/e87YROd.png)

> 記得在`DBCC IND`取得的PID是要找`PageType = 2`

```sql
DBCC traceon (3604);
DBCC IND ([Your DataBase],T1,-1)
DBCC PAGE([Your DataBase],1,[Your PID],3)
```

透過`DBCC`可以看到查找資料表Page資料可以顯示如下結果集.

如果是Heap資料表會有一個欄位是`Heap RID(Key)`欄位.

> HEAP RID:0x40110F0001002900
大小 8 bytes
* FID（2 bytes）
* PID（4 bytes）
* SLOT（2 bytes）

可藉由下面的Script來拆解`Heap RID(Key)`資料

```sql
--轉換RID為 FID:PID:slot格式
declare @Heaprid binary(8)
set @Heaprid = 0x40110F0001002900
select [FID:PID:Slot]=      
       CONVERT (VARCHAR(5),
       CONVERT(INT, SUBSTRING(@Heaprid, 6, 1)
       + SUBSTRING(@Heaprid, 5, 1)))
     + ':'
     + CONVERT(VARCHAR(10),
       CONVERT(INT, SUBSTRING(@Heaprid, 4, 1)
        + SUBSTRING(@Heaprid, 3, 1)
        + SUBSTRING(@Heaprid, 2, 1)
        + SUBSTRING(@Heaprid, 1, 1)))
     + ':'
          + CONVERT(VARCHAR(5),
          CONVERT(INT, SUBSTRING(@Heaprid, 8, 1)
          + SUBSTRING(@Heaprid, 7, 1)))
```

透過上面Script我們可以得到`1:987456:41`

我們在透過

```sql
DBCC PAGE(AdventureWorks2012_Data,1,987456,3)
```

就可以查找到我們要的資料在`PID = 987456`這個Page中.

## dbcc page 語法

下面語法透過`dbcc page`可以了解資料表存取資訊

```SQL
/* 建立測試資料表 */
drop table if exists dbo.T;
create table dbo.T
(
	Name	nvarchar(10) not null,
	EmpID	int not null,
	CouID	int not null,
	Locate	nchar(2) not null,
	Dist	nchar(1) not null,
	BDate	datetime not null,
	Address	nvarchar(100) null,
	CheckID	int not null
);
go

/* 寫入測試資料 */
insert into dbo.T
	(Name, EmpID, CouID, Locate, Dist, BDate, Address, CheckID)
values
	(N'Daniel',1,950,N'TW',N'M','2020-01-01 00:00:00',N'Taipei City',9);
go

/* 先取得Page的位置 */
dbcc ind ('DEMO','dbo.T', -1);
/* 16776 - 不會一樣, 依照產出的資料配置dbcc page */

/* 查看Page內容 */
dbcc traceon (3604);
dbcc page ('DEMO', 1, 16776, 3)
dbcc traceoff (3604);
```

PageType – the page type. Some common ones are:

* 1 – data page
* 2 – index page
* 3 and 4 – text pages
* 8 – GAM page
* 9 – SGAM page
* 10 – IAM page
* 11 – PFS page


```sql
dbcc traceon (3604);
DBCC IND ( { ‘dbname’ | dbid }, { ‘objname’ | objid },{ nonclustered indid | 1 | 0 | -1 | -2 } [, partition_number] )
```

* 第一個參數是數據庫名或數據庫ID。
* 第二個參數是數據庫中的對象名或對象ID，對象可以是表或者索引視圖。
* 第三個參數是一個非聚集索引ID或者 1, 0, 1, or 2. 值的含義：
    * 0: 只顯示對象的in-row data頁和 in-row IAM 頁。
    * 1: 顯示對象的全部頁, 包含IAM 頁, in-row數據頁, LOB 數據頁row-overflow 數據頁 . 如果請求的對象含有聚集所以則索引頁也包括。
    * -1: 顯示全部IAM頁,數據頁, 索引頁 也包括 LOB 和row-overflow 數據頁。
    * -2: 顯示全部IAM頁。
