---
title: .Net 三種區塊記憶體位置 Heap , Stack , Globle??
date: 2020-10-22 11:12:43
tags: [C#,Memory,Heap]
categories: [C#,Memory]
---


**前文:**

寫.Net 寫一陣子了 突然覺得一些基本功好重要

之前都沒發現原來.Net 有三種區塊的記憶體空間

這三個區域都有他們各自的含義....

                    </div>

.Net 有三種區塊的記憶體空間

Globle：

1. 全域記憶體
2. 主要存放全域變數或宣告為static的靜態變數

Heap ：

1. 存放參考類型(可動態產生的空間)
2. **運行期間**分配記憶體位置(這就是為什麼參考類型的類別要new)
3. 基本是Class關鍵字

自定義型別都為參考類型，new 動態分配記憶體空間

## Stack ：

1. 存放值類型的值(int,double,float,byte .....)
2. 存放**參考類型記憶體**位置(Pointer指針)
3. **編譯期間**就知道運行時的記憶體位置

## 何謂動態配置記憶體?

**Heap**跟**Stack**記憶體使用狀況可想像成

我們可以看到如果是**參考類型**物件，在 new 時動態配置一塊記憶體位置並讓 Stack 使用物件指向他.

![](https://dotblogsfile.blob.core.windows.net/user/%E4%B9%9D%E6%A1%83/dc60b613-5aab-4031-b07e-ba95b3eb8c59/1519278342_30764.png)

值得一提 動態配置的記憶體空間基本上都是要自行回收的

例如 C++ 和 C 自己new 的空間要自己回收

```c
c++ = free()
c = malloc()
```

但C#和Java因為有GC (拉機回收器)

幫我們去檢查沒有用到的Heap記憶體位置並幫我們回收

真的是太幸福啦~~

想要深入了解 Heap和Stack使用差異的小伙伴可以點入 [Struct V.S Class 兩者之間差異](https://dotblogs.com.tw/daniel/2018/02/22/135011)

## 參考文章

[執行時期儲存兩大要角](http://antrash.pixnet.net/blog/post/70456505-stack-vs-heap%EF%BC%9A%E5%9F%B7%E8%A1%8C%E6%99%82%E6%9C%9F%E5%84%B2%E5%AD%98%E5%85%A9%E5%A4%A7%E8%A6%81%E8%A7%92)
