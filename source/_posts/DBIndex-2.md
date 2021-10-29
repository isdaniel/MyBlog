---
title: 資料庫索引深入淺出(二)
date: 2020-01-20 23:10:43
tags: [DataBase,Turning,sql-server,Index]
categories: [DataBase,Turning]
keywords: DataBase,Turning,sql-server,Index
---
# Agenda<!-- omit in toc -->
- [前文](#前文)
- [Covering Index](#covering-index)
	- [加入INCLUDE欄位含意](#加入include欄位含意)
	- [案例解說](#案例解說)
- [Filter Index](#filter-index)
- [filter index的限制](#filter-index的限制)
- [Index Intersection](#index-intersection)
- [Primary Key](#primary-key)
- [選擇Clustered Index要訣](#選擇clustered-index要訣)

## 前文

本系列文章

- [資料庫索引深入淺出(一)](https://isdaniel.github.io/dbindex-1/)
- [資料庫索引深入淺出(二)](https://isdaniel.github.io/dbindex-2/)

兩種基本索引

- Clustered Index(叢集索引)
- NonClustered Index(非叢集索引)

兩種`Lookup`(如果`NonClustered Index`無法滿足查詢結果執行)

- RID Lookup
- Key Lookup

本篇會介紹其他種類`Index`

## Covering Index

我們先來看看`Covering Index`語法.

最主要使在`NONCLUSTERED INDEX`後面加上`INCLUDE`欄位.

```sql
CREATE NONCLUSTERED INDEX IX_T_Id_Convering on dbo.T(
	id
) INCLUDE (
	UserId,
	UserGroup
)
```

### 加入INCLUDE欄位含意

在`NONCLUSTERED INDEX`把`Column`加入`INCLUDE`區域後此`NONCLUSTERED INDEX`會把此欄位資料加入至子頁層.之後如果要查找資料時就不用在`Lookup`回去

> 所以我們可以把`Covering Index`當作是偽`CLUSTERED INDEX`.
> 如果每次只需要`SELECT`少部分欄位且範圍較大又須排序，`Covering Index`執行效率會比`CLUSTERED INDEX`來的快.

`Covering`欄位只會在子頁層儲存資料，並不會在中葉層儲存相關資訊。

儲存方式如下圖會把資料存在子頁層中，並不會把Include資料存在中葉層

![](https://i.imgur.com/8TvUoRY.png)

適合`Covering Index`很適合用在查出來`Column`不需要當作`Key`

### 案例解說

樣本資料一樣使用上一篇的資料

```sql
SELECT *
FROM dbo.T
WHERE id = 10000

SELECT *
FROM dbo.T with(index(IX_T_Id))
WHERE id = 10000
```

有兩段語法一段是有使用`Hint`，執行出來後會有兩個執行計畫.

> 第一個執行計畫是上面的語法,第二個執行計畫是下面的語法

![](https://i.imgur.com/ivgZPGm.png)

建立完`Convering Index`後我們使用的查詢就會變成只使用`Seek`，而且在執行成本也大幅降低.

Convering Index有幾個缺點

1. 假如在此次update有包含index include columns時,此次修改也會對於Index子頁層進行資料更新，這會增加I/O和Transaction log.
2. 因為會把include columns增加在NonClustered Index子頁層這會增加硬碟儲存Index的額外空間.

所以建議只新增有用到的include columns.

`Covering`欄位只會在子頁層儲存資料，並不會在中葉層儲存相關資訊。

儲存方式如下圖會把資料存在子頁層中，並不會把Include資料存在中葉層

![](https://i.imgur.com/8TvUoRY.png)

## Filter Index

在SQL-Server 2008之後,支援使用filter index.他可以節省index大小和維護成本

`Filter Index`語法就是在最後寫`where`條件

```sql
CREATE NONCLUSTERED INDEX FIX_T_Id_UserGroup on  dbo.T(
	id
) INCLUDE (
	UserId,
	UserGroup
)
where UserGroup = 8
```

上面語法意思是只針對於`UserGroup = 8`的`Row`建立資料在子頁層，`Filter Index`主要是提升維護性和降低`Index`大小.

## filter index的限制

1. filter index只支援**簡單過濾條件**，在`where`查詢如果有使用到`OR`、function、計算欄位,可能會讓filter index失效
2. 因為sql-server會cache執行計畫,所以filter index無法在參數化查詢發揮作用

關於第二點我們可以看下面查詢,假如我們建立一個fitler index(`IDX_Data_Unprocessed_Filtered`)因為我們使用參數化查詢所以導致此index無法正常發揮

```sql
create nonclustered index IDX_Data_Unprocessed_Filtered
on dbo.Data(RecId)
include(Processed)
where Processed = 0;

select top 1000 RecId
from dbo.Data
where Processed = @Processed
order by RecId; 
```

所以假如此查詢有使用到filter index請在查詢使用硬變數或是可以使用`option(recompile)`不讓執行計畫被cache.

```sql
select top 1000 RecId
from dbo.Data
where Processed = 0
order by RecId; 

select top 1000 RecId
from dbo.Data
where Processed = @Processed
order by RecId; 
option(recompile)
```

> 注意:如果有使用到`Filter Index`的`SP`或`Script`，如果沒有加上`SET QUOTED_IDENTIFIER ON`就會造成錯誤，所以在撰寫`Script`時要養成加上面語法的好習慣.

## Index Intersection

`SQL-Server`可透過多個`Index`完成一段查詢(通常選擇子集合較小)在透過`JOIN`完成查詢

假如我們有兩個一個查詢會用到`UserId`和`Id` Column當作條件我們可能會建立下面這個索引.

```sql
CREATE CLUSTERED INDEX IX_T_UserId_Id on dbo.T(
	UserId,
	Id
)
```

但除了同時利用`UserId`和`Id` Column當作條件外還可能個別當作查詢條件.

我們就可以考慮把這個`Index`拆開成兩個，這樣可以提高索引使用率（因為執行計畫透過統計值來產生，而`Index`統計值計算是由`Index`第一個Column來當計算）

> 注意:把`Index`拆成兩個或許可以增加查詢效率，但每個`Index`就是一個`B+ Tree`,這會造成維護上成本

```sql
CREATE CLUSTERED INDEX IX_T_UserId on dbo.T(
	UserId
)

CREATE CLUSTERED INDEX IX_T_Id on  dbo.T(
	Id
)
```

## Primary Key

在`SQL-Server`很常使用PRIMARY KEY但你知道他代表甚麼含意嗎?

PRIMARY KEY是也是一個`Index`，他可以設定`NonClustered Index`或是`Clustered Index`

PRIMARY KEY有幾個特徵

1. 資料不能重複(Unique)
2. Columns都必須定義成`NOT NULL`
3. PRIMARY KEY是一個`Index`

> 預設建立的PRIMARY KEY是`Clustered Index`，但我們使用語法自行建立為`NonClustered Index`的PRIMARY KEY

如下範例我們可以建立一個`NONCLUSTERED`的PRIMARY KEY

```SQL
CREATE TABLE T(
    ID INT NOT NULL,  
    CONSTRAINT [PK_T] PRIMARY KEY NONCLUSTERED (
        ID
    )
)
```

## 選擇Clustered Index要訣

在 SQL-Server 每張資料表只有一個 Clustered Index，每個資料表只能有一個`Cluster index`，資料表會依照`cluster index`方式排列，`Clustered Index`跟資料一起放置在`left pag`子頁層，`Cluster index`好比書籍目錄。每本書只能有一個目錄

所以選擇合適 Clustered Index 就尤為重要

建立`Clustered Index`欄位有幾個重點

1. 常用於查詢欄位
2. 可識別度高(唯一性較高 or 密度高)
3. 避免過多欄位在Clustered Index中(因為NonClustered會包含Clustered Index Key)

我個人建議選擇 Clustered Index 可以依照下面幾個準則

- 最好是唯一性：提高查詢效率
- 寬度窄或窄複合組成：因為NonClustered Index中頁層會包含Clustered Index資訊，如果Clustered Index太肥會造成NonClustered Index page變多.
- 靜態性：Clustered Index盡量少被Update(更新時需要一併更新NonClustered Index中Clustered Key資料,會造成I/O效能消耗)
- 連續性佳：避免索引破碎(能避免就避免使用GUID當Clustered Index)

假如確定建立的Clustered index資料是唯一的,請加上`Unique`,因為沒加上`Unique`的`Clustered index`會在Page中的每列資料加上一個`uniquifiers` 2 bytes的Column

下圖是我使用`DBCC PAGE`查看三種不一樣的`Clustered Index`結果

其中第一,第二個結果集顯示就算`Clustered Index`資料不重複沒加上`Unique`對於儲存上會有差異

![](https://i.imgur.com/6y3XwDz.png)

> 所以確定建立的Clustered index資料是唯一的,請加上`Unique`
