---
title: IOC(控制反轉)，DI(依賴注入) 深入淺出~~
date: 2019-05-26 22:31:09
tags: [C#,IOC,Autofac,Design-Pattern]
categories: [C#,IOC]
---

`IOC`是一個oop重要的程式設計思想。

學一個技術或思想前我們先了解，這個技術或思想為我們解決怎樣問題。

`Ioc—Inversion of Control` 控制反轉
控制反轉是一個設計思想 ，把對於某個物件的控制權移轉給第三方容器

## 簡單解釋

A物件程式內部需要使用B物件 A,B物件中有依賴的成份

控制反轉是把原本A對B控制權移交給第三方容器

降低A對B物件的耦合性，讓雙方都倚賴第三方容器。

* 反轉概念如下圖

![pic](https://dotblogsfile.blob.core.windows.net/user/%E4%B9%9D%E6%A1%83/493ce9d9-64bd-4343-a145-16ab21f3c695/1555312814_72597.png)

>我們可發現有兩點差異

1. 使用者原本直接耦合於A，但使用IoC容器使用者就直接對容器而不是A 至於A關連於誰由容器決定
原本A直接控制於B,C，但透過一個IoC容器我們控制權反轉給了容器

2. IoC經典實現對象設計法則　好萊塢法則：“別找我們，我們找你”
系統中模組建議依賴抽象，因為各個模組間不需要知道對方太多細節（實作），知道越多耦合越強。
DI—Dependency Injection 依賴注入

>把被依賴物件注入被動接收物件中

## 案例解釋：

小明是個愛乾淨的人，但他工作時常加班導致

學一個技術或思想前我們必須先了解，這個技術或思想可為我們解決什麼問題。

`Ioc(Inversion of Control)`控制反轉

**控制反轉是一個設計思想**

簡單解釋

A物件程式內部需要使用B物件 A,B物件中有依賴的成份

控制反轉把原本A對B直接控制權移交給由第三方容器

降低A對B物件的耦合程度，並讓雙方都倚賴抽象。

> IoC經典實現對象設計法則　好萊塢法則：“別找我們，我們找你”
 
>系統中模組建議依賴抽象，因為各個模組間不需要知道對方太多細節（實作），知道越多耦合越強。

-----

DI—Dependency Injection 依賴注入
 
把**被依賴物件**注入**被動接收物件**中

案例解釋：

小明是個愛乾淨的人，但他工作時常加班導致房間雜亂，他不能忍受此狀況，所以小明去找一個清潔阿姨每天幫忙他打掃家裡

哪天阿姨哪天有事不能打掃，小明就必須要再去找人來幫忙打掃，由此可知小明耦合阿姨

-----

如果今天是....

小明把他要的條件給「打掃仲介公司」，仲介公司幫他尋找有沒有符合小明需求的打掃阿姨，假如今天A阿姨請假了，仲介公司會自動找另一個符合需求B阿姨幫忙打掃...

 

原本小明需耦合於打掃阿姨，現在被「仲介公司」做了控制反轉讓「仲介公司」來提供打掃阿姨。

小明不用管是否今天有人會來打掃，「仲介公司」會幫小明找到一個掃地阿姨。

 
* 「仲介公司」可看作 依賴注入容器
* 「小明」可看作 被動接收物件

「打掃阿姨」可看作 被依賴物件

在使用IOC容器前需先了解雙方的依賴關係(誰依賴誰?)

上述還有一個很重要的觀念是，依賴和被接收對象要倚賴抽象。

-----

範例使用：VS2015

IOC容器：AutoFac

下面範例來說明上面的例子

 
小明自己依賴於掃地阿姨
依賴程式碼寫在小明類別內部日後要更改只能動內部程式碼。

```c#
/// <summary>
/// 小明直接依賴 Aunt 不是依賴抽象
/// 日後要改必須動內部
/// </summary>
public class Mine
{
    public Aunt aunt = new Aunt();

    public void Room()
    {
        aunt.Swapping();
    }
}
```

呼叫使用時

```c#
Mine mine = new Mine();
mine.Room();
```

小明找仲介公司
 

**仲介公司(Ioc容器)**

在仲介公司內註冊需求，讓仲介公司日後幫你找人（註冊的類別）

```c#
/// <summary>
/// 仲介公司
/// </summary>
/// <returns></returns>
private static IContainer MiddleCompany()
{
    ContainerBuilder builder = new ContainerBuilder();

    //在仲介公司裡寫需求人申請單
    builder.RegisterType<MineWithMiddle>();
    //小明所需打掃阿姨需求
    builder.RegisterType<Aunt>().As<ISwapable>();

    return builder.Build();
}
```

使用起來

```c#
IContainer middleCompany = MiddleCompany();
//仲介公司(IOC AutoFac)自動幫小明注入一個打掃阿姨
MineWithMiddle mineWithMiddle = middleCompany.Resolve<MineWithMiddle>();

mineWithMiddle.Room();
```

總結：

雖然上面程式碼執行結果一樣，但內部結構和日後擴展性卻截然不同

> 重點：系統中模組建議依賴抽象，因為各個模組間不需要知道對方太多細節（實作），知道越多耦合越強。

像網頁瀏覽器和伺服器是依賴**Http**協議，用戶端不管是手機.電腦,平板，伺服器端php,asp.net,java都可互相交信，依賴**Http**協議共用的合約

[範例原始碼](https://github.com/isdaniel/IOC_Sample)

[參考連結](http://www.cnblogs.com/xdp-gacl/p/4249939.html)
