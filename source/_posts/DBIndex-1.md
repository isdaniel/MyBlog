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
  - [建立太多索引,小心降低新增、更新效率](#%e5%bb%ba%e7%ab%8b%e5%a4%aa%e5%a4%9a%e7%b4%a2%e5%bc%95%e5%b0%8f%e5%bf%83%e9%99%8d%e4%bd%8e%e6%96%b0%e5%a2%9e%e6%9b%b4%e6%96%b0%e6%95%88%e7%8e%87)
- [Clustered Index(叢集索引)](#clustered-index%e5%8f%a2%e9%9b%86%e7%b4%a2%e5%bc%95)
- [NonClustered Index(非叢集索引)](#nonclustered-index%e9%9d%9e%e5%8f%a2%e9%9b%86%e7%b4%a2%e5%bc%95)

## 前文

`Index`第一個欄位至關重要它會影響資料**統計值**結果，`Index`一般建立在查詢條件的欄位

> 每個`Index`都擁有自己的`B+ tree`.

## 沒有Index的資料表

## Index中的B+ tree

`B+ tree`是一種資料結構這個資料結構被`Index`拿來使用，關於`B+ tree`網路上有很多資源可再自行尋找，所以我們來談談為什麼`DataBase`會使用`B+ tree`

在[Wiki](https://zh.wikipedia.org/wiki/B%2B%E6%A0%91)講述`B+ tree`有其中一段

> `B+ tree`是能夠保持資料穩定有序，其插入與修改擁有較穩定的對數時間複雜度。`B+ tree`元素由下而上插入，通過最大化在每個內部節點內的子節點的數目減少樹的高度，平衡操作不經常發生，而且效率增加了。這種價值得以確立通常需要每個節點在次級儲存中占據完整的磁碟塊或近似的大小。

簡白來說`B+ tree`有一個特性是他會把資料存在子葉中並且透過連結把每個子葉串聯起來，提高他的穩定度.

## Index優缺點

在`SQL-Server`上如果此資料表沒有建立`Index`就為`Heap`資料表.

### 建立太多索引,小心降低新增、更新效率

之所以`Index`可以加快查詢速度，是`Index`以**空間**換取**時間**。

基本上它使用的資源如下:

1. 每個索引都會建立一顆 `b+ tree`
2. 每次新增、更新資料時都會改變 `b+ tree`

所以當你索引越多時，你需要維護的`Index`越多(代表需要更多資源來維護)

## Clustered Index(叢集索引)

## NonClustered Index(非叢集索引)