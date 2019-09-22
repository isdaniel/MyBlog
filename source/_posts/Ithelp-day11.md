---
title:  Asp.net MVC Controller是怎麼被建立 (第11天)
date: 2019-09-22 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---
# Agenda<!-- omit in toc -->
- [前言](#%e5%89%8d%e8%a8%80)
- [取得執行Controller](#%e5%8f%96%e5%be%97%e5%9f%b7%e8%a1%8ccontroller)
  - [ControllerBuilder](#controllerbuilder)
  - [IControllerFactory介面](#icontrollerfactory%e4%bb%8b%e9%9d%a2)
  - [ControllerFactory(DefaultControllerFactory.cs)](#controllerfactorydefaultcontrollerfactorycs)
- [小結:](#%e5%b0%8f%e7%b5%90)

## 前言

前篇介紹MVC使用`HttpHandler`是`MvcHandler`透過並`MvcRouteHandler`物件來返回.

![relationship_pic.PNG](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/10/relationship_pic.PNG)

我有做一個可以針對於[Asp.net MVC Debugger](https://github.com/isdaniel/Asp.net-MVC-Debuger)的專案，只要下中斷點就可輕易進入Asp.net MVC原始碼.

大家介紹如何取得`Controller`執行物件

## 取得執行Controller

在`ProcessRequest`方法是透過`ProcessRequestInit`取得執行`controller`物件,讓我們看看是這個方法如何`controller`物件.

```csharp
private void ProcessRequestInit(HttpContextBase httpContext, out IController controller, out IControllerFactory factory)
{
    HttpContext currentContext = HttpContext.Current;
    if (currentContext != null)
    {
        bool? isRequestValidationEnabled = ValidationUtility.IsValidationEnabled(currentContext);
        if (isRequestValidationEnabled == true)
        {
            ValidationUtility.EnableDynamicValidation(currentContext);
        }
    }

    AddVersionHeader(httpContext);
    RemoveOptionalRoutingParameters();

    // Get the controller type
    string controllerName = RequestContext.RouteData.GetRequiredString("controller");

    // Instantiate the controller and call Execute
    factory = ControllerBuilder.GetControllerFactory();
    controller = factory.CreateController(RequestContext, controllerName);
    if (controller == null)
    {
        throw new InvalidOperationException(
            String.Format(
                CultureInfo.CurrentCulture,
                MvcResources.ControllerBuilder_FactoryReturnedNull,
                factory.GetType(),
                controllerName));
    }
}
```

從上面程式碼可以得知我們執行`Controller`物件實現於`IController`介面，並會呼叫`IController.Execute`方法.

> `IController`介面是同步的方式執行。為了支持非同步請求處理，`IController`介面非同步版本`System.Web.Mvc.IAsyncController`被定義出来。`IAsyncController`介面通過`BeginExecute/EndExecute`方法组合来完成。

```csharp
public interface IController
{
    void Execute(RequestContext requestContext);
}

public interface IAsyncController : IController
{
    IAsyncResult BeginExecute(RequestContext requestContext, AsyncCallback callback, object state);
    void EndExecute(IAsyncResult asyncResult);
}
```

透過`RouteData.GetRequiredString`取得執行`Controller`名稱，經由`RouteValueDictionary`查找之前註冊Url樣板並解析此次要使用`Controller`名稱

```csharp
public string GetRequiredString(string valueName)
{
    object obj;
    if (this.Values.TryGetValue(valueName, out obj))
    {
        string str = obj as string;
        if (!string.IsNullOrEmpty(str))
            return str;
    }
    throw new InvalidOperationException(string.Format((IFormatProvider) CultureInfo.CurrentUICulture, System.Web.SR.GetString("RouteData_RequiredValue"), new object[1]
    {
    (object) valueName
    }));
}
```

### ControllerBuilder

`ControllerBuilder`類別定義一個`Current`靜態只讀屬性現在返回`ControllerBuilder`物件是一個全域物件。`SetControllerFactory`方法重載用於註冊`ControllerFactory`類型或物件，而`GetControllerFactory`方法返回一個具體`ControllerFactory`物件。

我們透過`GetControllerFactory`取得返回`Controller`工廠.

```csharp
public class ControllerBuilder
{
    public IControllerFactory GetControllerFactory();
    public void SetControllerFactory(Type controllerFactoryType);
    public void SetControllerFactory(IControllerFactory controllerFactory);  
    IControllerFactory GetControllerFactory();
    public HashSet<string> DefaultNamespaces { get; }
    public static ControllerBuilder Current { get; }
}
```

`GetControllerFactory`透過`private IResolver<IControllerFactory>`取得要執行的`ControllerFactory`.

一般來說沒有設置就是使用`DefaultControllerFactory`工廠來取得`Controller`物件

```csharp
public IControllerFactory GetControllerFactory()
{
    return _serviceResolver.Current;
}

internal ControllerBuilder(IResolver<IControllerFactory> serviceResolver)
{
_serviceResolver = serviceResolver ?? new SingleServiceResolver<IControllerFactory>(
                () => _factoryThunk(),
                new DefaultControllerFactory { ControllerBuilder = this },
                "ControllerBuilder.GetControllerFactory");
}
```

### IControllerFactory介面

`IControllerFactory`介面有三個方法.

1. `CreateController`取得`Controller`物件(工廠模式最重要方法)
2. `GetControllerSessionBehavior`取得`Session`
   * Default：使用預設`ASP.NET` Session狀態行為。
   * Required：使用完全的讀和寫Session狀態行為。
   * ReadOnly：使用只讀Session狀態。
   * Disabled：不使用Session狀態。
3. `ReleaseController`釋放使用資源

```csharp
public interface IControllerFactory
{
    IController CreateController(RequestContext requestContext, string controllerName);
    SessionStateBehavior GetControllerSessionBehavior(RequestContext requestContext, string controllerName);
    void ReleaseController(IController controller);
}
```

### ControllerFactory(DefaultControllerFactory.cs)

既然知道透過哪個工廠來產生`Controller`我們繼續追工廠是如何產生`Controller`物件

1. `GetControllerType`取得要執行`Controller`類型
2. `GetControllerInstance`取得`Controller`物件並返回使用

```csharp
public virtual IController CreateController(RequestContext requestContext, string controllerName)
{
    if (requestContext == null)
    {
        throw new ArgumentNullException("requestContext");
    }

    if (String.IsNullOrEmpty(controllerName) && !requestContext.RouteData.HasDirectRouteMatch())
    {
        throw new ArgumentException(MvcResources.Common_NullOrEmpty, "controllerName");
    }

    Type controllerType = GetControllerType(requestContext, controllerName);
    IController controller = GetControllerInstance(requestContext, controllerType);
    return controller;
}
```

`GetControllerInstance`通過反射（系統不會對建立的`Controller`進行快取

> 使用`IControllerActivator`(預設`DefaultControllerActivator`) 來建立`Controller`物件

```csharp
protected internal virtual IController GetControllerInstance(RequestContext requestContext, Type controllerType)
{
    if (controllerType == null)
    {
        throw new HttpException(404,
                                String.Format(
                                    CultureInfo.CurrentCulture,
                                    MvcResources.DefaultControllerFactory_NoControllerFound,
                                    requestContext.HttpContext.Request.Path));
    }
    if (!typeof(IController).IsAssignableFrom(controllerType))
    {
        throw new ArgumentException(
            String.Format(
                CultureInfo.CurrentCulture,
                MvcResources.DefaultControllerFactory_TypeDoesNotSubclassControllerBase,
                controllerType),
            "controllerType");
    }
    //使用IControllerActivator(預設DefaultControllerActivator) 來建立Controller物件
    return ControllerActivator.Create(requestContext, controllerType);
}
```

## 小結:

今天我們學到如何取得`Controller`執行物件

1. 透過一個`IControllerFactory`工廠物件取得`Controller`執行物件,對於外部提供可替換點.
2. 利用`RouteData.GetRequiredString`取得執行的`Controller`名稱
3. `DefaultControllerFactory`透過反射方式動態建立物件.

工廠模式主要核心把如何使用物件跟如何建立物件中間解耦合，使用方不關心如何產生物件，只專注於此物件可執行的能力（介面）

下圖是本次介紹類別`UML`關係圖

![mvchandler_uml.png](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/11/mvchandler_uml.png)

`MvcHandler`是`MVC`的核心類別,借由`ControllerBuilder`創件者來取得產生`Controller`的工廠(預設使用`DefaultControllerFactory`)，並呼叫`CreateController`方法來產生一個`Controller`
