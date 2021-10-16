---
title: 淺談SqlServer Lock(一)
date: 2020-08-16 11:12:43
tags: [DataBase,Turning,Sql-server,Lock]
categories: [DataBase,Turning]
top:
photos: 
    - "https://i.imgur.com/3WWvSXp.png"]
keywords: DataBase,Turning,sql-server,Index
description: 假如你的系統能保證只有一個使用著操作每個資源,其實也就不用lock存在,但現實生活中往往有個命令對於同一個資源操作.這時候我們為了確保資料正確性,必須使用 lock 來避免 Racing Condition
---


# Agenda<!-- omit in toc -->
- [前文](#前文)
- [兩種圍度的Lock](#兩種圍度的lock)
	- [Lock範圍](#lock範圍)
	- [Lock類型](#lock類型)
		- [Update Lock 存在的意義](#update-lock-存在的意義)
- [Lock互斥Demo](#lock互斥demo)
	- [NoLock的隱憂](#nolock的隱憂)
		- [Read Uncommitted 髒讀取](#read-uncommitted-髒讀取)
- [小結](#小結)
## 前文

之前有跟大家介紹資料庫交易中的[ACID](https://isdaniel.github.io/ACID/),今天我們就來談談常常聽到**Lock**

在討論Lock前我們必須先了解,為什麼會有Lock?

假如你的系統能保證只有一個使用著操作每個資源,其實也就不用lock存在,但現實生活中往往有個命令對於同一個資源操作.這時候我們為了確保資料正確性,必須使用lock來避免[Racing Condition](https://en.wikipedia.org/wiki/Race_condition).

在早期系統我們要儲存資料會存放檔案在Disk並使用類似Excel方式來儲存,但這會導致每次讀取只有有一個使用者(因為對於檔案上Lock),被lock資源其他人就無法存入

## 兩種圍度的Lock

在`Sql-Server` Lock有分兩種圍度

1. Lock範圍
2. Lock類型

### Lock範圍

`Sql-Server`支援我們在同一時間能建立不同交易執行命令
是因為`Sql-Server`有許多不一樣力度範圍Lock.

> 下表表示鎖範圍等級由上到下越來越大. 

* Row (•RID) 
* Key (•KEY) 
* Page (•PAG) 
* Extent (•	EXT) 
* Heap or B-tree (•	HoBT) 
* Table (•	TAB) 
* File (•	FIL) 
* Application (•	APP) 
* MetaData (•	MDT) 
* Allocation Unit (•	AU) 
* Database (•DB)

### Lock類型

在SqlServer有許多類型Lock

* Shared Locks (s)
* Update Locks (U)
* Exclusive Locks (X)
* Intent Locks (I)
* Schema Locks (Sch)
* Bulk Update Locks (BU)
* Key-range

下表是Lock類型互斥或相容對應表

![](https://i.imgur.com/YaBZcaT.png)

例如:你在使用查詢(Shared Lock),除了上XLock資源外其餘資料都可同步被查找出來.

#### Update Lock 存在的意義

我們在更新資料時使用Lock類型會如下

> Shared Lock => Update Lock => XLock

* Shared Lock:查詢更新的資料.
* Update Lock:更新前把資料改成Update Lock.
* XLock:確定要更新當下改成XLock.

但為什麼會多一個Update Lock呢?

> 因為可以避免DeadLock產生機率.

假如有一個Update語法同時被執行.

```sql
Update T
Set Val = @Val
Where id = 1
```

如果只有Shared Lock => XLock

1. 語法1 產生Shared Lock
2. 語法2 產生Shared Lock
3. 因為Shared Lock 和 XLock 互斥,所以互相等待對方Shared Lock釋放，造成死結(Dead Lock)

假如我們多一個ULock會變成

1. 語法1 產生Shared Lock
2. 語法2 產生Shared Lock
3. 語法1 產生ULock(釋放Shared Lock)
4. 語法2 想要產生ULock發現語法1已經先產生(ULock)，所以等待語法1執行完畢(Block)
5. 語法1 Update完後產生XLock直到Commit結束才釋放XLock
6. 語法2 產生ULock執行後面更新動作.

> Shared Lock執行完查詢後立即釋放資源
> 關鍵在於Shared Lcok不互斥,ULock互斥

## Lock互斥Demo

我們建立一張`T2`資料表

```sql
DROP TABLE IF EXISTS T2

CREATE TABLE T2 (Id int)

INSERT INTO T2 VALUES (1)
INSERT INTO T2 VALUES (2)
```

在使用Transaction + XLOCK hint在查詢語法(這時T2查詢的資料就會被上XLock了)

```sql
BEGIN TRAN

SELECT * 
FROM T2 WITH(XLOCK) 
WHERE Id = 1

WAITFOR DELAY '00:00:10'

ROLLBACK TRAN
```

我們馬上開另一個Session,執行查詢`ID=1`語法

```sql
SELECT *
FROM dbo.T2 
WHERE Id = 1
```

會發現我們需要等上面語法執行完才能查出資料,那是因為我們Shared Lock跟X Lock會互斥我們,必須等到XLock執行完我們才可以得到資料.

### NoLock的隱憂

上文有提到Shard Lock會被XLock給Block住,如果我非得在資料上XLock時查詢資料有辦法嗎?

有,我們在第二句查詢加上`With(Nolock)`hint或者是(設定`SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED`)不然Shard Lock會被XLock給Block住.

> 但使用`With(Nolock)` Read Uncommitted要慎用,因為是髒讀取,(Read Uncommitted顧名思義就是讀取未`commite`資料)

#### Read Uncommitted 髒讀取

我們試著把上面範例稍微修改一下第一個查詢語法

```sql

BEGIN TRAN

UPDATE dbo.T2
Set id = 100
where id = 1

WAITFOR DELAY '00:00:10'

ROLLBACK TRAN
```

第二個查詢語法

```sql
SELECT *
FROM dbo.T2 with(nolock)
WHERE Id = 100
```

在資料上XLock時使用`with(nolock)`來查詢資料,會發現可以查詢出Id=100資訊

![](https://i.imgur.com/aMvPo4W.png)

但因為第一句語法因為一些原因RollBack,過段時間再查詢

![](https://i.imgur.com/5BqG419.png)

我們會得到空的結果集...那是因為`with(nolock)`是髒讀取,在查詢時他會直接拿取目前資料最新狀態(這個資料狀態可能不一定,最後結果),假如RollBack就會導致資料錯誤問題.

> 有時候NoLock會讀到重複資料
> 所以建議在跟算錢或交易有關程式碼,請別使用`with(nolock)`

## 小結

本篇對於Lock做了基本介紹

1. Lock範圍
2. Lock類型

`with(nolock)`記得要慎用,他會造成資料讀取上有誤差,建議在高併發系統且交易有關程式碼,請別使用`with(nolock)`,這會造成資料不正確(有資料執行到一半RollBack,剛好被NoLock查詢讀到)

日後有機會再慢慢介紹更多Lock運用時間和注意事項.

[Transaction Locking and Row Versioning Guide](https://docs.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide?view=sql-server-2017)