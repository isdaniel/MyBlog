---
title: 在高併發系統不得不了解的Isolation Level(by 錢包被扣到變負值)
date: 2021-07-10 10:54:52
tags: [DB,Isolation]
categories: [DB,SqlServer,Isolation,Racing Condition]
photos: 
    - "https://i.imgur.com/K9h9Knl.png"
---

## 前言

假如我跟你說下面語法在高併發系統，UserId = 101餘額會扣到變負值你們知道問題出在哪裡嗎？

本篇會跟大家解析問題所在(DB Isolation重要性)

## 建立樣本資料 & 問題解釋

我建立一個資料表`UserAccount`並建立一個PK在`UserID`欄位上，裡面Patch一筆資料Userid = 101餘額有100元

```sql
CREATE TABLE dbo.UserAccount(
	UserID INT NOT NULL,
	Balance DECIMAL NOT NULL
	PRIMARY KEY (
		UserID
	)
);

INSERT INTO dbo.UserAccount VALUES (101,100);
```

執行扣款有bug版腳本

```sql
BEGIN TRAN
	DECLARE @UserID INT = 101,
			@Balance DECIMAL(18,4) = 1

	IF EXISTS(
		SELECT 1
		FROM dbo.UserAccount
		WHERE UserID = @UserID
			  AND Balance >= @Balance 
	)
	BEGIN
		UPDATE dbo.UserAccount
		SET Balance = Balance - @Balance
		WHERE UserID = @UserID
	END

COMMIT TRAN
```

明明上面有使用Transatcion但為什麼還是會扣成負值?

### 壓力測試數值介紹 & 問題重現

壓力測試我使用SqlQueryStress，工具使用相關介紹可以參考[資料庫壓測好工具-SQLQueryStress](https://isdaniel.github.io/sqlquerystress-intro/)

測試使用下面數值

* Thread:100
* Iterator:10

![](https://i.imgur.com/wpbx538.png)

執行畫面如上圖

執行完畢後我們在查詢此表

```sql
SELECT * FROM  dbo.UserAccount
```

![](https://i.imgur.com/Md6RyOY.png)

發現數值被扣到-70!!

明明我有判斷`Balance >= @Balance`確定有餘額才扣款為什麼會變成負值而不是0元?

## Isolation Level 介紹

此次問題要解釋必須先了解DB的Isolation Level

交易隔離有分四種

* Read UnCommited: 大家常見的**NOLOCK** hint(髒讀取)，但並不是真的沒有Lock(會放Sch-S Lock),主要是避免在髒讀取時有人對Schema異動或修改
  * ex: (NOLOCK)hint
* Read Commited: SELECT查詢已經Commit資料，在Transaction中SELECT完畢當下就會釋放掉查詢Shared Lock，Shared Lock不會保留到交易結束.
* Repeatable Read: Repeatable Read跟Read Commited最大差異是，Repeatable Read會把**Shared Lock**保留到交易結束
* Serializable Read: **Shared Lock**查詢條件**範圍**都鎖住並保留到最後(Transaction結束)
  * ex: (Hold Lock) hint
* Snapshot
  * Snapshot:在交易中讀取old version資料,就算此物件在執行中已經被commit tran
  * Read Committed Snapshot Isolation(RCSI):在交易中讀取old version資料,但如果後續讀取物件(已經被更新且commit tran)就會使用新資料(可能造成Non-repeatable )
    > (RCSI)可以使用`ReadCommittedLock`避免Non-repeatable,假如同時有其他Session在
    > 參考資料: https://dotblogs.com.tw/stanley14/2017/12/13/rcsi_vs_snapshotisolation

SqlServer預設使用`Read Commited`，`Read Commited`有一個特色是Shared Lock不會保留到交易結束.

所以假如在高併發系統中，很有可能會有多個connetion通過檢核在扣款那邊blocking，所以就導致檢核餘額大小失效.

## 解決問題

因為我知道`UserID`是唯一值且當作查詢條件，所以我可以在`EXISTS`查詢時使用`XLOCK` hint.

> 因為shared lock和Xlock互斥

所以blocking位置會從原本`UPDATE dbo.UserAccount`轉移到`SELECT 1 FROM dbo.UserAccount WITH(ROWLOCK,XLOCK) WHERE UserID = @UserID`上面就可以保證判斷條件的connection一瞬間只有一個.

所以這個解法是使用**提高lock層級**並放在**對的位置**來解決shared lock之間不互斥問題.

```SQL
SET NOCOUNT ON;

BEGIN TRAN
	DECLARE @UserID INT = 101,
			@Balance DECIMAL(18,4) = 1

	IF EXISTS(
		SELECT 1
		FROM dbo.UserAccount WITH(ROWLOCK,XLOCK)
		WHERE UserID = @UserID
			  AND Balance >= @Balance 
	)
	BEGIN
		UPDATE dbo.UserAccount
		SET Balance = Balance - @Balance
		WHERE UserID = @UserID
	END

COMMIT TRAN
```

我們在查詢`UserAccount`資料表發現用同樣的Thread和Iterator(甚至更多)來壓測Balance不會變成負值.

```sql
SELECT * FROM dbo.UserAccount
```

## 小結

本文章希望透過一個小例子跟大家分享DB Isolation Level重要性，在高併發系統中Isolation尤為重要，調整範圍大小需要對於系統有一定了解（調整太大會降低系統吞吐量,Level不足
會早成Data Racing甚至是Racing Condition）.

如果是小型系統遇到此問題機率就很低，但對於中大型系統這個問題不得不重視．
