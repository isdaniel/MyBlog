---
title: (C#) CLR-深入淺出
date: 2021-08-25 22:06:40
tags: [C#,CLR]
categories: [C#,CLR]
top:
photos: 
    - "https://i.imgur.com/vHPQhIl.png"
---

## 前文：

我們在撰寫C#時常常會聽到CLR(Common Lnguage Rumtime)，但對於CLR又認知多少呢?

本篇會跟大家介紹CLR基本且核心的物件

## CLR 簡介

編譯器在編譯時把(C#，VB，F#....)進行編譯檢查跟把程式碼轉成MSIL中繼資料，在運行期間透過JIT(just in time)會在程式運行期間把MSIL轉成每個機器可以執行組合語言

大概可以理解為下圖

![](https://i.imgur.com/Si8bQpA.png)

> 這邊我不探討Management和UnManagement物件
> MSIL也算是微軟開發語言的一個抽象

## SOS Debuger

> 注意你的電腦是 x86 or x64

SOS 偵錯延伸模組副檔名 (SOS.dll) 提供內部 Common Language Runtime (CLR) 環境的相關資訊，以協助您在 Windows 偵錯工具 (WinDbg.exe) 和 Visual Studio 中偵錯受控程式

[SOS.dll (SOS 偵錯擴充功能)](https://docs.microsoft.com/zh-tw/dotnet/framework/tools/sos-dll-sos-debugging-extension)

為了更好理解CLR運作我們使用[WinDbg](https://docs.microsoft.com/zh-tw/windows-hardware/drivers/debugger/debugger-download-tools)

利用`.loadby sos clr`進入程式查看CLR狀態吧

我使用下面的Sample Code

```C#
class Program
{
    static void Main(string[] args)
    {
        Person p = new Person();
        System.Console.WriteLine(p._age);
        Console.ReadKey();
    }
}

public class Person
{
    public int _age;

    public void AddAge()
    {
        _age++;
    }
}
```

## Application Domain

CLR在執行Manager程式碼時，會建立三個Application Domain，其中兩個AppDomain是Host在CLR主程式中(我們不可操作),只能透過CLR啟動Process(啟動的Process名叫shim操作mscoree.dll和mscorwks.dll)

* System Domain(Singleton):
    * 負責建立和初始化Shared Domain和Default AppDomain。System Domain會將mscorlib.dll載入Shared Domain，並且維護Process內部使用的隱含或顯式字符串符號。
    * System Domain建立 process-wide interface IDs (InterfaceVtableMaps)追蹤其他AppDomain，實現loading和 unloading　AppDomains.
    * 掌管[String interning](https://docs.microsoft.com/en-us/dotnet/api/system.string.intern?view=net-5.0)對於字串可以優化重用(類似String Mapping Table)，String interning允許所以AppDomain操作使用來節省Memory使用.

* Shared Domain(Singleton):
    * 載入所有系統需要library(Object, ValueType, Array, Enum, String, Delegate)在CLR程序啟動過程中。
    * SharedDomain掌管一個assembly對應表，此對應表作為SharedDomain assembly依賴關係的查找表，在DefaultDomain建立時會依照此對應表找尋所依賴其他assemblies跟使用基礎物件.

* Default AppDomain: 
    * DefaultDomain是一個AppDomain一般寫的程式會在這裡運行
    * 此區域可以建立其他AppDomain每個執行AppDomain都有自己的運作區域(記憶體操作個別獨立**互不影響**)，如果AppDomain互相需要通信可以透過.NET Remoting代理建立`System.ContextBoundObject`
    * 建立每個AppDomain都擁有自己
        * loader heaps(High-Frequency Heap, Low-Frequency Heap, and Stub Heap) 
        * Interface Vtable Map Manager  
        * Assembly Cache.
![](https://i.imgur.com/N3wWEoI.png)

> System Domain，Shared Domain都是由CLR管理的Domain

> 一般我們程式碼運作在Default AppDomain

說明完後我們利用`!eeheap`指令來查看記憶體使用資訊

![](https://i.imgur.com/p2n0Dk7.png)

能看到真的如我上面所說有三個區塊App Domain(紅色框框範圍).

> 藍色框框是Heap記憶體區段 能看到有G0，G1，G2記憶體開始位置

## EEClass

每一個class會加載一個自己的EEClass(關於此類別的描述資訊)

> 包括Interface，class，abstract class，array，struct
> 所以我們常在c#使用`Type`類型提供就是`EEClass`提供的

這是我透過winDbg 查詢出EEClass資訊

裡面有許多重要資訊

EECLass子、父關係基於繼承建立

* Parent Class:存放Parent class位置.
* Method Table:類別使用Method Table位置
* Total Method Slots:執行方法所在記憶體位置
* NumStaticFields:靜態變數數量.

CLR透過這個EEClass建立的樹狀網路瀏覽使用類別，包含類別加載，方法表，類型驗證，類型轉換

```
Class Name:      ASapmle.Person
mdToken:         02000003
File:            C:\Users\Daniel Shih\source\repos\ASapmle\ASapmle\bin\Debug\ASapmle.exe
Parent Class:    72ff15c8
Module:          029c4044
Method Table:    029c4dd8
Vtable Slots:    4
Total Method Slots:  5
Class Attributes:    100001  
Transparency:        Critical
NumInstanceFields:   1
NumStaticFields:     0
      MT    Field   Offset                 Type VT     Attr    Value Name
730042a8  4000001        4         System.Int32  1 instance           _age


Class Name:      System.Object
mdToken:         0200003d
File:            C:\WINDOWS\Microsoft.Net\assembly\GAC_32\mscorlib\v4.0_4.0.0.0__b77a5c561934e089\mscorlib.dll
Parent Class:    00000000
Module:          72ff1000
Method Table:    73002734
Vtable Slots:    4
Total Method Slots:  a
Class Attributes:    102001  
Transparency:        Transparent
NumInstanceFields:   0
NumStaticFields:     0
```

下面是EEClass加載進Memory時使用狀況

![](https://images2015.cnblogs.com/blog/250417/201706/250417-20170615105045915-1137411682.png)

> 在GC Heap建立一個物件時就會透過EEClass描述來建立物件

我們可以利用

`!dumpheap -type Person`來查看`Person`類別metadata在記憶體中如何上面所說的存放

![](https://i.imgur.com/VHsY1qy.png)

## MethodTable

ObjectInstance的TypeHandle指向MethodTable，MethodTable的訊息可以透過`System.Type`訪問

我們可以透過`!dumpmt -md {method table address}`來查看Method Table資訊

```
MethodDesc Table
   Entry MethodDe    JIT Name
733f97b8 72ffc838 PreJIT System.Object.ToString()
733f96a0 73138978 PreJIT System.Object.Equals(System.Object)
734021f0 73138998 PreJIT System.Object.GetHashCode()
733b4f2c 731389a0 PreJIT System.Object.Finalize()
02b408b0 029c4dd0    JIT ASapmle.Person..ctor()
02b40450 029c4dc4   NONE ASapmle.Person.AddAge()
```

![](https://i.imgur.com/UMhIr2r.png)


## MethodDesc

MethodDesc在CLR運行時作為最基礎的服務，方法實現封裝

> 簡單來說會存放此方法的描述

* Method Name: 方法名稱
* MethodTable: Method Table記憶體位置
* mdToken: Token的末位(編譯期就確定了)
* IsJitted:是否JIT編譯
* CodeAddr:對應程式碼位置

下圖表示程式在運作時 記憶體概念分配，能看到一開始會加載

* EEClass
* MethodDesc
* MethodTable

![](https://docs.microsoft.com/en-us/archive/msdn-magazine/2005/may/images/cc163791.fig09.gif)

每個Object Instance都有的底層資訊

* Syncblk:掌管指向Syncblk Entry Index和HashCode資料
* TypeHandle:存放對應Method Table資訊

每個Object都有Object Header (syncblk + TypeHandle) 8 bytes

![](https://images2015.cnblogs.com/blog/250417/201706/250417-20170615102713837-696225938.png)

## WinDbg clr 指令筆記

* `.loadby sos clr`:進入CLR Debug查看
* `!eeheap`:查看目前Heap使用情況
* `!dumpmt -md {address}`:查詢某個物件的Method Table
* `!dumpheap -type {type name}`:查看某個類別的詳細資訊

## 小結

越是原理的知識越不會改變且在緊要關頭有時候還可以救你一命（可以更快定位出問題）

本篇介紹了幾個CLR底層重要的物件希望對讀者們對於CLR可以有更深入的了解