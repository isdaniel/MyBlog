---
title: 資料庫新增欄造成Page split
date: 2021-05-11 16:00:00
tags: [sql-server,column,performance]
categories: [sql-server]
top:
photos: 
    - "https://i.imgur.com/uuyIRuC.png"
---

## 前言:

使用`DB`新增欄位一般很快就可以執行完畢,但最近我們在prod新增一個`bit`欄位卻需要跑快45分鐘...

經後面追查找到原因才有本篇文章.

### 問題重現

下面語法會建立兩個Table.

* `Test`：新增10,000,000筆Sample Data
* `TestSplit`：新增1,000,000筆Sample Data

```sql
DROP TABLE IF EXISTS [dbo].[Test]

CREATE TABLE [dbo].[Test](
	[ID] [int] NOT NULL IDENTITY(1,1),
	[CustomerID] [VARCHAR](40) NOT NULL,
	[col1] [VARCHAR](100) SPARSE NULL,
	[col2] [VARCHAR](100) SPARSE NULL,
	[col3] [VARCHAR](100) SPARSE NULL,
	[col4] [VARCHAR](100) SPARSE NULL,
	[CreateDate] [datetime2](3) NOT NULL,
) ON [PRIMARY]

CREATE UNIQUE CLUSTERED INDEX CIX_ID ON [dbo].[Test](ID)

INSERT INTO [dbo].[Test] ([CustomerID],Col1,Col2,Col3,Col4,[CreateDate])
SELECT TOP 10000000 
	   REPLICATE('ABCD',10),
	   REPLICATE('A',100),
	   REPLICATE('B',100),
	   REPLICATE('C',100),
	   REPLICATE('D',100),
	   SYSDATETIME()
FROM sys.all_columns  c1
CROSS JOIN  sys.all_columns c2

DROP TABLE IF EXISTS [dbo].[TestSplit]

CREATE TABLE [dbo].[TestSplit](
	[ID] [int] NOT NULL IDENTITY(1,1),
	[CustomerID] [VARCHAR](40) NOT NULL,
	[col1] [VARCHAR](2000) SPARSE NULL,
	[col2] [VARCHAR](2000) SPARSE NULL,
	[col3] [VARCHAR](2000) SPARSE NULL,
	[col4] [VARCHAR](2000) SPARSE NULL,
	[CreateDate] [datetime2](3) NOT NULL,
) ON [PRIMARY]

CREATE UNIQUE CLUSTERED INDEX CIX_ID ON [dbo].[TestSplit](ID)

INSERT INTO dbo.[TestSplit] ([CustomerID],Col1,Col2,Col3,Col4,[CreateDate])
SELECT TOP 1000000 
	   REPLICATE('ABCD',10),
	   REPLICATE('A',2000),
	   REPLICATE('B',2000),
	   REPLICATE('C',2000),
	   REPLICATE('D',2000),
	   SYSDATETIME()
FROM sys.all_columns  c1
CROSS JOIN  sys.all_columns c2
```

我們先在test table新增欄位語法如下

執行下面語法瞬間完成

```sql
IF COL_LENGTH('dbo.[Test]','Col6') IS NULL
BEGIN
	ALTER TABLE dbo.Test
    ADD Col6 BIT NOT NULL 
	CONSTRAINT DF_Test_Col6 DEFAULT 0
END
```

但在執行`TestSplit`語法時跑很久...
在我電腦花了1分32秒

```sql
IF COL_LENGTH('dbo.TestSplit','Col6') IS NULL
BEGIN
	ALTER TABLE dbo.TestSplit
    ADD Col6 BIT NOT NULL 
	CONSTRAINT DF_TestSplit_Col6 DEFAULT 0
END
```

明明`TestSplit` table比`Test` table資料少10倍,為什麼還比較慢?

這就要說到資料表底層的儲存原理.

### Table size is 8k byte

資料表儲存資料最小單位是**頁**

一頁是存放8K Byte資料(準確來說是8060 byte,因為每頁有一些meta data需要存放).

`Test`一筆資料大約500 byte,但`TestSplit`一筆快等於一頁資料...

我們知道一個row資料是連續放置,如果有欄位新增且此頁已經放不下此欄位大小資訊就會發生Page Split.

> Page split會影響系統效能,且當資料頁面不連續時會影響Disk IO讀取速度

## 產生問題和如何解決

我們在做DDL操作時會對於Table上`Sch-M`的lock，這個lock會和所有其他索互斥，所以會導致一大堆blocking，假如你新增欄位是對於一張大表那會有非常嚴重的後果...

可以嘗試建立另一張表並新增你想要的欄位和JOIN此表的條件，這樣可以避免線上產生問題，之後對於要使用的查詢可以使用`OUTER JOIN`或在背景把資料Patch完成.
