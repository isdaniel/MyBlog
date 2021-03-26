---
title: 淺談-編碼(encoding) vs 加解密 vs 雜湊(Hash)
date: 2019-05-23 19:32:08
tags: [Base64,AES,SHA256,Encoding,Hash]
categories: WebDesign
---
這一邊有三筆資料

* U2FsdGVkX19FJsgVyam+Gh2EwmGs4BEJjJJsWxCXHWw84gp3uHvozWsHY8gfAx0C
* VG9kYXkgaXMgYSBnb29kIERheQ==
* 046a484a529ecfc7693753ee65802b5cfcafd548252d0e5f1bca845ad2208b91

這三個東西看起來都是亂碼，但所代表含意完全不一樣

這邊會跟大家分享這三個東西特性和差異性

此文同步發布 Blog [[淺談] 編碼(encoding) vs 加解密 vs 雜湊(Hash)](https://dotblogs.com.tw/daniel/2019/05/06/223004)

 
# 前言：

會想分享這篇文章是因為蠻多人把

* 編碼(encoding)
* 加解密
* 雜湊(Hash) 

這三個東西搞混，尤其是把編碼當作加密....這是非常危險的事情. 

    編碼!= 加密 兩個是完全不一樣的東西
    編碼!= 加密 兩個是完全不一樣的東西
    編碼!= 加密 兩個是完全不一樣的東西
    
很重要所以要說三次XD! 

-----

# 編碼
## 說明：

這邊用`Base64`編碼來介紹，我們可以看到下圖資料轉換是雙向的．

    Hello Daniel　=>  SGVsbG8gRGFuaWVs
如果我們想要把`SGVsbG8gRGFuaWVs` 變回 `Hello Daniel` 只需進行`Base64`解碼即可

![](https://az787680.vo.msecnd.net/user/%E4%B9%9D%E6%A1%83/be1dd9ce-3ce4-4404-ac0a-fe66ae2c64c1/1557148998_19694.png)

編碼是將原本的資料經過一個運算轉換成另一組資料,如果要還原成原本資料解碼

## 用途：
在網路傳輸會使用到編碼主要是資料在傳輸時有些特殊字元,有特殊用途(ex:Http 傳參數  &....)

這時就可使用編碼將資料轉換成不會衝突到字串.

如果想要了解 Base64 原理和演算法的話可以看我另一篇{% post_link base64-principle %}

-----

# 加解密
## 說明：

這邊以`AES`來介紹，我們可以看到下圖資料轉換是雙向，但會透過一個Key來做轉換(這邊是和編碼最大的差別)

![](https://az787680.vo.msecnd.net/user/%E4%B9%9D%E6%A1%83/be1dd9ce-3ce4-4404-ac0a-fe66ae2c64c1/1557149615_79307.png)

要還原成原始資料我們只能透過一樣的Key才可以達成，就像一個寶相只有唯一一把鑰匙可以打開一樣．

這邊補充一個簡單加密法(凱薩算法)，他是使用字元位移的數字來當作Key

如果位移數量是1 `ABCD => BCDE`

如圖

![](https://upload.wikimedia.org/wikipedia/commons/2/2b/Caesar3.svg)

## 用途：
加密可以確保資料的安全性（只有相同的Key才可還原成原本資料）很適合用在機密資料且須要還原使用

-----

# 雜湊(Hash) 
## 說明：
這裡用`Sha256`來當作範例

Hash有幾個特點

1. 不管資料量多大經過SHA256運算字串長度都是一樣的
2. `SHA256`的原因是運算完的資料大小一定是 `256 bit`
3. 她是一個不可逆的算法所以我們可以看到箭頭是單向.
4. 相同的值用SHA運算過後值都是一樣的


![](https://az787680.vo.msecnd.net/user/%E4%B9%9D%E6%A1%83/be1dd9ce-3ce4-4404-ac0a-fe66ae2c64c1/1557152092_14191.png)

一定會有小夥伴好奇,運算完都是固定長度 那會不會出現一個情況,原始資料不一樣但算完`Hash`結果是一樣的

    會 這個我們稱之為雜湊碰撞 這個機率很小
    
## 用途：
一般我們可以把使用者密碼經`Hash`運算存入資料庫中,當作使用唯一識別碼(像指紋)下次使用者登入用運一樣的`Hash`算法 再將值拿來比較辨識使用者合法性.

-----

## 小結：
對於這邊有一個簡單的比較表格

* 編碼(encoding)
* 加解密
* 雜湊(Hash) 


![https://ithelp.ithome.com.tw/upload/images/20190510/20096630rEP4mvVyso.png](https://ithelp.ithome.com.tw/upload/images/20190510/20096630rEP4mvVyso.png)

加解密和編碼最常被大家誤會搞錯地方是以為使用`Base64`編碼就很安全(但有心人事取得你的資料只要知道你使用編碼就可以還原成原始資料)

如果要確保資料隱密性時可以使用加解密而不是編碼

所以別再把`Base64`編碼當作加密工具來使用.

這是很危險低