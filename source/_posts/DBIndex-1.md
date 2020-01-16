---
title: 
date: 2019-06-02 11:12:43
tags: [DataBase,Turning,Sql-server]
categories: [DataBase,Turning]
---
# Agenda<!-- omit in toc -->
- [前文](#%e5%89%8d%e6%96%87)
- [沒有Index的資料表](#%e6%b2%92%e6%9c%89index%e7%9a%84%e8%b3%87%e6%96%99%e8%a1%a8)
- [Index中的B+ tree](#index%e4%b8%ad%e7%9a%84b-tree)
- [Index優缺點](#index%e5%84%aa%e7%bc%ba%e9%bb%9e)
- [Clustered Index(叢集索引)](#clustered-index%e5%8f%a2%e9%9b%86%e7%b4%a2%e5%bc%95)
- [NonClustered Index(非叢集索引)](#nonclustered-index%e9%9d%9e%e5%8f%a2%e9%9b%86%e7%b4%a2%e5%bc%95)
  - [Key Lookup](#key-lookup)
  - [RID Lookup](#rid-lookup)

## 前文

`Index`第一個欄位至關重要它會影響資料**統計值**結果，`Index`一般建立在查詢條件的欄位

> 每個`Index`都擁有自己的`B+ tree`.

## 沒有Index的資料表

## Index中的B+ tree

`B+ tree`是一種資料結構這個資料結構被`Index`拿來使用，關於`B+ tree`網路上有很多資源可再自行尋找，所以我們來談談為什麼`DataBase`會使用`B+ tree`

在[Wiki](https://zh.wikipedia.org/wiki/B%2B%E6%A0%91)講述`B+ tree`有其中一段

> `B+ tree`是能夠保持資料穩定有序，其插入與修改擁有較穩定的對數時間複雜度。`B+ tree`元素由下而上插入，通過最大化在每個內部節點內的子節點的數目減少樹的高度，平衡操作不經常發生，而且效率增加了。這種價值得以確立通常需要每個節點在次級儲存中占據完整的磁碟塊或近似的大小。

簡白來說`B+ tree`有一個特性是他會把資料存在子頁中並且透過連結把每個子頁串聯起來，提高他的穩定度.

`B+ tree`資料結構如下圖，這個資料結在在範圍查詢時較`B tree`來的更穩定

![](https://i.imgur.com/8CDe0Ms.png)

Index真正在使用`B+ tree`儲存類似於下圖

此圖來自(Pro SQL Server Internals, 2nd edition)

![](https://i.imgur.com/FnQlBUl.png)

## Index優缺點

建立太多索引，小心降低新增、更新效率，`Index`可以加快查詢速度，是`Index`以**空間**換取**時間**。

基本上它使用的資源如下:

1. 每個索引都會建立一顆 `b+ tree`
2. 每次新增、更新資料時都會改變 `b+ tree`

所以當你索引越多時，你需要維護的`Index`越多(代表需要更多資源來維護)

## Clustered Index(叢集索引)

每個資料表只能有一個`Clustered index`，資料表會依照`Clustered index`方式存放排列資料，`Clustered Index`跟資料一起放置在`Left`子頁層

> `Cluster index`好比書籍頁碼目錄。每本書只能有一個目錄

建立`Clustered Index`欄位有幾個重點

1. 常用於查詢欄位
2. 可識別度高(唯一性較高)

## NonClustered Index(非叢集索引)

每個資料表能有許多`non-cluster index`，像每本書可以有很多種索引目錄，例如依照字母排序、依照附錄A、附錄B

`NonClustered Index`(index page)上所有分葉節點存放指標，如果資料表已存在`Clustered Index`，那麼該指標將會指向叢集索引，如不存在將指向資料真實存放位置

> this is a very important point to remember. Nonclustered indexes do not store information about physical row location when a table has a clustered index. They store the value of the clustered index key instead.

上面簡單來說如果`NonClustered Index`沒有包含所有要查詢欄位

1. 有`Clustered Index`，會執行`Key Lookup`
2. 沒有`Clustered Index`，會執行`RID Lookup`

> 這裡的`RID`是指向真實資料位子`RowID`

### Key Lookup

`NonClustered Index`中會存放此Row在`Clustered Index`相對位置，假如單單靠搜尋`Non-Clustered Index`沒有辦法滿足所有查詢需要資料就會去`Key Lookup`(by Clustered key)回`Clustered Index`取出相對應的資料.

此存取就稱為`Lookup`，`lookup`會消耗`Disk I/O`，所以所耗的時間相對會比較大

### RID Lookup

資料表沒有`Clustered Index`且使用`Index`所有查詢欄位不包含在`Converting Index`中就會透過`RID Lookup`查找確切Page上的Row(藉由`Row-Id`)

> RID Key:8 byte.