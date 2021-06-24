---
title: 【深入淺出】Base編碼 (Base64為例子)
date: 2019-05-29 22:39:17
tags: [WebDesign,Base64,Encoding]
categories: WebDesign
top:
photos: 
    - "http://i.imgur.com/4wh9OVF.png"
---

Base家族以Base64最為出名，這邊會用Base64編碼來做介紹

寫網站應該都用過Base64但你對於他的原理了解嗎?

此篇和大家分享Base家族的秘密

-----

## 用途：

Base64主要用途是某些系統中只能使用ASCII字符，為了避免某些機器無法識別我們傳輸資料

Base64就是用來將非ASCII字符的數據轉換成ASCII字符的一種方法。

>　base64特別適合在http，mime協議下快速傳輸數據(例如我們常使用 Email)

它使用下面表中所使用的字符與編碼。

![http://www.asciitable.com/index/asciifull.gif](http://www.asciitable.com/index/asciifull.gif)

[圖片連結](http://www.asciitable.com/)


`Base64` 中的64其實是有含意的

他會把資料轉成

    a~z (26)
    A~Z (26)
    0~9 (10)
    + (1)
    / (1)
上面編碼成上面五種種類字元的資料 64就是把所以可用字元數量總合

> 64 = 26+26+10+1+1

-----

## 原理：

那Base64是怎麼將資料轉成`a~z，A~Z，0~9，/，+`的組合呢?

最終目標想要把資料轉成在Ascii Code 0 ~ 127 的字元

[Base64 wiki說明](https://zh.wikipedia.org/wiki/Base64)

> 轉換的時候，將3位元組的資料，先後放入一個24位元的緩衝區中，先來的位元組占高位。資料不足3位元組的話，於緩衝區中剩下的位元用0補足。每次取出6位元，按照其值選擇ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/中的字元作為編碼後的輸出，直到全部輸入資料轉換完成。

這邊有幾個重點

1. 會把資料分割成每 3 byte (24bit) 為單位
2. 資料不足3 byte的話，於緩衝區中剩下的bit用0補足
3. 計算出來值依照下表索引轉換成Base64可用字元 ![Base64 wiki說明](http://i.imgur.com/4wh9OVF.png)
4. 直到全部輸入資料轉換完成

下面有個例子方便大家了解！

-----

## 實際例子：
先來看看下面的例子：

`BC` 用 `Base64` 轉成 `QkM=` 過程．

1. 將字元轉換成二進制

* B (66) = 0    1    0    0    0    0    1    0
* C (67) = 0    1    0    0    0    0    1    1

2. 資料不足3 byte的話，於緩衝區中剩下的bit用0補足，所以我們將第三個Byte資料用0補齊

3. 最左邊數字為頭，用每組６bit來重新分組轉換後的資料.

4. 將轉換後的資料依照Base64轉換表 轉換成Base64字元.

![img](/images/Base64_1.PNG)

Base64編碼	Q	k	M	=
範例來自於Wiki

> = 並不是`Base64的字元 而是代表補0使用的
雖然Base64在最後常常會看到 = 或 == 結尾，那是因為遇到要補位的情況.如果字元剛剛好滿的狀態(3 bytes)就不會看到 = 符號

![img](/images/Base64_2.PNG)
範例來自於Wiki

## 小結：

Base64分享到這邊！

其實Base家族除了64還有 `Base32,Base16 ....` 你也可以自行依照上面算法建立自己 Base 編碼.

`Base32 : a~z , 2~7`

原理其實都是一樣的