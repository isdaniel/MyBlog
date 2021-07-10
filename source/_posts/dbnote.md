---
title: 撰寫SQL的建議
date: 2020-01-26 23:10:43
tags: [DataBase,Turning,sql-server]
categories: [DataBase,Turning]
---
# Agenda<!-- omit in toc -->
- [前文](#%e5%89%8d%e6%96%87)

## 前文

本篇會分享在撰寫SQL時建議和比較分享

> 永遠先考慮T-SQL改寫

1. 符合SARG Statement進行撰寫
    * <、>、=、<=、>=、LIKE(視%所在位置，前面有%讓DB engine選擇不走INDEX) 
2. 不要在`Where`欄位做運算 
3. 使用`ANSI 92`相容的Join方式連接資料庫(避免使用舊式`Join`)
4. 避免row by row操作

> 符合SARG格式的撰寫 + 適當Index設計可以解決大部分的效能問題

## 使用Like查詢建議

* 盡量別把`%`放在前面
* 如果查詢條件是`CNAME LIKE '%范'`想讓讓查詢走索引(seek 查詢),在後面加一個條件`AND CNAME > ''`讓查詢走Seek.

```sql
SELECT [MID]
      ,[NickName]
      ,[CName]
FROM [Member_Basic] WITH (NOLOCK)
WHERE CNAME LIKE '%范' AND CNAME > ''
```

## 使用Count函數建議

如果要取得筆數數量使用`COUNT(*)`比`Count(c1)`效能好.

> `Count(c1)`會忽略`c1 IS NULL`數量.

> 另外如果[資料筆數]>2^15-1(大於INT最大值)筆數量可使用`count_big(*)`方法

如果需要`COUNT`資料很大造成效能影響可以透過`DMV`取得當前資料表數量(資料會不準確,因為並非及時更新)

```SQL
SELECT SUM(p.rows)
FROM sys.partitions p 
WHERE p.[object_id] = object_id('dbo.Person') AND p.index_id < 2

SELECT SUM(p.row_count)
FROM sys.dm_db_partition_stats p 
WHERE p.[object_id] = object_id('dbo.Person')  AND p.index_id < 2
```

使用`if exists (select 1 from dbo.table)`取代`count`函式判斷資料是否存在

## NOT IN vs NOT EXISTS

在查詢時避免使用`NOT IN`，因為會被QO改寫成 `<> NULL`，在SQL中`NULL`代表不知道(Unknow)，所以會什麼都查不到

* 因為此欄位是可空(`NULL`)時會造成非預期結果(因為`NULL`會造成判斷失誤`NULL`不是一個值他代表**未知**)
* 使用`NOT EXISTS`替代`NOT IN`
* `NOT EXISTS`在**可空欄位**效能比`NOT IN`還要好(如果有建立`Index`兩個產生執行計畫理論上是一樣)

下面有一個範例來解說為什麼避免在可空欄位使用`NOT IN`

```sql
CREATE TABLE T(
    ID INT
)

INSERT INTO T VALUES (1)
INSERT INTO T VALUES (2)

SELECT *
FROM dbo.T
WHERE ID NOT IN (
    SELECT ID
    FROM (SELECT NULL v UNION ALL SELECT 1) t1
)

SELECT *
FROM dbo.T 
WHERE NOT EXISTS (
    SELECT ID
    FROM (SELECT NULL v UNION ALL SELECT 1) t1
    WHERE ID = v
)

--DROP TABLE T
```

上圖可以看到在`T`資料表中有兩筆資料，如果我們使用`NOT IN`和`NOT EXISTS`結果會不一樣，原因是使用`NOT IN`在判斷`NULL`時會造成`NULL<>`任何值,所以就撈不出任何資料，相反使用`NOT EXISTS`取得的結果就符合我們預期.

## 避免在Where條件中對欄位進行操作運算

### @col > '' 替代 @col NOT NULL AND <> '' 

我們會有一種需求須要判斷此

```sql
CREATE TABLE T(
    Col VARCHAR(50)
)

INSERT INTO T
SELECT TOP 100000 NULL
FROM sys.all_columns c1
CROSS JOIN sys.all_columns c2


INSERT INTO T VALUES ('DANIEL')
INSERT INTO T VALUES ('DANIEL2')
INSERT INTO T VALUES ('')
INSERT INTO T VALUES ('')

--CREATE INDEX
CREATE INDEX IX_Col on dbo.T(
    Col
)

SELECT *
FROM dbo.T
WHERE col > ''

SELECT *
FROM dbo.T
WHERE col IS NOT NULL AND col <> ''
--DROP TABLE T
```