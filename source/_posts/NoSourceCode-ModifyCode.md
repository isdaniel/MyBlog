---
title: 沒有Source Code 如何修改程式??
date: 2019-06-02 22:30:11
tags: [C#,Reflection,Decompile]
categories: [C#]
---

## 前言：

某些專案因為歷史久遠沒有Source Code,但有個需求需要異動裡面的程式該怎麼辦??

難道只能整個反組譯,查看程式碼翻一份做新的嗎?

不~~其實有辦法直接對於DLL進行修改

只需使用 ** [Reflexil](https://github.com/sailro/Reflexil) 搭配 [ILSpy](https://github.com/icsharpcode/ILSpy) 或其他支援的反**組譯​**軟體 **

> Reflexil 是一個組譯編輯器插件目前支援 **Reflector**, **ILSpy** 和 **Telerik's JustDecompile**. 

下載連結

[<strong itemprop="name">Reflexil **Release 2.2 </strong>](http://github.com/sailro/Reflexil/releases/tag/v2.2)搭配 [ILSpy version 3.2](https://github.com/icsharpcode/ILSpy/releases/tag/v3.2.0) 

-----

## 前置動作，安裝

### Reflexil 下載

下載 `reflexil.for.ILSpy.2.2.bin.zip`，不用下載AIO

![](https://az787680.vo.msecnd.net/user/九桃/68939397-ab27-4f33-9bff-a6e1fe570acb/1545445075_84536.png)

作者有說

*   <div class="note note--important">[ILSpy version 3.2](https://github.com/icsharpcode/ILSpy/releases/tag/v3.2.0) (ILSpy 4 is not currently compatible with Reflexil, given the use of System.Reflection.Metadata, deprecating Mono.Cecil usage)</div>

`ILSpy 4 `當前版本 `ILSpy.2.2` 並不支援

## ILSpy 3.2 下載

![](https://az787680.vo.msecnd.net/user/九桃/68939397-ab27-4f33-9bff-a6e1fe570acb/1545445185_3282.png)

下載完後就把全部的DLL放在同一個資料夾下,並開啟 `ILSpy.exe`

![](https://az787680.vo.msecnd.net/user/九桃/68939397-ab27-4f33-9bff-a6e1fe570acb/1545445435_24298.png)

按下上方的齒輪UI 就可獲得下方藍色的Reflexil 修改框框.

![](https://az787680.vo.msecnd.net/user/九桃/68939397-ab27-4f33-9bff-a6e1fe570acb/1545445493_79646.png)

-----
-----
## 組件修改

### 需求

目前組件 有個ClassA 類別,裡面有一個prop1屬性 型態是string, 我們希望在這新增另一個屬性

![](https://az787680.vo.msecnd.net/user/九桃/68939397-ab27-4f33-9bff-a6e1fe570acb/1545446072_21457.png)

使用滑鼠右鍵點擊類別`ClassA`,我們可以看到很多方式可以注入新的程式碼

在這我們選擇`inject property`. 

![](https://az787680.vo.msecnd.net/user/九桃/68939397-ab27-4f33-9bff-a6e1fe570acb/1545446266_25885.png)

我們需要修改的是

*   Item Name (使用屬性的名稱)
*   Property Type(使用屬性類別)

![](https://az787680.vo.msecnd.net/user/九桃/68939397-ab27-4f33-9bff-a6e1fe570acb/1545446422_66604.png)

選擇完後按下OK,我們就會發現`prop2`新屬性會出現在`ClassA`中.

<div class="note note--danger">新增完後不代表已經將修改儲存!!</div>

![](https://az787680.vo.msecnd.net/user/九桃/68939397-ab27-4f33-9bff-a6e1fe570acb/1545446504_58205.png)

我們需要點選組件，之後再按下`Save AS` 把本次修改儲存

![](https://az787680.vo.msecnd.net/user/九桃/68939397-ab27-4f33-9bff-a6e1fe570acb/1545446789_43637.png)

日後我們就可以使用新的屬性在我們程式中了!!

## 小結

此插件還可以新增,插入許多東西時屬非常強大,有興趣的玩家可再自行深入琢磨.

