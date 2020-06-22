---
title: SQL Server Merge condition on declare value problem
date: 2020-06-21 22:30:11
tags: [SQL-Server,SQL,Merge]
categories: [SQL-Server]
---

## 前言

假如要判斷資料是否存在於資料表中,存在就更新,不存在就新增.

這時我們可以使用`Merge`來幫助我們完成.

> 當兩個資料表有複雜的比對的特性時，`MERGE`陳述式的條件式行為表現最佳。

有了`Merge`我們就不用使用`IF EXISTS`.

一切都是這麼完美...

直到到有一天`Merge`在Prod撞到一個問題..

## 問題描述

使用語法user defined table type & Table如下

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
	[UserID] [int] NOT NULL,
	[StakeAmount] [numeric](18, 4) NOT NULL,
	PRIMARY KEY CLUSTERED 
(
	[UserID] ASC
)WITH (IGNORE_DUP_KEY = OFF)
)
```

呼叫執行SP`[dbo].[CalculateLimitation]`

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

主要傳入參數判斷更新或新增`[dbo].[PriceLimitation]`表

我們在`ELK`發現在執行SP時**很少概率**會發生PRIMARY KEY重複問題.

> Violation of PRIMARY KEY constraint 'PK_PriceLimitation'. Cannot insert duplicate key in object 'dbo.PriceLimitation'.

但這張表PK使用欄位都有正確在`Merge`條件上,所以當下我們嘗是在DEV重現此問題,但一直無法成功

後來發現此問題在**高併發**時才會發生,所以我們使用[Query Stress](https://www.mssqltips.com/sqlservertip/2730/sql-query-stress-tool/)來幫助我們模擬高併發請求時的狀態.

### Query Stress重現問題

撰寫了模擬SQL並利用Query Stress重現問題.

模擬SQL腳本

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

我使用模擬參數是

* Iterator:30
* Thread:100

來模擬高併發時資料庫請求狀況,就能發現這時已經會出現Prod的`Exception`.

![](https://i.imgur.com/1RpWBYP.png)

### 找到問題尋求解法

對於目前Prod問題已經邁出一大步了,因為現在問題可以重現,在網路上找了許多文章還是沒找到解法....

後面在MSDN時看到關鍵一段話,關於[merge-transact-sql](https://docs.microsoft.com/zh-tw/sql/t-sql/statements/merge-transact-sql?view=sql-server-ver15).

> 請務必只從目標資料表指定用於比對用途的資料行。 也就是說，從目標資料表中指定要與來源資料表的對應資料行進行比較的資料行。 請勿嘗試在 ON 子句中篩選出目標資料表的資料列 (例如指定 `AND NOT target_table.column_x = value)` 來改善查詢效能。 這樣做可能會傳回非預期且不正確的結果。

後面有看到有篇文章在介紹[use-where-clause-with-merge](https://dba.stackexchange.com/questions/154509/use-where-clause-with-merge)

我就嘗試把sp寫法改成只利用兩個Table可以`JOIN`欄位當作條件,發現Duplicate PK問題就可以解決了....但發現另一個更麻煩問題.

SP改寫後

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
	WHEN MATCHED   
            AND t1.ProdcutGroupID= @ProdcutGroupID
            AND t1.CategoryID=@CategoryID 
            AND t1.ProductID = @ProductID 
            THEN
		UPDATE SET t1.StakeAmount = t1.StakeAmount + t2.StakeAmount
	WHEN NOT MATCHED THEN
		INSERT VALUES(@CategoryID, @ProdcutGroupID, t2.UserID ,t2.StakeAmount, @ProductID);
END
```

新寫法的執行計畫在對於大資料表時會很沒效率....

#### 改寫後遇到的問題(不好的執行計畫)

一般SP在執行過後都會把使用的執行計畫快取起來,所以我們可以透過DMV來查看執行執行計畫.

```sql
SELECT Cacheobjtype, Objtype, TEXT, query_plan
FROM sys.dm_exec_cached_plans t1
CROSS APPLY sys.dm_exec_sql_text(plan_handle) t2
CROSS APPLY sys.dm_exec_query_plan(plan_handle) t3
where t2.objectid = object_id('dbo.CalculateStake', 'p')
```
新和舊SP寫法執行計畫如下圖.

舊寫法

![](https://i.imgur.com/ueY6efl.png)

新寫法

![](https://i.imgur.com/gbPva4K.png)

造成上面差異原因，因為新寫法透過統計資訊使用效能較差的執行計畫(能看到上面使用`Merge Join`明明傳入結果集資料並不多)且在`WHEN MATCHED`進行第二次判斷...

所以效能就變很差,現在已經找到此問題點了，我就在思考那有沒有辦法兼具效能又可解決此問題呢?

### 最終版SP寫法

最後我就思考何不如把傳入參數全部加入`user defined table type`

1. 這樣就可以利用傳入參數當作`ON`條件也可以得到精準執行計畫.
2. `user defined table type`所有欄位可以跟Table的Clustered Index Match.

```sql
drop proc[dbo].[CalculateStake]
drop type [dbo].[uftt_PriceLimit] 

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

CREATE OR ALTER PROC [dbo].[CalculateStake]
	@PriceLimit [uftt_PriceLimit] readonly
AS
BEGIN
	SET NOCOUNT ON;

	MERGE INTO [dbo].[PriceLimitation] t1
		USING @PriceLimit t2
		ON t1.UserID = t2.UserID 
            AND t1.ProdcutGroupID= t2.ProdcutGroupID
            AND t1.CategoryID=t2.CategoryID 
            AND t1.ProductID =t2.ProductID
	WHEN MATCHED THEN
		UPDATE SET t1.StakeAmount = t1.StakeAmount + t2.StakeAmount
	WHEN NOT MATCHED THEN
		INSERT VALUES(t2.CategoryID, t2.ProdcutGroupID, t2.UserID ,t2.StakeAmount, t2.ProductID);
END
```

測試腳本改成把參數透過`uftt_PriceLimit`傳入

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

exec  [dbo].[CalculateStake] @PriceLimit
```

> 請在跑修改後的SP前記得把Table先Truncate掉，這樣可以更精準模擬

使用QueryStress模擬參數

* Iterator:30
* Thread:100

執行結果如下

![](https://i.imgur.com/fQMm2up.png)

利用`Query Stress`工具壓測發現問題解決且效能不會變差:)

## 小結:

沒想到`Merge`在`On`條件有些隱藏限制(對於On寫value condition官方只有說會有想不到的問題發生,並沒解釋原因為何...),但經過這次經驗我日後在使用`Merge`時不會直接在On使用value condition會在中間多墊一層`Table`這樣就可以使用`ON`來`JOIN`.

另外`QueryStress`真是一個對於DB壓測找問題的好工具,推薦大家去了解使用