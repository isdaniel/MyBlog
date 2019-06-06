---
title: (C#)委託delegate,Func<>,Action 解說系列(一)
date: 2019-06-02 10:54:52
tags: [C#,Func,Delegate]
categories: [C#,Delegate]
---

## 前文：

成為.Net高手`Delegate` 是必備武器之一

今天小弟和大家分享我所認知的`Delegate`

一開始我們先來看看`Delegate`到底是不是類別

-----

### 範例解說：

宣告一個 `voidDelegate` 委託

```csharp
public delegate void voidDelegate();

static void Main(string[] args)
{
    Console.WriteLine($"delegate is class? {typeof(voidDelegate).IsClass}");

    Console.ReadKey();
}
```

>執行結果:Yes 委託是一個特別的類別

但委託物件方式很特別 他在宣告時必須傳入**[建構子參數]**  而建構子參數是**[方法]**

我們宣告一個委託 傳入兩個Int參數 回傳Int

    public delegate int calcInt(int arg1,int arg2);

使用如下 new 一個 `calcInt` 並傳入建構子參數  add方法 之後就可以把`calcint`當作方法來使用

```csharp
calcInt calcint = new calcInt(add);
var result1 = calcint(5,5);
Console.WriteLine(result1);

//方法
static int add(int a, int b)
{
    return a + b;
}
```

或是

使用.net提供的 語法糖 如下

```csharp
calcInt calcint1 = (a,b) => { return a + b; };
var result2 = calcint1(5, 5);
Console.WriteLine(result2);
(a,b) => { return a + b; }; 
```

編譯器會動態幫我們產生一個方法。

委託就這樣嗎?!

-----

## 進階的用法

### 第一 : 宣告一個類別[計算者]，建構子參數是一個泛行List<T>

在類別中宣告Calc委託，在Excute方法中我們直接回傳執行Calc結果

```csharp
public class Calculator<T>
    where T : struct
{
    public delegate T Calc(IList<T> list);

    IList<T> _container;
    public Calculator(IList<T> container)
    {
        _container = container;
    }
    public T Excute(Calc C)
    {
        return C(_container);
    }
}
```

## 使用方法如下：

宣告一個物件Calculator傳入建構子參數List

重點:我們可以在Client端決定如何使用此方法

```csharp
List<int> i_List = new List<int>()
{
    1,3,5,7,9
};
Calculator<int> calculator = new Calculator<int>(i_List);
int i_add = calculator.Excute((list) => list.Sum());
int i_multi = calculator.Excute((list) =>
{
    int totle = 1;
    foreach (var i in list)
    {
        totle *= i;
    }
    return totle;
});
Console.WriteLine($"add:{i_add}  multi:{i_multi}");
```

總結:如上面程式碼　我們可在`Client`中決定對`List`集合做操作(加,減,乘,除) ，而不是一開始就寫死在類別中，降低了類別方法和`Client`的耦合

`Delegate`可以把方法實作的權利移交給`Clinet`端

[原始碼範例](https://github.com/isdaniel/DelegateSimple)
