---
title: Action方法如何被執行InvokeAction(一) (第15天)
date: 2019-09-26 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---
# Agenda<!-- omit in toc -->
- [前言](#%e5%89%8d%e8%a8%80)
- [InvokeAction方法](#invokeaction%e6%96%b9%e6%b3%95)
- [在Controller類別中 重要方法ExecuteCore()](#%e5%9c%a8controller%e9%a1%9e%e5%88%a5%e4%b8%ad-%e9%87%8d%e8%a6%81%e6%96%b9%e6%b3%95executecore)
- [取得執行的ActionInvoker(AsyncControllerActionInvoker)](#%e5%8f%96%e5%be%97%e5%9f%b7%e8%a1%8c%e7%9a%84actioninvokerasynccontrolleractioninvoker)
- [ControllerActionInvoker呼叫InvokeAction方法](#controlleractioninvoker%e5%91%bc%e5%8f%abinvokeaction%e6%96%b9%e6%b3%95)
  - [取得 ControllerDescriptor & ActionDescriptor](#%e5%8f%96%e5%be%97-controllerdescriptor--actiondescriptor)
- [Asp.net AOP機制揭密(Filter)](#aspnet-aop%e6%a9%9f%e5%88%b6%e6%8f%ad%e5%af%86filter)
  - [預設使用FilterProviders(FilterProviderCollection)](#%e9%a0%90%e8%a8%ad%e4%bd%bf%e7%94%a8filterprovidersfilterprovidercollection)
  - [FilterAttributeFilterProvider(取得標籤的Filter)](#filterattributefilterprovider%e5%8f%96%e5%be%97%e6%a8%99%e7%b1%a4%e7%9a%84filter)
- [FilterProviderCollection的GetFilters方法(額外註冊過濾器)](#filterprovidercollection%e7%9a%84getfilters%e6%96%b9%e6%b3%95%e9%a1%8d%e5%a4%96%e8%a8%bb%e5%86%8a%e9%81%8e%e6%bf%be%e5%99%a8)
- [小結](#%e5%b0%8f%e7%b5%90)

## 前言

前面介紹完 **Asp.net MVC**解析器和IOC容器之間關係

本篇要介紹`Controller`如何去呼叫使用的`Action`方法.

`ExecuteCore`是`ControllerBase`類別提供給`Controller`來實作Hook方法.

> 我有做一個可以針對於[Asp.net MVC Debugger](https://github.com/isdaniel/Asp.net-MVC-Debuger)的專案，只要下中斷點就可輕易進入Asp.net MVC原始碼.

## InvokeAction方法

之前說到**MVC**呼叫`ControllerBase.Execute`方法,其中這個方法做了幾件事情

1. `VerifyExecuteCalledOnce`方法對於同步請求做一個防呆機制(不允許同一時間處理相同請求)
2. `Initialize`初始化資料
3. 呼叫`ExecuteCore`抽象方法(由`Controller`實現)

在`ControllerBase`會`InvokeAction`來執行並叫`Action`方法.

```csharp
public abstract class ControllerBase : IController{
    //....
    protected virtual void Execute(RequestContext requestContext)
    {
        if (requestContext == null)
        {
            throw new ArgumentNullException("requestContext");
        }
        if (requestContext.HttpContext == null)
        {
            throw new ArgumentException(MvcResources.ControllerBase_CannotExecuteWithNullHttpContext, "requestContext");
        }

        VerifyExecuteCalledOnce();
        Initialize(requestContext);

        using (ScopeStorage.CreateTransientScope())
        {
            ExecuteCore();
        }
    }
}
```

## 在Controller類別中 重要方法ExecuteCore()

在上面有說到`ExecuteCore`抽象方法由`Controller`來實現

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

這個方法會呼叫`GetActionName`透過`Route`規則解析`Action`名稱,在呼叫`ActionInvoker`的`InvokeAction`方法判斷呼叫`Action`方法是否呼叫成功.

## 取得執行的ActionInvoker(AsyncControllerActionInvoker)

`ActionInvoker`是一個在`Controller`屬性,一開始先判斷`_actionInvoker`是否為`null`如果是就會建立一個`IActionInvoker`物件.

```csharp
public IActionInvoker ActionInvoker
{
    get
    {
        if (_actionInvoker == null)
        {
            _actionInvoker = CreateActionInvoker();
        }
        return _actionInvoker;
    }
    set { _actionInvoker = value; }
}
```

讓我們來看看`CreateActionInvoker`方法如何建立`IActionInvoker`物件吧!

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

透過`CreateActionInvoker`方法來取得執行`IActionInvoker`,取得順序如下

1. 透過解析器找尋是否有實現`AsyncActionInvokerFactory`物件
2. 透過解析器找尋是否有實現`IActionInvokerFactory`物件
3. 透過解析器`IAsyncActionInvoker`物件
4. 透過解析器`IActionInvoker`物件
5. 建立一個`AsyncControllerActionInvoker`物件

所以預設是使用`AsyncControllerActionInvoker`這個非同步`ActionInvoker`

## ControllerActionInvoker呼叫InvokeAction方法

* `ControllerActionInvoker`是同步版本
* `AsyncControllerActionInvoker`是非同步版本

使用`InvokeAction`方法來調用我們使用的`Action`方法,並透過執行完回傳`Bool`辨別調用是否成功.

### 取得 ControllerDescriptor & ActionDescriptor

在`InvokeAction`方法一開始會先取得`ControllerDescriptor`和`ActionDescriptor`兩個物件(把得到資訊進行封裝).

```csharp
ControllerDescriptor controllerDescriptor = GetControllerDescriptor(controllerContext);
ActionDescriptor actionDescriptor = FindAction(controllerContext, controllerDescriptor, actionName);
```

1. `GetControllerDescriptor`取得`Controller`封裝後的資訊(同步使用`ReflectedControllerDescriptor`).
2. 取得`ActionDescriptor`(`ReflectedActionDescriptor`)並在執行`Execute`方法要靠他來執行`Action`方法

`FindAction`返回一個`ActionDescriptor`.

這個物件對於日後呼叫`Action`方法有很重要地位.

```csharp
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

## Asp.net AOP機制揭密(Filter)

取得完`ActionDescriptor`物件後,會先判斷`actionDescriptor`是否建立成功,如果建立成功就會呼叫`GetFilters`方法取得目前所有註冊過濾器.

```csharp
if (actionDescriptor != null)
{
	FilterInfo filterInfo = GetFilters(controllerContext, actionDescriptor);
	//....
```

呼叫`GetFilters`方法會取得**Asp.net MVC**註冊的所有`Filter`物件(提供一個織布點方便開發人員彈性做擴充).

```csharp
private Func<ControllerContext, ActionDescriptor, IEnumerable<Filter>> _getFiltersThunk = FilterProviders.Providers.GetFilters;

protected virtual FilterInfo GetFilters(ControllerContext controllerContext, ActionDescriptor actionDescriptor)
{
    return new FilterInfo(_getFiltersThunk(controllerContext, actionDescriptor));
}
```

> `_getFiltersThunk`是一個委派物件,預設使用`FilterProviders.Providers.GetFilters`

`FilterProviderCollection`這個集合對象在前一篇**Asp.net MVC** `DI`有介紹到,對於`DI`做一個擴充點(`CombinedItems`)屬性從容器中取得有對於`IFilterProvider`註冊`Filter`物件.

### 預設使用FilterProviders(FilterProviderCollection)

`MVC`會透過`FilterProviders.Providers`取得預設使用`FilterProvider`,透過以下三個地方取得

* `GlobalFilterCollection`(在Global擴充)
* `ControllerInstanceFilterProvider`(`Controller`自行`Override`)
* `FilterAttributeFilterProvider`(提供`Attribute`註冊最常用)

```csharp
/// <summary>
/// 提供Filter AOP讀取的位置
/// </summary>
public static class FilterProviders
{
    static FilterProviders()
    {
        Providers = new FilterProviderCollection();
        Providers.Add(GlobalFilters.Filters);
        Providers.Add(new FilterAttributeFilterProvider());
        Providers.Add(new ControllerInstanceFilterProvider());
    }

    public static FilterProviderCollection Providers { get; private set; }
}
```

### FilterAttributeFilterProvider(取得標籤的Filter)

`IFilterProvider`介面提供一個方法`GetFilters`取得過濾器集合

```csharp
public interface IFilterProvider
{
    IEnumerable<Filter> GetFilters(ControllerContext controllerContext, ActionDescriptor actionDescriptor);
}

public class FilterAttributeFilterProvider : IFilterProvider
{
    //....
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
}
```

從程式碼得知

* `GetControllerAttributes`從`Controller`取得,所有繼承`FilterAttribute`標籤.
* `GetActionAttributes`從`Action`取得,所有繼承`FilterAttribute`標籤.

> 我們最常把`Filter`寫在`Controller`或`Action`上就是透過`FilterAttributeFilterProvider`的`GetFilters`方法取得標籤並封裝成`Filter`物件返回,使用.

## FilterProviderCollection的GetFilters方法(額外註冊過濾器)

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
```

## 小結

今天就先分享執行`Action`前執行動作,在`InvokeAction`方法中有兩個很重要的物件.

1. `ControllerDescriptor`封裝`Controller`主要使用資訊
2. `ActionDescriptor`封裝`Action`主要使用資訊,並利用裡面的`Execute`方法執行`Action`.

另外一點我們也了解**Asp.net MVC**如何實現AOP編寫方式,透過**Attribute + Filter**,讓系統更有擴展性.

目前`Filter`類別跟`ControllerActionInvoker`類別UML圖關係如下

![UML_ActionInvoker.PNG](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/15/UML_ActionInvoker.PNG)

下篇會跟大家分享`MVC Filter`是在哪裡被呼叫且裡面`Filter`參數是如何被產生的.
