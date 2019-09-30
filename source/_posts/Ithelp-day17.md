---
title: Action方法如何被執行InvokeAction(二) (第17天)
date: 2019-09-28 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---
# Agenda<!-- omit in toc -->
- [前言](#%e5%89%8d%e8%a8%80)
- [ControllerActionInvoker方法 重要InvokeAction方法](#controlleractioninvoker%e6%96%b9%e6%b3%95-%e9%87%8d%e8%a6%81invokeaction%e6%96%b9%e6%b3%95)
	- [取得ControllerDescriptor(ReflectedControllerDescriptor)](#%e5%8f%96%e5%be%97controllerdescriptorreflectedcontrollerdescriptor)
- [ActionDescriptor(ReflectedActionDescriptor)](#actiondescriptorreflectedactiondescriptor)
	- [ReflectedActionDescriptor 取得ActionMethod參數資訊](#reflectedactiondescriptor-%e5%8f%96%e5%be%97actionmethod%e5%8f%83%e6%95%b8%e8%b3%87%e8%a8%8a)
- [取得Action方法執行參數](#%e5%8f%96%e5%be%97action%e6%96%b9%e6%b3%95%e5%9f%b7%e8%a1%8c%e5%8f%83%e6%95%b8)
- [小結:](#%e5%b0%8f%e7%b5%90)

## 前言

上篇揭開**MVC**過濾器如何取得看我們四大常用過濾器,基本介紹.

之前有大概介紹這兩個物件,今天會來細部探討他們裡面有哪些重要成員.

* `ControllerDescriptor`
* `ActionDescriptor`

這篇會繼續和大家分享是如何覺得要呼叫哪個`Action`方法並且在這個過程中也哪些重要物件跟動作.

> 我有做一個可以針對於[Asp.net MVC Debugger](https://github.com/isdaniel/Asp.net-MVC-Debuger)的專案，只要下中斷點就可輕易進入Asp.net MVC原始碼.

## ControllerActionInvoker方法 重要InvokeAction方法

在`ControllerActionInvoker`最重要的就是`InvokeAction`方法,因為主要透過他去呼叫`ActionResult`抽象類別`ExecuteResult`方法.

`InvokeAction`有兩個參數

* `ControllerContext`:對於`RequestContext`,`RouteData`,使用`Controller`資訊封裝.
* `actionName`:此次呼叫方法(從`RouteData`取得`action`值)

```csharp
public virtual bool InvokeAction(ControllerContext controllerContext, string actionName)
```

除了呼叫`ExecuteResult`方法外還做了其他事情.

對於藉由`ControllerContext`封裝兩個物件.

* `ControllerDescriptor`
* `ActionDescriptor`

這兩個物件在此方法中很重要.

```csharp
ControllerDescriptor controllerDescriptor = GetControllerDescriptor(controllerContext);
ActionDescriptor actionDescriptor = FindAction(controllerContext, controllerDescriptor, actionName);
```

### 取得ControllerDescriptor(ReflectedControllerDescriptor)

`GetControllerDescriptor`會返回一個`ReflectedControllerDescriptor`物件.

```csharp
protected virtual ControllerDescriptor GetControllerDescriptor(ControllerContext controllerContext)
{
	Type controllerType = controllerContext.Controller.GetType();
	ControllerDescriptor controllerDescriptor = DescriptorCache.GetDescriptor(
		controllerType: controllerType,
		creator: (Type innerType) => new ReflectedControllerDescriptor(innerType),
		state: controllerType);
	return controllerDescriptor;
}
```

`ReflectedControllerDescriptor`裡面有許多重要資訊,我會列出其重要成員和代表含意.

1. `ControllerType`此次執行`Controller`類型
2. **(重要)**`FindAction`透過此方法取得`ActionDescriptor`物件.
3. `GetFilterAttributes`取的此`Controller`上的`AcitonFilter`

```csharp
public abstract class ControllerDescriptor : ICustomAttributeProvider, IUniquelyIdentifiable
{
	public virtual string ControllerName
	{
		get
		{
			string typeName = ControllerType.Name;
			if (typeName.EndsWith("Controller", StringComparison.OrdinalIgnoreCase))
			{
				return typeName.Substring(0, typeName.Length - "Controller".Length);
			}

			return typeName;
		}
	}

	public abstract Type ControllerType { get; }

	public abstract ActionDescriptor FindAction(ControllerContext controllerContext, string actionName);

	public abstract ActionDescriptor[] GetCanonicalActions();

	public virtual IEnumerable<FilterAttribute> GetFilterAttributes(bool useCache)
	{
		return GetCustomAttributes(typeof(FilterAttribute), inherit: true).Cast<FilterAttribute>();
	}

	public virtual bool IsDefined(Type attributeType, bool inherit)
	{
		if (attributeType == null)
		{
			throw new ArgumentNullException("attributeType");
		}

		return false;
	}
}
```

`ReflectedControllerDescriptor`實現`FindAction`抽象方法.

主要透過反射取得此`Controller`物件中相對應Action名稱的方法,並把他封裝到`ReflectedActionDescriptor`類別中返回.

```csharp
public override ActionDescriptor FindAction(ControllerContext controllerContext, string actionName)
{
	if (controllerContext == null)
	{
		throw new ArgumentNullException("controllerContext");
	}
	if (String.IsNullOrEmpty(actionName))
	{
		throw new ArgumentException(MvcResources.Common_NullOrEmpty, "actionName");
	}

	MethodInfo matched = _selector.FindActionMethod(controllerContext, actionName);
	if (matched == null)
	{
		return null;
	}

	return new ReflectedActionDescriptor(matched, actionName, this);
}
``` 

## ActionDescriptor(ReflectedActionDescriptor)

每一個`Action`執行方法會通過`ActionDescriptor`物件,所以`ActionDescriptor`是另一個在`InovkeAction`很重要物件

在`ActionDescriptor`抽象類別中有許多重要的成員

* `Execute`:`Action`執行呼叫方法,其中裡面的`parameters`參數就是調用`Controller`上`Action`方法鎖使用的參數.
* `GetFilterAttributes`:回傳在`Action`方法上的所有`Filter`標籤
* `GetFilters`:返回一個`FilterInfo`物件,這個物件可以得到應用在該`Action`方法上所有`filter`
* `ActionName`:`Action`方法名稱

```csharp
public abstract class ActionDescriptor : ICustomAttributeProvider, IUniquelyIdentifiable
{
	//....
    public virtual bool IsDefined(Type attributeType, bool inherit);
    public virtual IEnumerable<FilterAttribute> GetFilterAttributes(bool useCache);
    public abstract ParameterDescriptor[] GetParameters();
    public abstract object Execute(ControllerContext controllerContext,  IDictionary<string, object> parameters);
    public virtual FilterInfo GetFilters();
    public abstract string ActionName { get; }
    public abstract ControllerDescriptor ControllerDescriptor { get; }
    public virtual string UniqueId { get; }
}
```

繼承這個抽象類的子類就會擁有一種特性描述此次執行`Action`方法特徵和如何去使用`Execute`方法.

### ReflectedActionDescriptor 取得ActionMethod參數資訊

上面提到`ReflectedControllerDescriptor`的`ActionDescriptor FindAction(ControllerContext controllerContext, string actionName)`預設使用`ReflectedActionDescriptor`.

`ReflectedActionDescriptor`類別顧名思義就是依靠反射來取得`Action`的資訊

切入重點我們來看看`ReflectedActionDescriptor`如何實現`Execute`方法的吧

1. `MethodInfo`是從`ReflectedControllerDescriptor`利用反射取得執行`Action`方法資訊.
2. 利用`ExtractParameterFromDictionary`方法將`IDictionary<string, object> parameters`傳入參數轉成可傳入方法物件.
3. 透過`ActionMethodDispatcher`物件`Execute`方法執行`Action`方法(`ActionMethodDispatcher`透過`Expression`表達式動態建立方法並呼叫)

> `ActionMethodDispatcher`的`Expression`表達式詳解會在後面做介紹

```csharp
public MethodInfo MethodInfo { get; private set; }

public override object Execute(ControllerContext controllerContext, IDictionary<string, object> parameters)
{
	//....
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

> `actionReturnValue` 是`Action`方法的回傳值.

## 取得Action方法執行參數

上面提到`Action`使用參數會轉換到一個`IDictionary<string, object>`裡面.

* `key`：參數名稱
* `value`：參數值

> 在`ActionFitlerAttribute.OnActionExcuting`重載方法,參數`ActionExecutingContext`物件中有一個屬性`public virtual IDictionary<string, object> ActionParameters { get; set; }`
> 他透過`IValueProvider`解析完傳入字串轉換成一個存放參數字典.

讓我們了解一下這部分是如何完成.

```csharp
protected virtual IDictionary<string, object> GetParameterValues(ControllerContext controllerContext, ActionDescriptor actionDescriptor)
{
	Dictionary<string, object> parametersDict = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
	ParameterDescriptor[] parameterDescriptors = actionDescriptor.GetParameters();

	foreach (ParameterDescriptor parameterDescriptor in parameterDescriptors)
	{
		parametersDict[parameterDescriptor.ParameterName] = GetParameterValue(controllerContext, parameterDescriptor);
	}
	return parametersDict;
}
```

在呼叫`GetParameters`方法返回一個`ParameterDescriptor[]`陣列(`ParameterDescriptor`存放參數相關資訊),主要呼叫`ActionDescriptorHelper.GetParameters`,利用反射取得`MethodInfo.GetParameters`在將裡面資訊封裝到`ReflectedParameterDescriptor`物件中.

```csharp
public override ParameterDescriptor[] GetParameters()
{
	return ActionDescriptorHelper.GetParameters(this, MethodInfo, ref _parametersCache);
}

public static ParameterDescriptor[] GetParameters(ActionDescriptor actionDescriptor, MethodInfo methodInfo, ref ParameterDescriptor[] parametersCache)
{
	ParameterDescriptor[] parameters = LazilyFetchParametersCollection(actionDescriptor, methodInfo, ref parametersCache);

	return (ParameterDescriptor[])parameters.Clone();
}

private static ParameterDescriptor[] LazilyFetchParametersCollection(ActionDescriptor actionDescriptor, MethodInfo methodInfo, ref ParameterDescriptor[] parametersCache)
{
	return DescriptorUtil.LazilyFetchOrCreateDescriptors(
		cacheLocation: ref parametersCache,
		initializer: (CreateDescriptorState state) => state.MethodInfo.GetParameters(),
		converter: (ParameterInfo parameterInfo, CreateDescriptorState state) => new ReflectedParameterDescriptor(parameterInfo, state.ActionDescriptor),
		state: new CreateDescriptorState() { ActionDescriptor = actionDescriptor, MethodInfo = methodInfo });
}
```

`ReflectedParameterDescriptor`包含幾個重要屬性

1. `ParameterType`:參數類型
2. `ParameterName`:參數名稱
3. `DefaultValue`:參數預設值

上面幾個為`Action`參數元數據資料.

利用`ReflectedParameterDescriptor`之前封裝方法參數資訊對於`GetParameterValue`方法執行物件建立.

`GetParameterValue`方法中有幾個重要的`Field`

* `IModelBinder`使用`DefaultModelBinder`來綁定使用參數
* `IValueProvider`依靠`ValueProviderFactories`來取使用哪個Provider得並綁訂傳入參數資料.

```csharp
protected virtual object GetParameterValue(ControllerContext controllerContext, ParameterDescriptor parameterDescriptor)
{
	Type parameterType = parameterDescriptor.ParameterType;
	IModelBinder binder = GetModelBinder(parameterDescriptor);
	IValueProvider valueProvider = controllerContext.Controller.ValueProvider;
	string parameterName = parameterDescriptor.BindingInfo.Prefix ?? parameterDescriptor.ParameterName;
	Predicate<string> propertyFilter = GetPropertyFilter(parameterDescriptor);

	ModelBindingContext bindingContext = new ModelBindingContext()
	{
		FallbackToEmptyPrefix = (parameterDescriptor.BindingInfo.Prefix == null), // only fall back if prefix not specified
		ModelMetadata = ModelMetadataProviders.Current.GetMetadataForType(null, parameterType),
		ModelName = parameterName,
		ModelState = controllerContext.Controller.ViewData.ModelState,
		PropertyFilter = propertyFilter,
		ValueProvider = valueProvider
	};

	object result = binder.BindModel(controllerContext, bindingContext);
	return result ?? parameterDescriptor.DefaultValue;
}
```

## 小結: 

介紹`Action`參數綁定使用點和前置動作(這邊會發現很多`Interface`和`abstract class`,因為**MVC**提供許多可以替換點給開發人員擴充)

`InvokeAction`方法很重要,他的職責是執行使用者請求的`Action`方法,在此方法中有兩個核心物件.

* `ControllerDescriptor`
* `ActionDescriptor`

這兩個物件封裝後續呼叫`Action`需要的資訊,特別是`ActionDescriptor`裡面有一個`Execute`方法(靠他來呼叫`Action`方法)

另外也簡單介紹`IDictionary<string, object>`這個字典封裝了傳入`Action`方法的參數,

最後帶了點`Model`綁訂相關使用類別
