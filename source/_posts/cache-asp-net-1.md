---
title: Asp.net使用快取 (一)
date: 2019-05-27 08:26:31
tags: [C#,Asp.net,cache]
categories: C#
---

最近回答[SQL Server data caching in ASP.NET](https://stackoverflow.com/questions/51160978/sql-server-data-caching-in-asp-net/51161277#51161277)問題,且有人問我有關快取的問題.

所以小弟打算寫兩篇文章簡單分享我知道的*快取*

-----
## 目錄:

### 第一篇 

1. 為何要使用快取
2. 快取操作
3. Asp.Net中使用快取 by `HttpRuntime.Cache`

### 第二篇 
1. 提出介面,提高可替換性
2. 使用**泛型**改寫快取 讀取方式
3. 使用**擴充方法**改寫快取
-----

## 正文

快取機制很重要,但有些觀念可能要先釐清楚

### 為何要使用快取

在使用一個東西前,使用的原因很重要.

如果某些資料**常常使用**,但卻**不常改變**我們會把資料存在某個空間中(常常會存記憶體,因為記憶體速度快),方便日後讀取使用.

### 快取操作

一般使用快取會有兩個動作,讀和寫
如果是存在記憶體中一般會有期限,因為記憶體資源很寶貴不能一直占用.

* 寫入

通常有一個**Key**,跟要存入**物件**
就像我們把東西存入保險箱,會拿到一個鑰匙 來取東西

* 讀取

讀取就是依照Key讀取我們存入的物件

就像我們要拿保險箱裡的東西需要的鑰匙

1. Asp.Net中使用快取 by `HttpRuntime.Cache`

在Asp.net中 有一個靜態物件  `HttpRuntime.Cache` 可以很方便使用快取

* 存入快取可以呼叫 `Insert` 方法

他有多個重載 可以使用最簡單的 `Insert(string [key],object [value])`

如下面範例

``` c#
System.Web.Caching.Cache cacheContainer = HttpRuntime.Cache;
string data = "";
cacheContainer.Insert("test1", data);
```

* 讀取快取資料

呼叫 `Get` 傳入Key值即可獲得  Note:如果快取容器沒有此物件會回傳`NULL`

```c#
string cacheData = cacheContainer.Get("data") as string;
```

小結:這篇簡單介紹快取 下篇會將目前程式碼做改進,變得更優美彈性