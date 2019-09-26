---
title: Action方法如何被執行InvokeAction(一) (第15天)
date: 2019-09-25 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---
# Agenda<!-- omit in toc -->
- [前言](#%e5%89%8d%e8%a8%80)
- [InvokeAction方法](#invokeaction%e6%96%b9%e6%b3%95)
- [ControllerActionInvoker](#controlleractioninvoker)
  - [取得](#%e5%8f%96%e5%be%97)
- [揭密取得過濾器(Filter)機制AOP](#%e6%8f%ad%e5%af%86%e5%8f%96%e5%be%97%e9%81%8e%e6%bf%be%e5%99%a8filter%e6%a9%9f%e5%88%b6aop)
  - [AOP(Aspect-Oriented Programming)核心概念Proxy Pattern](#aopaspect-oriented-programming%e6%a0%b8%e5%bf%83%e6%a6%82%e5%bf%b5proxy-pattern)
  - [Asp.net AOP機制揭密(Filter)](#aspnet-aop%e6%a9%9f%e5%88%b6%e6%8f%ad%e5%af%86filter)
  - [GetFilters方法](#getfilters%e6%96%b9%e6%b3%95)
- [小結](#%e5%b0%8f%e7%b5%90)

## 前言

前面介紹完 **Asp.net MVC**解析器和IOC容器之間關係

現在要進入`Controller`如何去使用`Controller`中相對應`Action`方法.

`ExecuteCore`是`ControllerBase`類別提供給`Controller`來實作Hook方法.

有人會好奇為什麼我們在`Action`和`Controller`上放置一個繼承（`AuthorizationFilter、ActionFilter、ResultFilter,ExceptionFilter`）的`Attribute`對應的介面(`IAuthorizationFilter、IActionFilter、IResultFilter,IExceptionFilter`),程式幫我們自動載入**MVC**生命週期中並執行?

> 我有做一個可以針對於[Asp.net MVC Debugger](https://github.com/isdaniel/Asp.net-MVC-Debuger)的專案，只要下中斷點就可輕易進入Asp.net MVC原始碼.

## InvokeAction方法

會透過`InvokeAction`來執行並叫`Action`方法.

```csharp
protected override void ExecuteCore()
{
    PossiblyLoadTempData();
    try
    {
        string actionName = GetActionName(RouteData);
        if (!ActionInvoker.InvokeAction(ControllerContext, actionName))
        {
            HandleUnknownAction(actionName);
        }
    }
    finally
    {
        PossiblySaveTempData();
    }
}
```

透過`CreateActionInvoker`方法來取得執行`IActionInvoker`,取得順序如下

1. 透過解析器找尋是否有實現`AsyncActionInvokerFactory`物件
2. 透過解析器找尋是否有實現`IActionInvokerFactory`物件
3. 透過解析器`IAsyncActionInvoker`物件
4. 透過解析器`IActionInvoker`物件
5. 建立一個`AsyncControllerActionInvoker`物件

```csharp
protected virtual IActionInvoker CreateActionInvoker()
{
    IAsyncActionInvokerFactory asyncActionInvokerFactory = Resolver.GetService<IAsyncActionInvokerFactory>();
    if (asyncActionInvokerFactory != null)
    {
        return asyncActionInvokerFactory.CreateInstance();
    }
    IActionInvokerFactory actionInvokerFactory = Resolver.GetService<IActionInvokerFactory>();
    if (actionInvokerFactory != null)
    {
        return actionInvokerFactory.CreateInstance();
    }

    // Note that getting a service from the current cache will return the same instance for every request.
    return Resolver.GetService<IAsyncActionInvoker>() ??
        Resolver.GetService<IActionInvoker>() ??
        new AsyncControllerActionInvoker();
}
```

## ControllerActionInvoker

* `ControllerActionInvoker`是同步版本
* `AsyncControllerActionInvoker`是非同步版本

使用`InvokeAction`方法來調用我們使用的`Action`方法,並透過執行完回傳`Bool`辨別調用是否成功.

### 取得

首先我們先來看這下面的程式碼

```csharp
ControllerDescriptor controllerDescriptor = GetControllerDescripto(controllerContext);
ActionDescriptor actionDescriptor = FindAction(controllerContext, controllerDescriptor, actionName);
```

1. `GetControllerDescriptor`取得`Controller`封裝後的資訊(同步使用`ReflectedControllerDescriptor`).
2. 取得`ActionDescriptor`(`ReflectedActionDescriptor`)並在執行`Execute`方法要靠他來執行`Action`方法

`FindAction`返回一個`ActionDescriptor`.

```csharp
protected virtual ActionDescriptor FindAction(
	ControllerContext controllerContext, 
	ControllerDescriptor controllerDescriptor,
	string actionName
)
{
    //.....
    ActionDescriptor actionDescriptor = controllerDescriptor.FindAction(controllerContext, actionName);
    return actionDescriptor;
}

public override ActionDescriptor FindAction(ControllerContext controllerContext, string actionName)
{
    //......
    MethodInfo matched = _selector.FindActionMethod(controllerContext, actionName);
    if (matched == null)
    {
        return null;
    }

    return new ReflectedActionDescriptor(matched, actionName, this);
}
```

`ReflectedControllerDescriptor`利用反射取得要執行的`Method`資料(MethodInfo),並封裝到`ReflectedActionDescriptor`類別中.

## 揭密取得過濾器(Filter)機制AOP

AOP 是 **OOP(物件導向)一個變化程式撰寫思想。**（非取代OOP而是擴充）

導入AOP幫助：

可幫我們分離**核心邏輯**跟**非核心邏輯**代碼，很好降低模組間耦合性，已便日後擴充。

非核心邏輯代碼像：(日誌記錄，性能統計，安全控制，事務處理，異常處理等代碼從業務邏輯代碼中劃分出來)

![https://ithelp.ithome.com.tw/upload/images/20180209/20096630UyP6I4l2MB.png](https://ithelp.ithome.com.tw/upload/images/20180209/20096630UyP6I4l2MB.png)

原本寫法把寫日誌相關程式寫入，業務邏輯方法中。導致此方法非單一職則。我們可以把程式重構改寫成(右圖)，將寫日誌方法抽離出來更有效達成模組化。

### AOP(Aspect-Oriented Programming)核心概念Proxy Pattern

AOP是擴充`Proxy Pattern`(代理模式)概念，為每個方法提供一個代理人，可為執行前或執行後提供擴展機制，並由代理類別來呼叫真正呼叫使用方法．

如果想要更多了解代理模式可以參考我之前寫的[ProxyPattern代理模式(二)](https://dotblogs.com.tw/daniel/2017/10/12/152439)

### Asp.net AOP機制揭密(Filter)

取得完`ActionDescriptor`物件後,會先判斷`actionDescriptor`是否成功.

```csharp
if (actionDescriptor != null)
{
	FilterInfo filterInfo = GetFilters(controllerContext, actionDescriptor);
	//....
```

後面呼叫`GetFilters`方法,這個方法會取得**Asp.net MVC**註冊的所有Filter(提供一個織布點方便開發人員彈性做擴充)

```csharp
private Func<ControllerContext, ActionDescriptor, IEnumerable<Filter>> _getFiltersThunk = FilterProviders.Providers.GetFilters;

protected virtual FilterInfo GetFilters(ControllerContext controllerContext, ActionDescriptor actionDescriptor)
{
    return new FilterInfo(_getFiltersThunk(controllerContext, actionDescriptor));
}
```

> `_getFiltersThunk`是一個委派物件,預設使用`FilterProviders.Providers.GetFilters`

`FilterProviderCollection`這個集合對象在前一篇**Asp.net MVC** `DI`有介紹到,對於`DI`做一個擴充點(`CombinedItems`)屬性從容器中取得有對於`IFilterProvider`註冊`Filter`物件.

### GetFilters方法

`GetFilters`方法利用`CombinedItems`取得所有`IFilterProvider`物件,再利用`GetFilters`方法逐一取得註冊`Filter`物件.

```csharp
public IEnumerable<Filter> GetFilters(ControllerContext controllerContext, ActionDescriptor actionDescriptor)
{
	//.....
	IFilterProvider[] providers = CombinedItems;
	List<Filter> filters = new List<Filter>();
	for (int i = 0; i < providers.Length; i++)
	{
		IFilterProvider provider = providers[i];
		foreach (Filter filter in provider.GetFilters(controllerContext, actionDescriptor))
		{
			filters.Add(filter);
		}
	}

	filters.Sort(_filterComparer);

	if (filters.Count > 1)
	{
		RemoveDuplicates(filters);
	}
	return filters;
}

public interface IFilterProvider
{
    IEnumerable<Filter> GetFilters(ControllerContext controllerContext, ActionDescriptor actionDescriptor);
}
```

* `GlobalFilterCollection`(在Global擴充)
* `ControllerInstanceFilterProvider`(`Controller`自行`Override`)
* `FilterAttributeFilterProvider`(提供`Attribute`註冊最常用)

```csharp
public virtual IEnumerable<Filter> GetFilters(ControllerContext controllerContext, ActionDescriptor actionDescriptor)
{
    if (controllerContext.Controller != null)
    {
        foreach (FilterAttribute attr in GetControllerAttributes(controllerContext, actionDescriptor))
        {
            yield return new Filter(attr, FilterScope.Controller, order: null);
        }
        foreach (FilterAttribute attr in GetActionAttributes(controllerContext, actionDescriptor))
        {
            yield return new Filter(attr, FilterScope.Action, order: null);
        }
    }             
}
```

我們只探討最常使用`FilterAttributeFilterProvider`,上面是最核心`GetFilters`方法原始碼.

從程式碼得知

* `GetControllerAttributes`從`Controller`取得,所有繼承`FilterAttribute`標籤.
* `GetActionAttributes`從`Action`取得,所有繼承`FilterAttribute`標籤.

## 小結

今天就先分享執行`Action`前執行動作,在`InvokeAction`方法中有兩個很重要的物件.

1. `ControllerDescriptor`封裝`Controller`主要使用資訊
2. `ActionDescriptor`封裝`Action`主要使用資訊,並利用裡面的`Execute`方法執行`Action`.

另外一點我們也了解**Asp.net MVC**如何實現AOP編寫方式,透過**Attribute + Filter**,讓系統更有擴展性.

目前`Filter`類別跟`ControllerActionInvoker`類別UML圖關係如下

![UML_ActionInvoker.PNG](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/15/UML_ActionInvoker.PNG)

看了**MVC**過濾器原始碼後有感而法,石頭就基於[RealProxy](https://docs.microsoft.com/zh-tw/dotnet/api/system.runtime.remoting.proxies.realproxy?view=netframework-4.8)這個類別做了一個AOP開源框架[AwesomeProxy.Net](https://github.com/isdaniel/AwesomeProxy.Net).

下面一篇我們會繼續介紹`InvokeAction`後面執行動作.