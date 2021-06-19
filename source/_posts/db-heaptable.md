---
title: Sqlserver不可不知道Heap Table.
date: 2021-06-19 22:30:11
tags: [Sql-server,DataBase,table]
categories: [Sql-server]
---

## Heap 資料表

如果資料表沒有`Clustered Index`那此表就會是Heap資料表

Heap資料表有個特性是`Insert`資料快比較快，因為插入資料不需要考慮排序。

適合使用在Log資料表、Event資料表、稽核資料表....一直新增資料，但比較少查詢或更新的表

> 一般來說Heap資料表很少見,因為都會建議每張表都要有Clustered Index.

另外Heap資料表Data Page沒有像其他B+Tree Index有對於左右Page連結Reference.

### Heap資料表中不得不知(forwarding pointer)

假如在Heap資料表更新欄位資料，就可能會造成`forwarding pointer`如果你資料表有許多`forwarding pointer`可能就要考慮是否要優化調整....

> forwarding pointer會造成Logic read增加,因為在Heap讀取資料使用`Allocation scan`(依照儲存page順序讀取資料,讀到page有forwarding pointer就會多讀取資料頁)

`forwarding pointer`是因為原本`Page`(8KB)塞不下更新後資料就會先把資料搬到另一個新建立`Page`上並在原本`Page`建立一個類似指標東西指向它.

> `forwarding pointer`指標會存在原本的Page大小是16 byte

簡單來說就是更新後資料後發現原本`Page`塞不下更新後資料就會先把資料搬到另一個新建立`Page`上並在原本`Page`建立一個類似指標東西指向它.

> 這個指標會存在原本的Page大小是16 byte

`forwarding pointer` Page產生和概念如下圖

![](https://i.imgur.com/5drfCFZ.png)

讀取`forwarding pointer`執行動作如下圖所示

假如我們有一個Scan的需求

1. 讀取要讀`Page1`發現有些資料在其他(`Page2`,`Page3`)
2. 所以到`forwarding pointer` (`Page2`,`Page3`)搜索資料
3. 搜尋完`Page1`接者搜尋`Page2`,`Page3`

![](https://i.imgur.com/HT0bui0.png)

上面因為Page1資料`forwarding pointer`到其他Page導致Scan資料時多了2個page read,如果`forwarding pointer`數量一多對於讀的效能可想而知....

### IAM(index allocation map)

當Heap要搜尋資料`SQL-Server`透過IAM(index allocation map)去尋要掃描Page範圍，因為`IAM`會以範圍存在於檔案中的順序來表示它們，這代表循序的堆積掃描都將依檔案順序進行。

> 表示 IAM 掃描順序Heap中資料Row通常不會依插入順序傳回。

IAM Page在讀取資料的示意圖如下，可以看到讀取Page中資料順序和新增資料順序不一樣.

> 因為透過IAM Page搜索資料是在做**Allocation order scan**,這也是為什麼Heap資料表和使用`With NOLOCK`查詢資料時,如果沒有使用`ORDER BY`順序會不如預期

![](https://i.imgur.com/Qw8Kx1q.png)

### Allocation order scan & Range scan

在sqlserver底層有隱藏兩種Scan方式

* Allocation order scan: 使用with(nolock) or 查詢Heap table 使用(IAM)找尋Page和Extents

> With(Nolock)可能會遇到Dirty Read意思是讀取重覆兩筆資料,原因Nolock是sch-S lock + Allocation scan一開始讀去到資料A,讀完同時有人更新資料且資料大小大於8K造成page split,因為Allocation scan會依照(IAM)存取順序讀取,就造成資料重複讀取.

* Range scan(b-tree scan): 沒使用(IAM),靠著Clustered Index or NonClustered Index來查找資料.

## GAM & SGAM

GAM和SGAM Page可以讓SqlServer管理Page更有效率.

SQL-Server會依照Mixed或Uniforms來分配Extent使用(1個Extent可以管理8個page)

SQL Server 有兩種Allocate extend的方法，而SGAM /GAM Page就是用來計錄File中每
個Extent的使用方法及狀況,SQL Server在藉此決定資料要落地的extent位置

* GAM(Global Allocation Map):計錄哪些Extent尚未配置，會存放一個bit值對應到一個extent，如果是1就是extent not allocated。

* SGAM(Shared Global Allocation Map):計錄Extent是Mixed extent且還有Free space，會存放一個bit值對應到一個extent，如果是1代表

![](https://i.imgur.com/m4tTh7z.png)

一個GAM page可以存64K Extend使用資訊,所以一個GAM Extent可以存放4GB資料Extent資訊

> 64k * 8k(page size) * 8 (page count)  ~= 4GB

## 小結

今天對於Heap資料表有比較多深入探討,也對於Allocation order scan & Range scan做了些介紹

> 之前有跟大家說小心使用(WITH NOLOCK),就是因為With Nolock使用Allocation order scan,在高併發系統很有機會遇到Dirty Read會造成資料不如預期.

所以`WITH NOLOCK`要慎用,特別是交易系統就不要用`WITH NOLOCK`太害人了....

日後有空我會再跟大家分享Page底層的一些細節,如果要學會效能調教這些資料庫原理的事物必須學會.

雖然可能有些深澀但學成一定會有所幫助.

