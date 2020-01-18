---
title: 資料庫索引深入淺出(二)
date: 2020-01-20 23:10:43
tags: [DataBase,Turning,Sql-server]
categories: [DataBase,Turning]
---
# Agenda<!-- omit in toc -->
- [前文](#%e5%89%8d%e6%96%87)
- [Covering Index](#covering-index)
	- [加入INCLUDE欄位含意](#%e5%8a%a0%e5%85%a5include%e6%ac%84%e4%bd%8d%e5%90%ab%e6%84%8f)
	- [案例解說](#%e6%a1%88%e4%be%8b%e8%a7%a3%e8%aa%aa)
- [Filter Index](#filter-index)
- [Index Intersection](#index-intersection)
- [Primary Key](#primary-key)

## 前文

在[資料庫索引深入淺出(一)](https://isdaniel.github.io/DBIndex-1/)文章介紹

兩種基本索引

* Clustered Index(叢集索引)
* NonClustered Index(非叢集索引)

兩種`Lookup`(如果`NonClustered Index`無法滿足查詢結果執行)

* RID Lookup
* Key Lookup

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

## Filter Index

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

> 注意:如果有使用到`Filter Index`的`SP`或`Script`，如果沒有加上`SET QUOTED_IDENTIFIER ON`就會造成錯誤，所以在撰寫`Script`時要養成加上上面語法的好習慣.

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

> 注意:把`Index`猜成兩個或許可以增加查詢效率，但每個`Index`就是一個`B+ Tree`這會造成

```sql
CREATE CLUSTERED INDEX IX_T_UserId on dbo.T(
	UserId
)

CREATE CLUSTERED INDEX IX_T_Id on  dbo.T(
	Id
)
```

## Primary Key

在`SQL-Server`很常使用`Primary Key`但你知道他代表甚麼含意嗎?

`Primary Key`是也是一個`Index`，他可以設定`NonClustered Index`或是`Clustered Index`

`PRIMARY KEY`有幾個特徵

1. 資料不能重複(Unique)
2. Columns都必須定義成`NOT NULL`

> 一般在建立`Primary Key`是`Clustered Index`，但我們可以自行建立為`NonClustered Index`的`Primary Key`

