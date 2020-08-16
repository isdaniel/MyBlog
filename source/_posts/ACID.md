---
title: ACID
date: 2020-06-02 22:30:11
tags: [C#,IOC,Autofac,AOP]
categories: [C#,IOC]
---

## 前言

資料庫系統在寫入或新增資料時,為了確保交易正確可靠性,所以具備

* 原子性（atomicity，稱不可分割性）
* 一致性（consistency）
* 隔離性（isolation，稱獨立性）
* 持久性（durability）

這就是我們說的ACID.

下面我會跟大家簡述ACID.

## Atomicity(原子性)

所有Logical Unit都必須符合原子性

> 整個流程要不是全部成功，不然就整段失敗，不會有部分完成

sample data.

```sql
IF (SELECT OBJECT_ID('dbo.ProductTest')) IS NOT NULL   
 DROP TABLE dbo.ProductTest;

CREATE TABLE dbo.ProductTest ( ProductID INT CONSTRAINT ValueEqualsOne CHECK (ProductID = 1)); 

CREATE TABLE Product (ProductID INT)
INSERT INTO dbo.Product 
SELECT 2

```

下面我們在sql-server有包Transation,因為`ProductTest`資料表有一個CONSTRAINT `ProductID`必須等於1,但目前`Product`表有1筆不符合此資料表有一個`CONSTRAINT`資料(ProductId=2)

如果按照(原子性)說法下面語法有包Tran應該會被RollBack,但事實上....

```sql
BEGIN TRAN

    --第一句語法
	INSERT  INTO dbo.ProductTest        
	SELECT  p.ProductID        
	FROM    dbo.Product AS p

    --第二句語法
	INSERT  INTO dbo.ProductTest VALUES (1)

COMMIT
```

我們在執行上面語法時會有一個`Error`，但第二句語法卻會成功新增資料.

此時各位會覺得很奇怪,這個語法並不符合原子性.

> 雖然Transation範圍是有包含`Logical Unit`,但Sql-Server `XACT_ABORT`預設是關閉.sta
 

1. 開啟`XACT_ABORT`（預設`XACT_ABORT`是`Off`）
    `XACT_ABORT`的開關代表,交易過程中有錯誤時是否要完整取消整段交易
2. 使用`Try...Catch`判斷`RollBack`時間點

> `Atomicity`(原子性)可以確保我們在交易過程中失敗,不會有部分成功,部分失敗,造成系統不穩定.

## Consistency(一致性)　

在Logical unit完成時不會破壞資料表制訂constraint,關聯性規則.

交易過程中並不會有任何一筆資料違反,我們制定的Check constraint的資料，PK及FK的關係也同樣不會被破壞，確保不會違反Business規則。

> sql-server因為要檢查constraint,所以會導致些許Blocking.

## Isolation

在現實生活中,會同步進行多個Translation,所以Isolation是為了確保各個交易是互相隔離不會同時互相影響(不然就有可能破壞掉他們的一致性了).

* Lock:在某段語法被執行時,會放鎖在影響範圍,不同鎖的類型會有互斥或者可共存的情況,資料庫透過鎖確保流程.
* Block:假如有兩段語法,語法A跟語法B影響資料範圍是一樣的,假如語法A先在此區域上**鎖**且語法B嘗試要在同一個區域上**鎖**,發現兩個鎖互斥,這時語法B就會等待語法A執行完後再執行(此狀態稱之為Block).
* DeadLock:交易結束前會對於影響資料範圍上鎖,如果另一個語法對於某區段資料異動就會產生Block,但如果兩個交易剛好影響範圍是互相顛倒順序,這個Block會無法被釋放....此時就會產生DeadLock(每一段時間會有一個DeadLock Monitor決定誰是被犧牲者，把她資源釋放).

交易隔離有分四種

## Isolation Level

* Read UnCommited: 大家常見的**NOLOCK** hint(髒讀取)，但並不是真的沒有Lock(會放Sch-S Lock),主要是避免在髒讀取時有人對Schema異動或修改
    * ex: (NOLOCK)hint
* Read Commited: SELECT查詢已經Commit資料，在Transaction中SELECT完畢當下就會釋放掉查詢Shared Lock，Shared Lock不會保留到交易結束.
* Repeatable Read: Repeatable Read跟Read Commited最大差異是，Repeatable Read會把**Shared Lock**保留到交易結束
* Serializable Read: **Shared Lock**查詢條件**範圍**都鎖住並保留到最後(Transaction結束)
    * ex: (Hold Lock) hint

## Durability

當你完成`Transaction`後,不管發生什麼事情資料都會完整保留在DB中，一般來說`Transaction`完成前後都會寫`Transaction log`

假如DB遇到非預期錯誤(ex:停電),在DB Server重啟後，DB會依照之前紀錄嘗試Recovery.


```sql
CREATE INDEX IX_PeriodDate_T99 ON dbo.T99(
	PeriodDate
)

ALTER TABLE dbo.T99 ADD PeriodDate AS DATEADD(MINUTE,DATEPART(MINUTE,CreateDate) %5 * -1,
	DATETIMEFROMPARTS(
	DATEPART(YEAR,CreateDate),
	DATEPART(MONTH,CreateDate),
	DATEPART(DAY,CreateDate),
	DATEPART(HOUR,CreateDate),
	DATEPART(MINUTE,CreateDate),0,0)
)

SELECT p.*
FROM dbo.T99 t 
JOIN [dbo].[ReportPeriod] p ON p.StartDate = t.PeriodDate
JOIN @Transaction t1 ON t.TransactionId = t1.TransactionId AND  p.ProductId = t1.ProductId
```
