---
title: 淺談SqlServer Lock(一)
date: 2020-08-16 11:12:43
tags: [DataBase,Turning,Sql-server,Lock]
categories: [DataBase,Turning]
---

# Agenda<!-- omit in toc -->
- [前文](#前文)
- [兩種圍度的Lock](#兩種圍度的lock)
	- [Lock範圍](#lock範圍)
	- [Lock類型](#lock類型)
		- [Update Lock 存在的意義](#update-lock-存在的意義)
- [小結](#小結)
## 前文

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

例如:你在使用查詢時除了被上Xlock資源外,其他都可同步被查詢

#### Update Lock 存在的意義

其實我們在更新資料時使用Lock類型會如下

> S => U => X

但為什麼會多一個Update Lock呢?

> 因為可以避免DeadLock產生機率.

假如有一個Update語法同時被執行.

```sql
Update T
Set Val = @Val
Where id = 1
```

如果只有 S Lock => X Lock

1. 語法1 產生SLock
2. 語法2 產生SLock
3. 因為SLock 和 XLock 互斥,所以互相等待對方的SLock釋放，造成死結(Dead Lock)

假如我們多一個ULock會變成

1. 語法1 產生SLock
2. 語法2 產生SLock
3. 語法1 產生ULock(釋放SLock)
4. 語法2 想要產生ULock發現語法1已經先產生(ULock)，所以等待語法1執行完畢(Block)
5. 語法1 Update完後產生XLock直到Commit結束才釋放XLock
6. 語法2 產生ULock執行後面更新動作.

> Shared Lock執行完查詢後立即釋放資源
> 關鍵在於SLcok不互斥,ULock互斥

```sql
DROP TABLE IF EXISTS T2

CREATE TABLE T2 (Id int)

INSERT INTO T2 VALUES (1)
INSERT INTO T2 VALUES (2)

CREATE CLUSTERED INDEX CIX_ID ON dbo.T2(ID)

BEGIN TRAN

UPDATE dbo.T2 
SET ID = ID 
WHERE ID = 1

WAITFOR DELAY '00:00:10'

ROLLBACK TRAN

SELECT *
FROM dbo.T2 
WHERE Id = 1
```


## 小結

> https://docs.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide?view=sql-server-2017