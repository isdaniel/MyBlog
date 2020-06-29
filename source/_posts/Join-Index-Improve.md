---
title: JOIN範圍條件Index優化
date: 2020-06-28 23:10:43
tags: [DataBase,Turning,Sql-server,Index]
categories: [DataBase,Turning]
---

# Agenda<!-- omit in toc -->
- [前文](#%e5%89%8d%e6%96%87)
	- [資料初始化](#%e8%b3%87%e6%96%99%e5%88%9d%e5%a7%8b%e5%8c%96)
	- [建立Index](#%e5%bb%ba%e7%ab%8bindex)
	- [查詢語法](#%e6%9f%a5%e8%a9%a2%e8%aa%9e%e6%b3%95)

## 前文

範圍查詢時`JOIN`統計資訊容易不準確,這也間接導致執行計畫會跑掉.

如果我們想要提升範圍查詢效能並讓Index可以發揮最大最用可以怎麼做?

讓我利用一個範例來跟大家分享.

此範例有使用到三張表

* Product表:擁有1-10編號產品
* ReportPeriod表:存放產每期報表的資訊(時間,和是否產報表)
* T99表:線上產品訂單資訊

```sql
CREATE TABLE [dbo].[Product](
	[ProductId] INT NOT NULL
)

CREATE TABLE [dbo].[T99](
	[TransactionId] [int] IDENTITY(1,1) NOT NULL,
	[Amount] DECIMAL(18,6),
	[CreateDate] [datetime2](3) NULL
)
GO

CREATE TABLE [dbo].[ReportPeriod](
	[PerioidID] [int] IDENTITY(1,1) NOT NULL,
	[ProductId] INT NOT NULL,
	[IsGenerate] [bit] NULL,
	[StartDate] [datetime2](3) NULL,
	[EndDate] [datetime2](3) NULL
) ON [PRIMARY]
GO
```

> 我們利用`T99.CreateDate`來跟`ReportPeriod`判斷是屬於哪期報表.

### 資料初始化

我們利用亂數產生Sample資料來模擬線上大資料狀況.

`ReportPeriod`期別由`'2019-08-01'`到`'2020-07-31'`

因為產生報表以5分鐘為區間,所以可以利用CTE遞迴來幫我們產生資料.

```sql
INSERT INTO [dbo].[Product] VALUES (1);
INSERT INTO [dbo].[Product] VALUES (2);
INSERT INTO [dbo].[Product] VALUES (3);
INSERT INTO [dbo].[Product] VALUES (4);
INSERT INTO [dbo].[Product] VALUES (5);
INSERT INTO [dbo].[Product] VALUES (6);
INSERT INTO [dbo].[Product] VALUES (7);
INSERT INTO [dbo].[Product] VALUES (8);
INSERT INTO [dbo].[Product] VALUES (9);
INSERT INTO [dbo].[Product] VALUES (10);

declare @FromDate DATETIME2(3) = '2019-08-01'
declare @ToDate DATETIME2(3) = '2020-07-31'


;WITH CTE AS (
	SELECT @FromDate fromDt,@ToDate endDt
	UNION ALL
	SELECT DATEADD(MINUTE,5,fromDt),endDt
	FROM CTE 
	WHERE DATEADD(MINUTE,5,fromDt) < endDt
)
INSERT INTO  [dbo].[ReportPeriod] ([ProductId],[IsGenerate],[StartDate],[EndDate])
SELECT ProductId,0,fromDt,DATEADD(MINUTE,5,fromDt) 
FROM CTE CROSS JOIN dbo.Product
OPTION (MAXRECURSION 0); 

INSERT INTO T99 ([CreateDate],Amount)
SELECT top 1000000 dateadd(SECOND, 
          rand(checksum(newid()))*(1+datediff(SECOND, @FromDate, @ToDate)), 
               @FromDate),
	   CAST(RAND(CHECKSUM(NEWID())) * 100000 as INT) + 1
FROM sys.all_columns c1 CROSS JOIN sys.all_columns c2
```

### 建立Index

```sql
CREATE CLUSTERED INDEX [CIX_ReportPeriod_StartDate] ON [dbo].[ReportPeriod]
(
	[StartDate] ASC,
    [EndDate] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, DROP_EXISTING = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]

ALTER TABLE [dbo].[ReportPeriod] ADD  CONSTRAINT [PK_ReportPeriod] PRIMARY KEY NONCLUSTERED 
(
	[PerioidID] ASC,
	[ProductId] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, SORT_IN_TEMPDB = OFF, IGNORE_DUP_KEY = OFF, ONLINE = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]

CREATE CLUSTERED INDEX [CIX_T99_CreateDate] ON [dbo].[T99]
(
	[CreateDate] ASC
)

CREATE UNIQUE NONCLUSTERED INDEX [IX_T99_TransactionId] ON [dbo].[T99]
(
	[TransactionId] ASC
)
```

### 查詢語法

在線上我們會使用UDT當作參數來取得某些期別資訊.

這裡為了方便模擬我使用Table Variable來取代.

```sql
set nocount on
DECLARE @Transaction AS TABLE(
	TransactionId INT,
	ProductId INT
);

INSERT INTO @Transaction VALUES (1,1)
INSERT INTO @Transaction VALUES (101,2)
INSERT INTO @Transaction VALUES (1001,3)

SELECT p.*
FROM dbo.T99 t 
JOIN [dbo].[ReportPeriod] p ON t.CreateDate BETWEEN p.StartDate AND p.EndDate
JOIN @Transaction t1 ON t.TransactionId = t1.TransactionId AND  p.ProductId = t1.ProductId
```

使用上面語法我們只需查詢三個期別資料,但看執行計畫時能發現，ReportPeriod使用的Clustered預估資訊有1百多萬筆

Q:我明明有對於條件建立Index，但為什麼預估值卻會跑真那麼嚴重？

```sql
CREATE CLUSTERED INDEX [CIX_ReportPeriod_StartDate] ON [dbo].[ReportPeriod]
(
	[StartDate] ASC,
    [EndDate] ASC
)
```

![](https://i.imgur.com/QGNtlUr.png)

> 原因出在範圍條件.