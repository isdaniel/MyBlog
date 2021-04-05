---
title: 樣板模式(TemplatePattern)
date: 2019-06-02 22:30:11
tags: [C#,DesignPattern,TemplatePattern]
categories: [C#,DesignPattern]
---

## 前言：

如果目前場景遇到一定流程階段，但流程內容依照邏輯或情境不同也有所不一樣. 這時可以考慮使用樣板模式(TemplatePattern)

### 生活舉例：

因為十二年國教，所以基本上每個人都有上學的經驗

每天上學最少要經歷下面過程(我做一些簡化)

<div class="note note--normal">到學校=>上午上課=>吃午餐=>下午上課=>放學回家</div>

可以看到不管是國小、國中、高中 至少都有上述的過程

但每個過程內容可能會依照年級階段不同，也有所不一樣

例如：

*   吃中餐：高中可能是吃便當，但國小是吃營養午餐，雖然都是吃飯但內容不一樣。
*   上午上課：都是教數學，但高中教微積分，國小教加減乘除。

<div class="note note--normal">重點:流程雖一樣但細部邏輯交由學校去實施實現</div>

-----

## 常見例子：

我們常見的測試框架 `MSTest,NUnit.....` 都有樣板模式的思想。

一般來說測試框架都有**生命週期**，只是每個框架命名不一樣但核心原理差不多

1.  SetUpClass (每個測試類別只都執行一次)
2.  SetUpUnitTest (每次執行測試方法時都執行一次)
3.  UnitTest (執行測試方法)

**如下圖**

[![Alt text](https://camo.githubusercontent.com/685889c0eb69ee7e13072476fe868a653e32090b/68747470733a2f2f7777772e636f646570726f6a6563742e636f6d2f4b422f63732f61757470312f746573745375697465466c6f772e6a7067 "Optional title")](https://camo.githubusercontent.com/685889c0eb69ee7e13072476fe868a653e32090b/68747470733a2f2f7777772e636f646570726f6a6563742e636f6d2f4b422f63732f61757470312f746573745375697465466c6f772e6a7067)

(圖片來自網路上)

-----

### 程式碼範例：

此範例使用Console來模擬單元測試框架流程：

建立一個 `UnitFlowBase` 抽像類別依照`Nunit`生命週期來實現下面方法.

1.  `OneTimeSetUp` (每個測試類別只都執行一次)
2.  `Dispose` (每次執行測試方法時都執行一次)
3.  `SetUp` 每次執行`TestCase`前資料初始化
4.  `TearDown` 每次執行`TestCase`後釋放資源

此抽象類別提供幾個Hock讓子類實做細節。 `UnitFlowBase`只提供框架

`UnitTest`對外提供一個`void UnitTest(IEnumerable<Func<bool>> testCases)`方法.

> 可以傳入要驗證動作一個`IEnumerable<Func<bool>>`型別.

```c#
public abstract class UnitFlowBase
{
    protected virtual void OneTimeSetUp()
    {
    }

    protected virtual void Dispose()
    {
    }

    protected virtual void SetUp()
    {
    }

    protected virtual void TearDown()
    {
    }

    public void UnitTest(IEnumerable<Func<bool>> testCases)
    {
        OneTimeSetUp();
        foreach (var testCase in testCases)
        {
            SetUp();
            Console.WriteLine(testCase() ? "Assert Successful." : "Assert Fail.");
            TearDown();
        }
        Dispose();
    }
}
```

建立另一個類別`UnitCounter`重載`SetUp`,`OneTimeSetUp`方法.

```c#
public class UnitCounter : UnitFlowBase
{
    protected override void SetUp()
    {
        Console.WriteLine("Set up UnitCounter thing.");
    }

    protected override void OneTimeSetUp()
    {
        Console.WriteLine("OneTimeSetUp!!");
    }
}
```

呼叫實我們建立一個`UnitCounter`類別,並傳入一個`IEnumerable<Func<bool>>`的資料集合

```c#
class Program
{
    static void Main(string[] args)
    {
        
        UnitCounter unitCounter = new UnitCounter();
        unitCounter.UnitTest(new List<Func<bool>>()
        {
            ()=>true,
            ()=>false,
            ()=>false,
            ()=>true
        });

        Console.ReadKey();
    }
}
```

## 實際案例

在我一個開源專案中[ElectronicInvoice_TW](https://github.com/isdaniel/ElectronicInvoice_TW),有使用到`Template Method Pattern`

因為在大平台傳送資料有些固定的流程,這個就很適合使用此Pattern.

1. 參數需要按照字首排序.
2. 參數製作簽章防偽造.
3. 利用Http類別請求大平台.

對於每個API來說有一個變化是傳入參數,所以我就把它當作是此系列類別需要`override`方法.

而在`ApiBase.cs`是所有大平台API的`Base`類別在裡面有一個`string ExecuteApi(TModel mode)`方法提供給外部呼叫.

詳細資料可自行參閱我的原始碼.

-----

## 小結:

日後測試程式只需關注我們需要如何實現邏輯細解（重寫三個方法），核心流程順序就交由`UnitFlowBase`決定。


                