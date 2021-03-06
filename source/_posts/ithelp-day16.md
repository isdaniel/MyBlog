---
title:  MVC Filter 機制解密 (第16天)
date: 2019-09-27 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---

# Agenda<!-- omit in toc -->
- [前言](#%e5%89%8d%e8%a8%80)
- [揭密取得過濾器(Filter)機制AOP](#%e6%8f%ad%e5%af%86%e5%8f%96%e5%be%97%e9%81%8e%e6%bf%be%e5%99%a8filter%e6%a9%9f%e5%88%b6aop)
	- [AOP(Aspect-Oriented Programming)核心概念Proxy Pattern](#aopaspect-oriented-programming%e6%a0%b8%e5%bf%83%e6%a6%82%e5%bf%b5proxy-pattern)
- [五種過濾器(Filter)介面](#%e4%ba%94%e7%a8%ae%e9%81%8e%e6%bf%be%e5%99%a8filter%e4%bb%8b%e9%9d%a2)
- [AuthorizationFilter](#authorizationfilter)
	- [IAuthenticationFilter and AuthenticationContext](#iauthenticationfilter-and-authenticationcontext)
	- [InvokeAuthenticationFilters方法](#invokeauthenticationfilters%e6%96%b9%e6%b3%95)
	- [IAuthorizationFilter and AuthorizationContext](#iauthorizationfilter-and-authorizationcontext)
		- [AuthorizationContext類別](#authorizationcontext%e9%a1%9e%e5%88%a5)
- [IActionFilter方法執行前,後的過濾器](#iactionfilter%e6%96%b9%e6%b3%95%e5%9f%b7%e8%a1%8c%e5%89%8d%e5%be%8c%e7%9a%84%e9%81%8e%e6%bf%be%e5%99%a8)
- [InvokeActionResult 動作執行前,後過濾器](#invokeactionresult-%e5%8b%95%e4%bd%9c%e5%9f%b7%e8%a1%8c%e5%89%8d%e5%be%8c%e9%81%8e%e6%bf%be%e5%99%a8)
- [IExceptionFilter錯誤過濾器](#iexceptionfilter%e9%8c%af%e8%aa%a4%e9%81%8e%e6%bf%be%e5%99%a8)
- [小結：](#%e5%b0%8f%e7%b5%90)

## 前言

上篇和大家介紹`Filter`去是如何取得且我們可以透過IOC容器註冊`IFilterProvider`來擴充取得`Filter`注入點.

在**ASP.NET MVC**的`Filter`，在執行目標前後彈性擴充額外操作(繼承`ActionFilter`並掛`Attribute`)，這是一種典型的`AOP`設計模式

本篇會和大家繼續分享`InvokeAction`後續動作.

為什麼我們在`Action`方法和`Controller`類別放置一個繼承（`AuthorizationFilter、ActionFilter、ResultFilter,ExceptionFilter`）標籤(`Attribute`)對應介面(`IAuthorizationFilter、IActionFilter、IResultFilter,IExceptionFilter`),程式幫我們自動載入**MVC**生命週期中並執行?

> 我有做一個可以針對於[Asp.net MVC Debugger](https://github.com/isdaniel/Asp.net-MVC-Debuger)的專案，只要下中斷點就可輕易進入Asp.net MVC原始碼.

## 揭密取得過濾器(Filter)機制AOP

AOP 是 **OOP(物件導向)一個變化程式撰寫思想。**（非取代OOP而是擴充）

導入AOP幫助：

可幫我們分離**核心邏輯**跟**非核心邏輯**代碼，很好降低模組間耦合性，已便日後擴充。

非核心邏輯代碼像：(日誌記錄，性能統計，安全控制，事務處理，異常處理等代碼從業務邏輯代碼中劃分出來)

![https://ithelp.ithome.com.tw/upload/images/20180209/20096630UyP6I4l2MB.png](https://ithelp.ithome.com.tw/upload/images/20180209/20096630UyP6I4l2MB.png)

原本寫法把寫日誌相關程式寫入，業務邏輯方法中。導致此方法非單一職則。我們可以把程式重構改寫成(右圖)，將寫日誌方法抽離出來更有效達成模組化。

### AOP(Aspect-Oriented Programming)核心概念Proxy Pattern

`AOP`是擴充`Proxy Pattern`(代理模式)概念，為每個方法提供一個代理人，可為執行前或執行後提供擴展機制，並由代理類別來呼叫真正呼叫使用方法．

如果想要更多了解代理模式可以參考我之前寫的[ProxyPattern代理模式(二)](https://dotblogs.com.tw/daniel/2017/10/12/152439)

## 五種過濾器(Filter)介面

在**Asp.net MVC**有五個過濾器實現`AOP`架構

下面順序案照執行呼叫執行順序來介紹

1. `IAuthenticationFilter`：最一開始執行驗證使用過濾器,這個介面有一個`void OnAuthentication(AuthenticationContext filterContext)`方法.如果驗證失敗可以對於`filterContext.Result`設值來結束這次請求.
2. `IAuthorizationFilter`：執行過程和`IAuthenticationFilter`過濾器基本上一樣
3. `IActionFilter`：提供方法執行前,後的動作.
4. `IResultFilter`：提供方法執行**結果**前,後的動作.
5. `IExceptionFilter`：在執行此方法有錯誤時觸發的過濾器.

**MVC**上面幾個過濾器,讓開發者可以很有彈性擴充自己的系統且不用動到核心原始碼.很好達到[開放封閉原則](https://zh.wikipedia.org/wiki/%E5%BC%80%E9%97%AD%E5%8E%9F%E5%88%99)

## AuthorizationFilter

`AuthorizationFilter`在`ActionInvoker`執行前第一項工作，因為後續工作（參數模型綁定，參數模型驗證，呼叫方法）只有在驗證成功的基礎上才會有意義。

### IAuthenticationFilter and AuthenticationContext  

一開始呼叫`InvokeAuthenticationFilters`方法來取得`AuthenticationContext`物件,在判斷`authenticationContext.Result`是否有給值.如果有當作驗證失敗不用在執行後面流程.

```csharp
try
{
    AuthenticationContext authenticationContext = InvokeAuthenticationFilters(controllerContext, filterInfo.AuthenticationFilters, actionDescriptor);

    if (authenticationContext.Result != null)
    {
        AuthenticationChallengeContext challengeContext = InvokeAuthenticationFiltersChallenge(
            controllerContext, filterInfo.AuthenticationFilters, actionDescriptor,
            authenticationContext.Result);
        InvokeActionResult(controllerContext, challengeContext.Result ?? authenticationContext.Result);
    }
    else
    {
        //.....
    }
}
```

### InvokeAuthenticationFilters方法

```csharp
protected virtual AuthenticationContext InvokeAuthenticationFilters(
	ControllerContext controllerContext,
	IList<IAuthenticationFilter> filters, 
	ActionDescriptor actionDescriptor)
{

	//....
	AuthenticationContext context = new AuthenticationContext(controllerContext, actionDescriptor,
		originalPrincipal);
	foreach (IAuthenticationFilter filter in filters)
	{
		filter.OnAuthentication(context);
		// short-circuit evaluation when an error occurs
		if (context.Result != null)
		{
			break;
		}
	}

	IPrincipal newPrincipal = context.Principal;

	if (newPrincipal != originalPrincipal)
	{
		Contract.Assert(context.HttpContext != null);
		context.HttpContext.User = newPrincipal;
		Thread.CurrentPrincipal = newPrincipal;
	}

	return context;
}
```

`AuthenticationContext`中重要的一個屬性是

* `public ActionResult Result { get; set; }` 只要這個物件不為`null`就會直接返回此次請求.

在方法中我封裝一個`AuthenticationContext`物件,把它當作參數傳入`IAuthenticationFilter.OnAuthentication`方法中(這就是我們在繼承`AuthenticationFilter`使用`AuthenticationContext`物件)

值得一提程式會判斷`context.Result`是否為`null`來當作迴圈中斷點.

```csharp
if (context.Result != null)
{
    break;
}
```

這個邏輯是我們對於`Authentication`驗證失敗後想要直接返回請求可以透過把`context.Result`給一個值(`ActionResult`物件),外面會照`authenticationContext.Result`是否為`null`為依據判斷是否繼續執行後面動作.

### IAuthorizationFilter and AuthorizationContext

下一個步驟是檢驗`IAuthorizationFilter`過濾器,執行過程和`IAuthenticationFilter`過濾器基本上一樣

依照物件內`Result`屬性是否為`null`來當作後續執行依據.

```csharp
AuthorizationContext authorizationContext = InvokeAuthorizationFilters(controllerContext, filterInfo.AuthorizationFilters, actionDescriptor);
if (authorizationContext.Result != null)
{
	AuthenticationChallengeContext challengeContext = InvokeAuthenticationFiltersChallenge(
		controllerContext, filterInfo.AuthenticationFilters, actionDescriptor,
		authorizationContext.Result);
	InvokeActionResult(controllerContext, challengeContext.Result ?? authorizationContext.Result);
}

public interface IAuthorizationFilter
{
    void OnAuthorization(AuthorizationContext filterContext);
}
```

#### AuthorizationContext類別

```csharp
public class AuthorizationContext : ControllerContext
{
	//.....

	public virtual ActionDescriptor ActionDescriptor { get; set; }

	public ActionResult Result { get; set; }
}
```

既然`IAuthenticationFilter`和`IAuthorizationFilter`過濾器驗證東西都很類似為什麼要分成兩個呢?

仔細比較會發現`IAuthenticationFilter`多了(設置`Principal`)，檢驗方式。

`ActionDescriptor`(使用`ReflectedActionDescriptor`)這個物件存放目前執行`Action`相關的資訊(裡面有一個`Execute`抽象方法,靠他來做`Action`呼叫使用)

```csharp
protected virtual void InvokeActionResult(ControllerContext controllerContext, ActionResult actionResult)
{
	actionResult.ExecuteResult(controllerContext);
}
```

如果判斷權限錯誤或`Filter`需提前返回`Result`就會執行`InvokeActionResult`方法,來執行返回工作.

## IActionFilter方法執行前,後的過濾器

有在寫**Asp.net MVC**的人一定對於下面這個介面不陌生,這個過濾器在`InvokeActionMethodFilter`使用時被呼叫.

`ActionExecutingContext`也有一個`Result`物件用此判斷是否有執行後續請求.一般也是`NULL`

> `ActionExecutingContext`這個物件比其他過濾器參數多了一個重要的成員`IDictionary<string, object> parameters`,有這個成員我們可以針對呼叫`Action`參數處理.

```csharp
public interface IActionFilter
{
	void OnActionExecuting(ActionExecutingContext filterContext);
	void OnActionExecuted(ActionExecutedContext filterContext);
}

internal static ActionExecutedContext InvokeActionMethodFilter(IActionFilter filter, ActionExecutingContext preContext, Func<ActionExecutedContext> continuation)
{
	//執行Action 過濾器
	filter.OnActionExecuting(preContext);
	//如果有Result 直接返回
	if (preContext.Result != null)
	{
		return new ActionExecutedContext(preContext, preContext.ActionDescriptor, true /* canceled */, null /* exception */)
		{
			Result = preContext.Result
		};
	}

	bool wasError = false;
	ActionExecutedContext postContext = null;
	try
	{
		postContext = continuation();
	}
	catch (ThreadAbortException)
	{
		postContext = new ActionExecutedContext(preContext, preContext.ActionDescriptor, false /* canceled */, null /* exception */);
		//執行Action後 過濾器
		filter.OnActionExecuted(postContext);
		throw;
	}
	catch (Exception ex)
	{
		wasError = true;
		postContext = new ActionExecutedContext(preContext, preContext.ActionDescriptor, false /* canceled */, ex);
		filter.OnActionExecuted(postContext);
		if (!postContext.ExceptionHandled)
		{
			throw;
		}
	}
	if (!wasError)
	{
		filter.OnActionExecuted(postContext);
	}
	return postContext;
}
```

其中有一段`continuation`這個委派是`InvokeActionMethod`這個方法,這個方法取得使用`Action`方法.

```csharp
protected virtual ActionResult InvokeActionMethod(ControllerContext controllerContext, ActionDescriptor actionDescriptor, IDictionary<string, object> parameters)
{
	object returnValue = actionDescriptor.Execute(controllerContext, parameters);
	ActionResult result = CreateActionResult(controllerContext, actionDescriptor, returnValue);
	return result;
}
```

```csharp
try
{
	postContext = continuation();
}
```

> `ActionExecutedContext`物件中的`Result`屬性就是執行`Action`方法後的結果

## InvokeActionResult 動作執行前,後過濾器

呼叫`InvokeActionResult`過濾器藉由`InvokeActionResultFilterRecursive`方法

這個方法使用遞迴方式看之前的使用`for loop`執行過濾器方式有所不同,幸好在原始碼有註解.

主要是因為下面原因

> `OnResultExecuting`事件必須按正向順序觸,發然後必須觸發`InvokeActionResult`(執行`Action`動作方法),`OnResultExecuted`事件必須以相反的順序觸發

```csharp
private ResultExecutedContext InvokeActionResultFilterRecursive(IList<IResultFilter> filters, int filterIndex, ResultExecutingContext preContext, ControllerContext controllerContext, ActionResult actionResult)
{
	if (filterIndex > filters.Count - 1)
	{
		InvokeActionResult(controllerContext, actionResult);
		return new ResultExecutedContext(controllerContext, actionResult, canceled: false, exception: null);
	}

	IResultFilter filter = filters[filterIndex];
	filter.OnResultExecuting(preContext);
	if (preContext.Cancel)
	{
		return new ResultExecutedContext(preContext, preContext.Result, canceled: true, exception: null);
	}

	bool wasError = false;
	ResultExecutedContext postContext = null;
	try
	{
		int nextFilterIndex = filterIndex + 1;
		postContext = InvokeActionResultFilterRecursive(filters, nextFilterIndex, preContext, controllerContext, actionResult);
	}
	catch (ThreadAbortException)
	{
		postContext = new ResultExecutedContext(preContext, preContext.Result, canceled: false, exception: null);
		filter.OnResultExecuted(postContext);
		throw;
	}
	catch (Exception ex)
	{
		wasError = true;
		postContext = new ResultExecutedContext(preContext, preContext.Result, canceled: false, exception: ex);
		filter.OnResultExecuted(postContext);
		if (!postContext.ExceptionHandled)
		{
			throw;
		}
	}
	if (!wasError)
	{
		filter.OnResultExecuted(postContext);
	}
	return postContext;
}
```

在`OnResultExecuting`方法的`ResultExecutingContext`可以藉由`Canceled`這個屬性來最後控制是否要執行`Action`方法,如果不要將這個值設定為`false`.

```csharp
public virtual bool Canceled { get; set; }
```

## IExceptionFilter錯誤過濾器

最後介紹錯誤時呼叫的過濾器`IExceptionFilter`

可以看到在執行方法的最前面使用了一個`try....catch`而最後`catch`程式碼如下.

在這個方法中有一個重要的屬性是`bool ExceptionHandled`,如果在錯誤時設定為`true`她就會執行`Result`的結果(因為最後呼叫了`InvokeActionResult`方法.

```csharp
//....
catch (Exception ex)
{
	// 錯誤處理過濾器 
	ExceptionContext exceptionContext = InvokeExceptionFilters(controllerContext, filterInfo.ExceptionFilters, ex);
	//如果需要自己處理錯誤 exceptionContext.ExceptionHandled 設為true
	if (!exceptionContext.ExceptionHandled)
	{
		throw;
	}
	InvokeActionResult(controllerContext, exceptionContext.Result);
}

protected virtual ExceptionContext InvokeExceptionFilters(ControllerContext controllerContext, IList<IExceptionFilter> filters, Exception exception)
{
	ExceptionContext context = new ExceptionContext(controllerContext, exception);
	foreach (IExceptionFilter filter in filters.Reverse())
	{
		filter.OnException(context);
	}

	return context;
}
```

## 小結：

過濾器這部分原始碼很值得大家探討,因為在主流`IOC`容器框架有支援`AOP`概念.

`AOP`有很大優點是可做到設計五大原則的其中兩項

* [單一職責原則](https://zh.wikipedia.org/wiki/%E5%8D%95%E4%B8%80%E5%8A%9F%E8%83%BD%E5%8E%9F%E5%88%99)
* [開放封閉原則](https://zh.wikipedia.org/wiki/%E5%BC%80%E9%97%AD%E5%8E%9F%E5%88%99)

使程式碼耦合性變低

執行`Action`方法前,如何取得權限過濾器並呼叫檢驗,另外在呼叫方法前可以看到會把用到的資訊封裝到一個`Context`物件中.

`IAuthenticationFilter`和`IAuthorizationFilter`基本上都是權限驗證的過濾器

> 但有先後順序,這點需注意!! 先執行`IAuthenticationFilter`後`IAuthorizationFilter`

看了**MVC**過濾器原始碼後有感而法,石頭就基於[RealProxy](https://docs.microsoft.com/zh-tw/dotnet/api/system.runtime.remoting.proxies.realproxy?view=netframework-4.8)這個類別做了一個AOP開源框架[AwesomeProxy.Net](https://github.com/isdaniel/AwesomeProxy.Net).

下篇會繼續介紹`Action`參數如何建立,遇到複雜`Model` MVC是怎麼處理
