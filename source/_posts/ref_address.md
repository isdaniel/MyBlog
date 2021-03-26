---
title: 五分鐘快速了解 [傳址，傳參考，傳址]
date: 2019-05-27 21:13:34
tags: [C#,Memory,call by value,call by adress,call by reference]
categories: [C#]
---
**傳址，傳參考，傳址**  是基本但重要的概念。此概念在很多語言都通用

我使用Gif動畫檔 快速帶領大家了解 **傳址，傳參考，傳址**

1. 傳值(Call By Value)

    顧名思義 是把`值`傳到 另一個`記憶體位置`的`值`上

![https://dotblogsfile.blob.core.windows.net/user/%E4%B9%9D%E6%A1%83/e39d0fd8-5258-4484-949c-3019082ff20e/1519627294_92268.gif](https://dotblogsfile.blob.core.windows.net/user/%E4%B9%9D%E6%A1%83/e39d0fd8-5258-4484-949c-3019082ff20e/1519627294_92268.gif)
1. 傳址 (Call By Adress)

是把`記憶體位置`傳到 另一個`記憶體位置`的`值`上
    
> 補充:嚴格來說(`Call By Adress`)是不正統的說法,其實傳址也是傳值但傳的是`記憶體位置`    

![https://dotblogsfile.blob.core.windows.net/user/%E4%B9%9D%E6%A1%83/e39d0fd8-5258-4484-949c-3019082ff20e/1519627835_01874.gif](https://dotblogsfile.blob.core.windows.net/user/%E4%B9%9D%E6%A1%83/e39d0fd8-5258-4484-949c-3019082ff20e/1519627835_01874.gif)

1. 傳參考(Call By Reference)

   是把`記憶體位置`傳到  移到另一個`記憶體位置`上 (可看作同一個物件)
   
![https://dotblogsfile.blob.core.windows.net/user/%E4%B9%9D%E6%A1%83/e39d0fd8-5258-4484-949c-3019082ff20e/1519627909_09266.gif](https://dotblogsfile.blob.core.windows.net/user/%E4%B9%9D%E6%A1%83/e39d0fd8-5258-4484-949c-3019082ff20e/1519627909_09266.gif)

在C#廣義來說

* 基本型別 Struct (int,double,float,byte ...)  可看作 傳值

* 一般型別 Class (自訂Class ,SqlConnection....)  可看作 傳址  更精確來說是傳Stack的值(指向Heap的記憶體位置)


**在C#中並沒傳參考，只有傳值和傳址**
