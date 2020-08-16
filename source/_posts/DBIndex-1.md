---
title: 資料庫索引深入淺出(一)
date: 2020-01-20 11:12:43
tags: [DataBase,Turning,Sql-server,Index]
categories: [DataBase,Turning]
---
# Agenda<!-- omit in toc -->
- [前文](#%e5%89%8d%e6%96%87)
- [Index使用的資料結構(B+ tree)](#index%e4%bd%bf%e7%94%a8%e7%9a%84%e8%b3%87%e6%96%99%e7%b5%90%e6%a7%8bb-tree)
- [Index優缺點](#index%e5%84%aa%e7%bc%ba%e9%bb%9e)
- [Clustered Index(叢集索引)](#clustered-index%e5%8f%a2%e9%9b%86%e7%b4%a2%e5%bc%95)
- [NonClustered Index(非叢集索引)](#nonclustered-index%e9%9d%9e%e5%8f%a2%e9%9b%86%e7%b4%a2%e5%bc%95)
	- [RID Lookup](#rid-lookup)
	- [Key Lookup](#key-lookup)
- [範例演示](#%e7%af%84%e4%be%8b%e6%bc%94%e7%a4%ba)
	- [建立一個 NonClustered Index](#%e5%bb%ba%e7%ab%8b%e4%b8%80%e5%80%8b-nonclustered-index)
- [再建立一個 Clustered Index](#%e5%86%8d%e5%bb%ba%e7%ab%8b%e4%b8%80%e5%80%8b-clustered-index)

## 前文

`Index`第一個欄位至關重要它會影響資料**統計值**結果，`Index`一般建立在查詢條件的欄位

> 每個`Index`都擁有自己的`B+ tree`.

## Index使用的資料結構(B+ tree)

`B+ tree`是一種資料結構這個資料結構被`Index`拿來使用，關於`B+ tree`網路上有很多資源可再自行尋找，所以我們來談談為什麼`DataBase`會使用`B+ tree`

在[Wiki](https://zh.wikipedia.org/wiki/B%2B%E6%A0%91)講述`B+ tree`有其中一段

> `B+ tree`是能夠保持資料穩定有序，其插入與修改擁有較穩定的對數時間複雜度。`B+ tree`元素由下而上插入，通過最大化在每個內部節點內的子節點的數目減少樹的高度，平衡操作不經常發生，而且效率增加了。這種價值得以確立通常需要每個節點在次級儲存中占據完整的磁碟塊或近似的大小。

簡白來說`B+ tree`有一個特性是他會把資料存在子頁(Leaf Page)中透過一個參考把每個子頁串聯起來，提高穩定度.

`B+ tree`資料結構如下圖，這個資料結在在範圍查詢時較`B tree`來的更穩定

![](https://i.imgur.com/8CDe0Ms.png)

Index真正在使用`B+ tree`儲存類似於下圖

此圖來自(Pro SQL Server Internals, 2nd edition)

![](https://i.imgur.com/FnQlBUl.png)

## Index優缺點

`Index`可以加快查詢速度，因為`Index`是以**空間**換取**時間**。

基本上它使用的資源如下:

1. 每個`Index`都會建立一顆`b+ tree`
2. 每次新增、更新資料時都會異動到有使用的`b+ tree`

> 所以當你`Index`越多時，你需要維護的`Index`越多(代表需要更多資源來維護)

建立太多`Index`，小心降低(新增、更新)效率

> 因為SQLServer會對於這次新增、更新使用`Index`做異動

下面有一個`T98`資料表擁有兩個Index

* `CIX_T98` Clustered Index
* `IX_T98` Convering Index

```sql
IF EXISTS(
    SELECT 1
    FROM sys.tables
    WHERE name = 'T98'
)
BEGIN
    CREATE TABLE T98(
        ID int,
        COL1 VARCHAR(50),
        COL2 VARCHAR(50)
    )
END

insert into T98 VALUES (1,'Hello','Hello1')

CREATE CLUSTERED  INDEX CIX_T98 ON T98(
    ID 
)

CREATE INDEX IX_T98 ON T98(
    ID 
) INCLUDE (COL1)
```

當我們要執行更新`COL1`欄位時(打開執行計畫)

```sql
UPDATE T98
SET COL1 = 'Test1'
```

可以發現此次更新,我們會對於這兩個Index異動

* `CIX_T98` Clustered Index
* `IX_T98` Convering Index

![](https://i.imgur.com/XrVqq2q.png)

```sql
UPDATE T98
SET COL1 = 'Test1'
```

但當我只更新`COL2`時,只會異動`CIX_T98` Index

```sql
UPDATE T98
SET COL2 = 'Test1'
```

![](https://i.imgur.com/iDZPu76.png)

這是為什麼?

> 因為`IX_T98` Index `B+ Tree`沒有包含`COL2`欄位相關資訊,所以不需要更新

## Clustered Index(叢集索引)

每個資料表只能有一個`Clustered index`，資料表會依照`Clustered index`方式存放排列資料，`Clustered Index`會把資料放置在`Left`子頁層

> `Cluster index`好比書籍頁碼目錄。每本書只能有一個目錄

建立`Clustered Index`欄位有幾個重點

1. 常用於查詢欄位
2. 可識別度高(唯一性較高)

## NonClustered Index(非叢集索引)

每個資料表能有許多`NonClustered Index`，像每本書可以有很多種附錄

1. 例如依照字母排序
2. 依照附錄A
3. 附錄B

> `NonClustered Index`按照`Key Column`排序，

`NonClustered Index`(index page)上所有分葉節點存放指標，如果資料表已存在`Clustered Index`(`KeyID`)，那麼該指標將會指`Clustered Index`，如不存在將指向資料真實存放位置(`RID`)

> this is a very important point to remember. Nonclustered indexes do not store information about physical row location when a table has a clustered index. They store the value of the clustered index key instead.

上面簡單來說如果`NonClustered Index`沒有包含所有要查詢欄位

1. 有`Clustered Index`，會執行`Key Lookup`
2. 沒有`Clustered Index`，會執行`RID Lookup`

> 這裡的`RID`是指向真實資料位子`RowID`

> 如果Nonclustered index可以建立Unique盡量宣告成Unique,因為Leaf page就可以減少存取`Row-id`欄位,減少儲存空間.

### RID Lookup

資料表沒有`Clustered Index`且使用`Index`所有查詢欄位不包含在`Converting Index`中就會透過`RID Lookup`查找確切Page上的Row(藉由`Row-Id`)

> RID Key的大小8 byte

`lookup`會消耗`Disk I/O`，所以消耗成本相對會比較大.

> 沒有`Clustered Index`的資料表我們稱為`Heap`資料表

### Key Lookup

`NonClustered Index`中會存放此Row在`Clustered Index`相對位置，假如單單靠搜尋`Non-Clustered Index`沒有辦法滿足所有查詢需要資料就會去`Key Lookup`(by Clustered key)回找`Clustered Index`取出相對應的資料.

## 範例演示

我們先準備10000筆樣本資料

```sql
CREATE TABLE T(
	Id INT identity(1,1),
	UserId INT,
	UserGroup INT
)

INSERT INTO T (UserId,UserGroup)
SELECT TOP 10000 1.0 + floor(10000 * RAND(convert(varbinary, newid()))),
	   (1.0 + floor(10000 * RAND(convert(varbinary, newid())))/1000)+1
FROM sys.all_columns t1 CROSS JOIN  sys.all_columns t2
```

建立完資料後我們利用下面條件來查找資料.

```sql
SELECT *
FROM dbo.T
WHERE id = 10000
```

因為沒有建立`Index`，導致我明明只需要撈取一筆資料,但資料庫卻全表掃描

![](https://i.imgur.com/J2BctqU.png)
![](https://i.imgur.com/37rnlmn.png)

## 建立一個 NonClustered Index

我們在表中建立了一個`NonClustered Index`，並利用相同查詢語法查詢資料

```SQL
CREATE NONCLUSTERED INDEX IX_T_Id on  dbo.T(
	id
)
```

建立完`NonClustered Index`後從原本的全表掃描變成`RID Lookup`和`Index Seek`，因為`NonClustered Index`的`B+ Tree`沒有包含所有需要撈取的資料.所以透過`RID`回去`Heap`資料表查找出所需要的欄位

`RID Lookup`在執行計畫中呈現如下圖，

![](https://i.imgur.com/E6WS5qL.png)

## 建立一個 Clustered Index

我們在`T`資料表中建立一個`Clustered Index`，並且執行相同查詢

```sql
CREATE CLUSTERED INDEX CIX_T_UserId on  dbo.T(
	UserId
)
```

能看到執行計畫的不同了，已經透過`Key Lookup`回去查找資料，原因是目前資料表已經有`Clustered Index`但此查詢使用條件使用`NonClustered Index`所以導致需要`Lookup`回去`Clustered Index`的`B+ Tree`查找資料

![](https://i.imgur.com/PPTDYcG.png)
