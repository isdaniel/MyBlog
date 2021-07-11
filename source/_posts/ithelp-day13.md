---
title:  Asp.net MVC如何實現IOC解析器 (第13天)
date: 2019-09-24 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---
# Agenda<!-- omit in toc -->
- [前言](#%e5%89%8d%e8%a8%80)
- [IOC介紹](#ioc%e4%bb%8b%e7%b4%b9)
	- [程式碼介紹IOC by Autofac](#%e7%a8%8b%e5%bc%8f%e7%a2%bc%e4%bb%8b%e7%b4%b9ioc-by-autofac)
- [AutoFac IOC容器 和 Asp.net mvc關係](#autofac-ioc%e5%ae%b9%e5%99%a8-%e5%92%8c-aspnet-mvc%e9%97%9c%e4%bf%82)
- [DependencyResolver 揭密](#dependencyresolver-%e6%8f%ad%e5%af%86)
- [MVC 裡IDependencyResolver](#mvc-%e8%a3%a1idependencyresolver)
- [小結:](#%e5%b0%8f%e7%b5%90)

## 前言

`IOC`依賴反轉是`oop`重要程式設計思想。

> `Ioc—Inversion of Control` 控制反轉

控制反轉是一個設計思想 ，把對於某個物件的控制權移轉給第三方容器.

詳細資訊可以查看小弟另一篇文章 [IOC(控制反轉)，DI(依賴注入) 深入淺出~~](https://isdaniel.github.io/ioc-di)

> 有沒有人會很好奇說為什麼只需要透過`DependencyResolver.SetResolver`方法我就可以直接使用`AutoFac`或其他IOC容器?

```csharp
//....
// 建立相依解析器
IContainer container = new builder.Build();
DependencyResolver.SetResolver(container);
```

今天跟大家分享`Asp.net MVC`利用什麼設計技巧,讓外部`IOC`容器可以很方便融入系統中.

> 我有做一個可以針對於[Asp.net MVC Debugger](https://github.com/isdaniel/Asp.net-MVC-Debuger)的專案，只要下中斷點就可輕易進入Asp.net MVC原始碼.

## IOC介紹

> 控制反轉是一個設計思想，把對於某個物件**建立,生命週期**控制權移轉給第三方統一管理
> 在設計模組時建議依賴抽象，因為各個模組間不需要知道對方太多細節（實作），知道越多耦合越強。

`A`物件內部有使用到`B`物件 `A`,`B`物件中有依賴的成份
控制反轉是把原本`A`對`B`控制權移交給第三方容器。
降低`A`對`B`物件的耦合性，讓雙方都倚賴第三方容器。

上面說明太抽象嗎? 可以看一下下面這張圖.

![img](https://dotblogsfile.blob.core.windows.net/user/九桃/493ce9d9-64bd-4343-a145-16ab21f3c695/1555312814_72597.png)

> 最後對於使用者來說,我只需要認識這個第三方容器並跟這個容器取得我要A物件,至於A物件和其他物件關係使用者不用瞭解

IOC容器框架有很多種但基本上都有下面兩個功能

1. 掌控物件生命週期
2. 設定物件關係的註冊表(取用時會依照此註冊關係建立物件並自動注入相依物件)

### 程式碼介紹IOC by Autofac

我們依照此圖做一個簡單範例**by Autofac**

![img](https://dotblogsfile.blob.core.windows.net/user/九桃/493ce9d9-64bd-4343-a145-16ab21f3c695/1555312814_72597.png)

`A`物件會直接引用於`B`和`C`物件這導致`A`**掌控**`B`和`C`物件創建和銷毀

如下面程式碼,A物件需要掌控`B`和`C`生命週期和物件建立.

```csharp
public class A{
    public B BObject {get;set;} =  new B();
    public C CObject {get;set;} =  new C();
}
```

如果透過`IOC`容器我們就不用擔心物件如何建立和他所依賴`B`和`C`物件,因為我們會在容器註表中指定他的關係,使用時只需要關注如何使用此物件.

```csharp
public class A{
    public B BObject {get;private set;}
    public C CObject {get;private set;}
	public A(B b,C c){
		BObject = b;
		CObject = c;
	}
}

//autofac property injection
ContainerBuilder builder = new ContainerBuilder();
builder.RegisterType<B>();
builder.RegisterType<C>();
builder.RegisterType<A>().PropertiesAutowired();
IContainer container = builder.Build();

var a = container.Resolve<A>();
```

這個程式碼是利用`Autofac`框架，比起上面多了一段註冊程式碼.主要告訴容器物件之間關係和如何掌控物件生命週期.

上面例子最後只需要利用`container.Resolve<T>`方法就可以跟容器來取想要的物件,至於引用的物件是如何注入或關係我們就不必關心.

## AutoFac IOC容器 和 Asp.net mvc關係

如果`Asp.net`沒有搭配**IOC容器**(預設使用`DefaultResolver`)`Asp.net MVC`對於使用物件必須寫死在`Controller`類別中

> 無法使用建構子或屬性來決定使用哪個物件

如下面程式碼

```csharp
public class HomeController : Controller
{
    IUserService userService;

    public HomeController(IUserService userService){
		if(userService == null)
			userService = new UserService();
    }
    public ActionResult Index()
    {

        return View();
    }
    //....
```

> 如果在建構子使用參數會丟錯誤,在[[Day11] Asp.net MVC Controller是怎麼被建立](https://ithelp.ithome.com.tw/articles/10219020)談到建立`Controller`物件透過`DefaultControllerActivator`預設使用反射建立`Controller`物件呼叫無參數的建構子方法.

![relationship_pic.PNG](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/13/Controller_Parameter.gif)

> 因為`Asp.net MVC`建立`Controller`是透過`Activator.CreateInstance`方法，

如果我們想在建構子傳入參數或是想要統一管理注入的物件，就可以使用`IOC`容器來幫我完成

-----

> 為什麼`Asp.net MVC`使用`DependencyResolver.SetResolver`方法替換成`IOC`容器就可輕易替換使用容器?

```csharp
//....
// 建立相依解析器
IContainer container = new builder.Build();
DependencyResolver.SetResolver(container);
```

## DependencyResolver 揭密

`DependencyResolver.SetResolver`提供一個替換`_current`欄位的機制

```csharp
/// <summary>
/// 可將第三方IOC容器設置
/// </summary>
/// <param name="resolver"></param>
public static void SetResolver(IDependencyResolver resolver)
{
    _instance.InnerSetResolver(resolver);
}

public static void SetResolver(object commonServiceLocator)
{
    _instance.InnerSetResolver(commonServiceLocator);
}

public void InnerSetResolver(IDependencyResolver resolver)
{
    if (resolver == null)
    {
        throw new ArgumentNullException("resolver");
    }

    _current = resolver;
    _currentCache = new CacheDependencyResolver(_current);
}
```

`Asp.net MVC` 提供一個介面 `IDependencyResolver` 讓第三方容器實現並擴充.
`IDependencyResolver`介面有兩個方法

1. `GetService`返回一個物件
2. `GetServices`返回一個物件集合

主要透過這`GetService`方法取得使用`Controller`物件

```csharp
public interface IDependencyResolver
{
    object GetService(Type serviceType);
    IEnumerable<object> GetServices(Type serviceType);
}
```

## MVC 裡IDependencyResolver

`Asp.net MVC`依賴`DependencyResolver.Current`來幫我們建立一個`Controller`物件

這邊介紹一下在`MVC`中三個`IDependencyResolver`解析器

1. `CacheDependencyResolver` 快取解析器(利用`ConcurrentDictionary`是一個多執行緒安全的字典)
2. `DefaultDependencyResolver`預設使用解析器(利用反射建立物件)
3. `DelegateBasedDependencyResolver`委派解析器.

```csharp
prprivate sealed class CacheDependencyResolver : IDependencyResolver
{ 
	//ConcurrentDictionary 是一個多執行緒 安全的Dictionary
	private readonly ConcurrentDictionary<Type, object> _cache = new ConcurrentDictionary<Type, object>();
   
	private readonly ConcurrentDictionary<Type, IEnumerable<object>> _cacheMultiple = new ConcurrentDictionary<Type, IEnumerable<object>>();
	private readonly Func<Type, object> _getServiceDelegate;
	private readonly Func<Type, IEnumerable<object>> _getServicesDelegate;

	private readonly IDependencyResolver _resolver;

	public CacheDependencyResolver(IDependencyResolver resolver)
	{
		_resolver = resolver;
		_getServiceDelegate = _resolver.GetService;
		_getServicesDelegate = _resolver.GetServices;
	}

	public object GetService(Type serviceType)
	{
		return _cache.GetOrAdd(serviceType, _getServiceDelegate);
	}

	public IEnumerable<object> GetServices(Type serviceType)
	{
		return _cacheMultiple.GetOrAdd(serviceType, _getServicesDelegate);
	}
}

private class DefaultDependencyResolver : IDependencyResolver
{
	public object GetService(Type serviceType)
	{
		// Since attempting to create an instance of an interface or an abstract type results in an exception, immediately return null
		// to improve performance and the debugging experience with first-chance exceptions enabled.
		if (serviceType.IsInterface || serviceType.IsAbstract)
		{
			return null;
		}

		try
		{
			return Activator.CreateInstance(serviceType);
		}
		catch
		{
			return null;
		}
	}

	public IEnumerable<object> GetServices(Type serviceType)
	{
		return Enumerable.Empty<object>();
	}
}
```

建立`Controller`預設使用`DefaultDependencyResolver`這個解析器

第三方`IOC`容器利用`DependencyResolver.SetResolver`方法把`DefaultDependencyResolver`替換掉使用他們自己實現的解析器提供物件

不是透過`DefaultDependencyResolver`反射來建立物件喔~

## 小結:

我們了解為什麼`Asp.net MVC`可透過`DependencyResolver.SetResolver`替換成`IOC`容器注入控制器物件.

如果要建立客製化的解析器可以實現`IDependencyResolver`介面並使用`DependencyResolver.SetResolver`替換`DefaultDependencyResolver`預設解析器

`DependencyResolver`,`Controller`和`ControllerFactory`的關係如下圖

![IOC_Asp.netMVC.png](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/13/IOC_Asp.netMVC.png)

下篇會介紹`DependencyResolver`在`Asp.net MVC`中有哪些實際的應用.