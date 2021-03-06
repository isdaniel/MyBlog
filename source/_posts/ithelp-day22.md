---
title:  View是如何被建立(一) (第22天)
date: 2019-10-03 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---

# Agenda<!-- omit in toc -->
- [前言](#%e5%89%8d%e8%a8%80)
- [Action方法是如何被呼叫(快速整理)](#action%e6%96%b9%e6%b3%95%e6%98%af%e5%a6%82%e4%bd%95%e8%a2%ab%e5%91%bc%e5%8f%ab%e5%bf%ab%e9%80%9f%e6%95%b4%e7%90%86)
- [ActionMethodDispatcher 取得(執行Action方法)](#actionmethoddispatcher-%e5%8f%96%e5%be%97%e5%9f%b7%e8%a1%8caction%e6%96%b9%e6%b3%95)
	- [Expression動態產生呼叫Action方法 (GetExecutor)](#expression%e5%8b%95%e6%85%8b%e7%94%a2%e7%94%9f%e5%91%bc%e5%8f%abaction%e6%96%b9%e6%b3%95-getexecutor)
		- [GetExecutor方法 Expression產生呼叫程式碼解說](#getexecutor%e6%96%b9%e6%b3%95-expression%e7%94%a2%e7%94%9f%e5%91%bc%e5%8f%ab%e7%a8%8b%e5%bc%8f%e7%a2%bc%e8%a7%a3%e8%aa%aa)
	- [DispatcherCache](#dispatchercache)
- [CreateActionResult](#createactionresult)
- [小結:](#%e5%b0%8f%e7%b5%90)

## 前言

不知道大家有沒有點暈頭轉向XD,**MVC**的`Model`綁定機制真的蠻複雜,希望大家有跟上來

透過`DefaultModelBinder`的`BindComplexElementalModel`方法綁定複雜模型的值.

在`BindProperty`方法時填充子節點`ModelMetadata`的`Model`屬性,透過`(DefaultModelBinder)`再次綁定物件動作如下

* `ModelMetadata`是簡單模型就會把值填充給此次`ModelMetadata.Model`
* `ModelMetadata`是複雜模型就建立一個物件後呼叫`BindProperty`直到找到最後的簡單模型.

在`BindComplexElementalModel`方法做幾個主要動作

1. `BindProperties`:透過`MetaData`取得屬性資訊並利用反射把值添加上去.
2. `OnModelUpdated`:找尋`Model`上`MetaData`的`ModelValidator`進行屬性驗證,如果驗證失敗會把資料資訊加到`ModelState.AddModelError`(`ModelStateDictionary`)可在`View`搭配顯示`error`訊息

```csharp
internal void BindComplexElementalModel(ControllerContext controllerContext, ModelBindingContext bindingContext, object model)
{
    ModelBindingContext newBindingContext = CreateComplexElementalModelBindingContext(controllerContext, bindingContext, model);

    if (OnModelUpdating(controllerContext, newBindingContext))
    {
        BindProperties(controllerContext, newBindingContext);
        OnModelUpdated(controllerContext, newBindingContext);
    }
}
```

如果前面幾篇看不懂的小夥伴沒關係只要記得,主要透過`GetParameterValues`方法取得`IDictionary<string, object`把`Http`傳送過來參數綁定到**MVC**使用`Model`參數上

* 字典`Key`就是`Model`傳入名稱
* 字典`object`就是`Model`的值

> 我有做一個可以針對於[Asp.net MVC Debugger](https://github.com/isdaniel/Asp.net-MVC-Debuger)的專案，只要下中斷點就可輕易進入Asp.net MVC原始碼.

## Action方法是如何被呼叫(快速整理)

前幾篇有說過`InvokeActionMethodWithFilters`方法，執行會產生要執行`ActionResult`物件並使用字典當作參數傳入

`InvokeActionMethodWithFilters`方法中透過`InvokeActionMethod`方法來產生要執行的`ActionResult`

> `ActionExecutingContext`這個物件比其他過濾器參數多了一個重要的成員`IDictionary<string, object> parameters`,有這個成員我們可以針對呼叫`Action`參數處理.

```csharp
protected virtual ActionExecutedContext InvokeActionMethodWithFilters(ControllerContext controllerContext, IList<IActionFilter> filters, ActionDescriptor actionDescriptor, IDictionary<string, object> parameters)
{
	ActionExecutingContext preContext = new ActionExecutingContext(controllerContext, actionDescriptor, parameters);
	Func<ActionExecutedContext> continuation = () =>
		new ActionExecutedContext(controllerContext, actionDescriptor, false /* canceled */, null /* exception */)
		{
			Result = InvokeActionMethod(controllerContext, actionDescriptor, parameters)
		};

	//preContext 執行前Context   next執行後Context
	Func<ActionExecutedContext> thunk = filters.Reverse().Aggregate(continuation,(next, filter) => () => InvokeActionMethodFilter(filter, preContext, next));
	return thunk();
}
```

在`InvokeActionMethod`這個方法主要透過`ActionDescriptor`來回傳此次使用`ActionResult`物件

```csharp
protected virtual ActionResult InvokeActionMethod(ControllerContext controllerContext, ActionDescriptor actionDescriptor, IDictionary<string, object> parameters)
{
	object returnValue = actionDescriptor.Execute(controllerContext, parameters);
	ActionResult result = CreateActionResult(controllerContext, actionDescriptor, returnValue);
	return result;
}
```

> 上面呼叫的是`ReflectedActionDescriptor.Execute`

`ExtractParameterFromDictionary`主要透過字典的`TryGetValue`方法取值(另外還做參數型別驗證)

```csharp
public override object Execute(ControllerContext controllerContext, IDictionary<string, object> parameters)
{
	//.....
	ParameterInfo[] parameterInfos = MethodInfo.GetParameters();
	object[] parametersArray = new object[parameterInfos.Length];
	for (int i = 0; i < parameterInfos.Length; i++)
	{
		ParameterInfo parameterInfo = parameterInfos[i];
		object parameter = ExtractParameterFromDictionary(parameterInfo, parameters, MethodInfo);
		parametersArray[i] = parameter;
	}

	ActionMethodDispatcher dispatcher = DispatcherCache.GetDispatcher(MethodInfo);
	object actionReturnValue = dispatcher.Execute(controllerContext.Controller, parametersArray);
	return actionReturnValue;
}
```

## ActionMethodDispatcher 取得(執行Action方法)

`ActionMethodDispatcher`原始碼能看到在建構子有一個`GetExecutor`方法(使用`Expression`表達式產生委派物件).產生`ActionExecutor`委派物件

裡面有幾個重要的成員

* `ActionExecutor`:執行`Action`方法有回傳值
* `VoidActionExecutor`:執行`Action`方法回傳值是`void`

透過`GetExecutor`組成要使用方法委派,等待外部呼叫`Execute`方法.

```csharp
internal sealed class ActionMethodDispatcher
{
	private ActionExecutor _executor;

	public ActionMethodDispatcher(MethodInfo methodInfo)
	{
		_executor = GetExecutor(methodInfo);
		MethodInfo = methodInfo;
	}

	private delegate object ActionExecutor(ControllerBase controller, object[] parameters);

	private delegate void VoidActionExecutor(ControllerBase controller, object[] parameters);

	public MethodInfo MethodInfo { get; private set; }

	public object Execute(ControllerBase controller, object[] parameters)
	{
		return _executor(controller, parameters);
	}

	private static ActionExecutor GetExecutor(MethodInfo methodInfo)
	{
		//...
	}

	private static ActionExecutor WrapVoidAction(VoidActionExecutor executor)
	{
		return delegate(ControllerBase controller, object[] parameters)
		{
			executor(controller, parameters);
			return null;
		};
	}
}
```

前篇有說過在.net原始碼為了確保執行`ResultFilter`順序在`InvokeActionResultWithFilters`方法使用遞迴呼叫.

### Expression動態產生呼叫Action方法 (GetExecutor)

**MVC**透過`Route`機制解析我們要呼叫`Controller`跟`Action`方法,但在呼叫時動態去判斷要呼叫哪個`Action`方法,說到動態呼叫方法,有點經驗的人就會想到使用反射(`reflection`).

反射固然好用,但反射對於效能來說有些不太好(因為要動態到dll `metadata`找尋取得資訊).

`.net MVC`工程師也知道上面問題所以這邊他們使用另一種設計方式來避免此問題

> 使用`Expression`表達式動態產生呼叫程式碼(也可以使用`Emit`)並呼叫使用.

![UML_Model](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/22/2019-09-30_113857.png)

先來看看`Expreesion`產生呼叫`HomeController`中`Index`方法的程式碼吧.

`Expression`表達式沒有帶參數`Action`方法

```csharp
.Lambda #Lambda1<System.Web.Mvc.ActionMethodDispatcher+ActionExecutor>(
    System.Web.Mvc.ControllerBase $controller,
    System.Object[] $parameters) {
    (System.Object).Call ((Asp.net_MVC_Debuger.Controllers.HomeController)$controller).Index()
}
```

`Expression`表達式有帶參數`Action`方法

```csharp
.Lambda #Lambda1<System.Web.Mvc.ActionMethodDispatcher+ActionExecutor>(
    System.Web.Mvc.ControllerBase $controller,
    System.Object[] $parameters) {
    (System.Object).Call ((Asp.net_MVC_Debuger.Controllers.HomeController)$controller).Index
	(
		(Asp.net_MVC_Debuger.Models.MessageViewModel)$parameters[0]
	)
}
```

下面會對於`GetExecutor`方法透過`Expression`產生呼叫程式碼解說

#### GetExecutor方法 Expression產生呼叫程式碼解說

下面是`GetExecutor`原始碼,讓我一步一步大家分析如何運行吧(介紹`Expression`表達式和原始碼是如何對照).

```csharp
private static ActionExecutor GetExecutor(MethodInfo methodInfo)
{
	// Parameters to executor
	ParameterExpression controllerParameter = Expression.Parameter(typeof(ControllerBase), "controller");
	ParameterExpression parametersParameter = Expression.Parameter(typeof(object[]), "parameters");

	// Build parameter list
	List<Expression> parameters = new List<Expression>();
	ParameterInfo[] paramInfos = methodInfo.GetParameters();
	for (int i = 0; i < paramInfos.Length; i++)
	{
		ParameterInfo paramInfo = paramInfos[i];
		BinaryExpression valueObj = Expression.ArrayIndex(parametersParameter, Expression.Constant(i));
		UnaryExpression valueCast = Expression.Convert(valueObj, paramInfo.ParameterType);

		parameters.Add(valueCast);
	}

	// Call method
	UnaryExpression instanceCast = (!methodInfo.IsStatic) ? Expression.Convert(controllerParameter, methodInfo.ReflectedType) : null;
	MethodCallExpression methodCall = methodCall = Expression.Call(instanceCast, methodInfo, parameters);

	// methodCall is "((TController) controller) method((T0) parameters[0], (T1) parameters[1], ...)"
	// Create function
	if (methodCall.Type == typeof(void))
	{
		Expression<VoidActionExecutor> lambda = Expression.Lambda<VoidActionExecutor>(methodCall, controllerParameter, parametersParameter);
		VoidActionExecutor voidExecutor = lambda.Compile();
		return WrapVoidAction(voidExecutor);
	}
	else
	{
		// must coerce methodCall to match ActionExecutor signature
		UnaryExpression castMethodCall = Expression.Convert(methodCall, typeof(object));
		Expression<ActionExecutor> lambda = Expression.Lambda<ActionExecutor>(castMethodCall, controllerParameter, parametersParameter);
		return lambda.Compile();
	}
}

private static ActionExecutor WrapVoidAction(VoidActionExecutor executor)
{
	return delegate(ControllerBase controller, object[] parameters)
	{
		executor(controller, parameters);
		return null;
	};
}
```

第一步、先宣告兩個`Parameter`表達式

1. `controller`
2. `parameters`:是一個**陣列物件**

`lambda`表達式呼叫方法參數

```csharp
#Lambda1<System.Web.Mvc.ActionMethodDispatcher+ActionExecutor>(
    System.Web.Mvc.ControllerBase $controller,
    System.Object[] $parameters)
```

第二步、透過`for loop`建立要傳入`Action`方法參數陣列

產生完後加入`List<Expression>`集合中

```csharp
(Asp.net_MVC_Debuger.Models.MessageViewModel)$parameters[0],
(Asp.net_MVC_Debuger.Models.MessageViewModel1)$parameters[1]
//....
```

第三步、將`controllerParameter`強轉型成呼叫使用Controller型別

```csharp
 ((Asp.net_MVC_Debuger.Controllers.HomeController)$controller)
```


第四步、使用`Expression.Call`產生呼叫`Action`方法動作

```csharp
(System.Object).Call ((Asp.net_MVC_Debuger.Controllers.HomeController)$controller).Index
(
	(Asp.net_MVC_Debuger.Models.MessageViewModel)$parameters[0]
)
```

第五步、判斷呼叫方法是否有回傳值(`Void`),`compile`成不同程式碼

透過`Expression.Lambda`將上面程式碼,變成`Lambda`委派方法提供`Execute`方法呼叫使用.

```csharp
.Lambda #Lambda1<System.Web.Mvc.ActionMethodDispatcher+ActionExecutor>(
    System.Web.Mvc.ControllerBase $controller,
    System.Object[] $parameters) {
    (System.Object).Call ((Asp.net_MVC_Debuger.Controllers.HomeController)$controller).Index()
}
```

能看到上面程式碼如果使用反射可以很輕易完成,但性能就沒有使用`Expression`或`emit`來得好

> `Expression`表達式比起`emit`更簡單了解,所以我會優先使用`Expression`表達式 

### DispatcherCache

在取得`ActionMethodDispatcher`透過一個`DispatcherCache`屬性.

> 這是為什麼呢?

```csharp
ActionMethodDispatcher dispatcher = DispatcherCache.GetDispatcher(MethodInfo);
object actionReturnValue = dispatcher.Execute(controllerContext.Controller, parametersArray);
```

在上面有分享`ActionMethodDispatcher`透過`Expression`表達式產生呼叫方法

> 但`Http`請求很頻繁,雖然透過`Expression`表達式動態產生程式碼呼叫比反射效能來好,但一直重複產生程式碼也需要很多效能.

**MVC**使用一個`Cache`來保存已經呼叫過資訊`DispatcherCache`

主要邏輯判斷此`MethodInfo`是否已經有存入快取字典中.如果沒有建立一個新`ActionMethodDispatcher`(產生一個新`Expression`)

```csharp
internal sealed class ActionMethodDispatcherCache : ReaderWriterCache<MethodInfo, ActionMethodDispatcher>
{
	public ActionMethodDispatcherCache()
	{
	}

	public ActionMethodDispatcher GetDispatcher(MethodInfo methodInfo)
	{
		// Frequently called, so ensure delegate remains static
		return FetchOrCreateItem(methodInfo, (MethodInfo methodInfoInner) => new ActionMethodDispatcher(methodInfoInner), methodInfo);
	}
}
```

## CreateActionResult

`CreateActionResult`判斷剛剛產生的`ActionResult`物件進行下面簡單處理

1. `actionReturnValue`如果是`NULL`(回傳值是`void`)就回傳一個`EmptyResult`(什麼都不做)
2. 是否是回傳`ActionResult`物件,如果不是就利用`ContentResult`來將結果包起來.
   
```csharp
protected virtual ActionResult CreateActionResult(ControllerContext controllerContext, ActionDescriptor actionDescriptor, object actionReturnValue)
{
	if (actionReturnValue == null)
	{
		return new EmptyResult();
	}

	ActionResult actionResult = (actionReturnValue as ActionResult) ??
	new ContentResult { Content = Convert.ToString(actionReturnValue, CultureInfo.InvariantCulture) };
	return actionResult;
}
```

最後透過`ControllerActionInvoker.InvokeActionResult`來呼叫`ActionResult`抽象方法`ExecuteResult(ControllerContext context)`.

```csharp
protected virtual void InvokeActionResult(ControllerContext controllerContext, ActionResult actionResult)
{
	actionResult.ExecuteResult(controllerContext);
}
```

## 小結:

本篇介紹了在`ReflectedActionDescriptor.Execute`方法產生一個`ActionResult`物件.

`ActionMethodDispatcher`這個類別負責產生要呼叫`ActionResult`方法(透過`RouteData`的`ActionNmae`和反射取得`Controller`的`MethInfo`最後透過`Expression`表達式組成一個呼叫委派方法)

利用`DispatcherCache`屬性對於每個呼叫過的`ActionMethodDispatcher`進行快取增加使用效率.

> 上面使用`Expreesion`動態產生程式碼並使用`Cache`這個構想很適合應用在高併發且吃效率情境上.值得我們學習

最後利用`CreateActionResult`判斷來產生要執行`ActionResult`

> `CreateActionResult`方法有用到一個設計技巧[null object pattern](https://en.wikipedia.org/wiki/Null_object_pattern) 這個模式用意是為了讓`NULL`或預設情況也有物件來執行(因為`NULL`也有屬於它的處理情境)

> 今天介紹**MVC**如何運用`Expression`表達式,對於`Expression`表達式之後有機會在跟大家做更詳細分享介紹

至於有那些`ActionResult`可以呼叫我們在下篇會再詳細介紹