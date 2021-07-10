---
title: 資料庫壓測好工具-SQLQueryStress
date: 2020-12-15 23:10:43
tags: [DataBase,Turning,sql-server,Index]
categories: [DataBase,Turning]
---

## 前文

隨著業務量增長,資料庫的複雜程度也會成正比增長

這裡跟大家分享一個好用壓測資料庫工具[SqlQueryStress](https://github.com/ErikEJ/SqlQueryStress/)

在Dev可以模擬高併發時產生的問題,下面會分享我之前Prod遇到問題並解決問題過程

詳細資訊可以看[SQLServer-Merge-condition-problem](https://isdaniel.github.io/sqlserver-merge-condition-problem/)

## SQLQueryStress介紹

在執行效能調教和測試高併發產生問題時,我們會關注幾個特別資訊

1. CPU執行時間
2. logical read數值
3. Total執行時間

![](https://i.imgur.com/GXpaQti.png)

在此工具都有相對應的資訊提供給我們觀看

SQLQueryStress可以讓我們輸入要重複執行次數跟使用多少個**Thread**來執行.

> `Total Exceptions`可以協助查看目前語法執行上有多少錯誤產生(這個功能在高併發驗證問題很有幫助)

### Sample Data

```sql
CREATE TABLE [dbo].[PriceLimitation](
	[CategoryID] [int] NOT NULL,
	[ProdcutGroupID] [smallint] NOT NULL,
	[UserID] [int] NOT NULL,
	[StakeAmount] [numeric](18, 4) NOT NULL,
	[ProductID] [smallint] NOT NULL,
 CONSTRAINT [PK_PriceLimitation] PRIMARY KEY CLUSTERED 
(
    [UserID] ASC,
	[CategoryID] ASC,
	[ProductID] ASC,
	[ProdcutGroupID] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY]
GO

CREATE TYPE [dbo].[uftt_PriceLimit] AS TABLE(
	[CategoryID] [int] NOT NULL,
	[ProdcutGroupID] [smallint] NOT NULL,
	[UserID] [int] NOT NULL,
	[StakeAmount] [numeric](18, 4) NOT NULL,
	[ProductID] [smallint] NOT NULL,
	PRIMARY KEY CLUSTERED 
(
	[UserID] ASC,
	[CategoryID] ASC,
	[ProductID] ASC,
	[ProdcutGroupID] ASC
)WITH (IGNORE_DUP_KEY = OFF)
)
```

```sql
CREATE OR ALTER PROC [dbo].[CalculateStake]
	@CategoryID int,
	@ProductID smallint ,
	@ProdcutGroupID smallint,
	@PriceLimit [uftt_PriceLimit] readonly
AS
BEGIN
	SET NOCOUNT ON;

	MERGE INTO [dbo].[PriceLimitation] t1
		USING @PriceLimit t2
		ON t1.UserID = t2.UserID 
            AND t1.ProdcutGroupID= @ProdcutGroupID
            AND t1.CategoryID=@CategoryID 
            AND t1.ProductID = @ProductID
	WHEN MATCHED THEN
		UPDATE SET t1.StakeAmount = t1.StakeAmount + t2.StakeAmount
	WHEN NOT MATCHED THEN
		INSERT VALUES(@CategoryID, @ProdcutGroupID, t2.UserID ,t2.StakeAmount, @ProductID);
END
```

### 執行語法

```sql
DECLARE @CategoryID int,
	@ProductID smallint ,
	@ProdcutGroupID smallint,  
    @PriceLimit [uftt_PriceLimit] 

declare @from int
SELECT @from = ROUND(RAND(CAST(NEWID() as varbinary)) * 500,0)
SELECT @CategoryID =  CAST(ROUND(RAND(CAST(NEWID() as varbinary)) * 123,0) as int) % 4 +1
SELECT @ProductID =  CAST(ROUND(RAND(CAST(NEWID() as varbinary)) * 123,0) as int) % 5 +1
SELECT @ProdcutGroupID =  CAST(ROUND(RAND(CAST(NEWID() as varbinary)) * 731,0) as int) % 20 +1

;with cte as(
	select @from as num
	union all
	select num + 1 as num from cte 
	where num < @from+500
) 
insert into @PriceLimit ([UserID],[StakeAmount],CategoryID,[ProductID],[ProdcutGroupID])
select num,100,@CategoryID,@ProductID,@ProdcutGroupID
from cte
option(MAXRECURSION 0);

exec  [dbo].[CalculateStake] @CategoryID,@ProductID,@ProdcutGroupID,@PriceLimit
```

## 使用SqlQueryStress重現問題

基本script建立好後,我們可以利用`SqlQueryStress`來進行壓力測試.

* Number of Iterations 設定成 100
* Number of Threads 設定成 100

使用100 Thread,重複跑100次.

之後就可以重現Prod出現的Merge問題了,有了這個Baseline我們就可以開始進行優化改善了.

![](https://i.imgur.com/XWELYJy.png)

## 小結

`SqlQueryStress`這個工具可以很快速幫助我們模擬許多高併發問題,但在使用這工具時偶爾會遇到UI卡住或無法停止問題,這時候就需要強制停止應用程式.

