---
title:  探討ViewEngine機制 View是如何被建立(三) (第24天)
date: 2019-10-05 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---

# Agenda<!-- omit in toc -->
- [前言](#%e5%89%8d%e8%a8%80)
- [ViewResultBase.ExecuteResult](#viewresultbaseexecuteresult)
- [IView](#iview)
	- [BuildManagerCompiledView](#buildmanagercompiledview)
	- [RazorView](#razorview)
- [IViewEngine](#iviewengine)
	- [VirtualPathProviderViewEngine](#virtualpathproviderviewengine)
	- [RazorViewEngine](#razorviewengine)
	- [ViewEngines and ViewEngineCollection](#viewengines-and-viewenginecollection)
- [提升執行效率小技巧](#%e6%8f%90%e5%8d%87%e5%9f%b7%e8%a1%8c%e6%95%88%e7%8e%87%e5%b0%8f%e6%8a%80%e5%b7%a7)
	- [移除不必要ViewEngine提升執行效率](#%e7%a7%bb%e9%99%a4%e4%b8%8d%e5%bf%85%e8%a6%81viewengine%e6%8f%90%e5%8d%87%e5%9f%b7%e8%a1%8c%e6%95%88%e7%8e%87)
	- [只允許某個View副檔名](#%e5%8f%aa%e5%85%81%e8%a8%b1%e6%9f%90%e5%80%8bview%e5%89%af%e6%aa%94%e5%90%8d)
- [小結:](#%e5%b0%8f%e7%b5%90)

## 前言

繼承`ActiontResult`類別中`ViewResultBase`最為複雜,因為`ViewResultBase`要找到實現`IViewEngine`物件取得取得`View`檔案,在透過實現`IView`物件把頁面渲染出來.

這篇會跟大家分享值型上面動作核心類別.

個人覺得**MVC**運用很多物件導向概念和用法,在讀程式時有件事情很重要是理解類別負責的工作和類別之間關係.就像現實生活中人與人的關係要了解清楚.

> 我有做一個可以針對於[Asp.net MVC Debugger](https://github.com/isdaniel/Asp.net-MVC-Debuger)的專案，只要下中斷點就可輕易進入Asp.net MVC原始碼.

## ViewResultBase.ExecuteResult

因為`ExecuteResult`是最終被呼叫方法,我們來解析`ViewResultBase.ExecuteResult`方法邏輯.

1. 透過子類別實現`FindView`取得`View`相關資料.
2. 呼叫實現`IView`物件`Render`方法,並將渲染出來資料透過`Response.Output`輸出到`Client`端

```csharp
public override void ExecuteResult(ControllerContext context)
{
    if (context == null)
    {
        throw new ArgumentNullException("context");
    }
    if (String.IsNullOrEmpty(ViewName))
    {
        ViewName = context.RouteData.GetRequiredString("action");
    }

    ViewEngineResult result = null;

    if (View == null)
    {
        result = FindView(context);
        View = result.View;
    }

    TextWriter writer = context.HttpContext.Response.Output;
    ViewContext viewContext = new ViewContext(context, View, ViewData, TempData, writer);
    View.Render(viewContext, writer);

    if (result != null)
    {
        result.ViewEngine.ReleaseView(context, View);
    }
}

protected abstract ViewEngineResult FindView(ControllerContext context);
```

這張`UML`表示`ViewResultBase`繼承關係圖.

我們在`Controller`呼叫的`View()`和`PartailView()`方法就是建立`PartialViewResult`和`ViewResult`方法並且呼叫`ExecuteResult`進行`View`頁面渲染.

![UML_Model](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/24/ViewResultBase_UML.png)

## IView

View是一個實現了`IView`介面物件。`IView`定義非常簡單，僅僅具有唯一`Render`方法根據指定`ViewContext`和`TextWriter`物件達成對於`View`渲染顯示

```csharp
public interface IView
{
    void Render(ViewContext viewContext, TextWriter writer);
}
```

### BuildManagerCompiledView

`BuildManagerCompiledView`類別實現`Render`對於`View`如何被渲染呈現.

主要透過下面幾個步驟.

1. `.cshtml,.aspx`頁面程式碼會轉成編譯成一個繼承`WebViewPage`類別的`dll`檔案.`BuildManagerWrapper`靜態方法`GetCompiledType`依據指定`View`檔案虛擬路徑得到編譯後`WebPageView`類型
2. `IViewPageActivator(DefaultViewPageActivator)`利用反射建立`WebPageView`物件由頁面程式產生的`View`物件
3. 最後再呼叫由子類實現`RenderView`方法

> `BuildManagerCompiledView`屬性`ViewPath`表示的就是`View`文件虛擬路徑.

```csharp
public abstract class BuildManagerCompiledView : IView
{
	internal IViewPageActivator ViewPageActivator;
	private IBuildManager _buildManager;
	private ControllerContext _controllerContext;

	internal IBuildManager BuildManager
	{
		get
		{
			if (_buildManager == null)
			{
				_buildManager = new BuildManagerWrapper();
			}
			return _buildManager;
		}
		set { _buildManager = value; }
	}

	public string ViewPath { get; protected set; }

	public virtual void Render(ViewContext viewContext, TextWriter writer)
	{
		if (viewContext == null)
		{
			throw new ArgumentNullException("viewContext");
		}

		object instance = null;
		//取得view型態
		Type type = BuildManager.GetCompiledType(ViewPath);
		if (type != null)
		{
			instance = ViewPageActivator.Create(_controllerContext, type);
		}

		if (instance == null)
		{
			throw new InvalidOperationException(
				String.Format(
					CultureInfo.CurrentCulture,
					MvcResources.CshtmlView_ViewCouldNotBeCreated,
					ViewPath));
		}

		RenderView(viewContext, writer, instance);
	}

	protected abstract void RenderView(ViewContext viewContext, TextWriter writer, object instance);
}
```

### RazorView

`RazorView`繼承`BuildManagerCompiledView`,`RazorView`具有三個只讀屬性

* `LayoutPath`：`View`佈局檔案虛擬路徑
* `ViewStartFileExtensions`：表示開始頁面文件的擴展名,對於`Razor`引擎默認創建`RazorView`,通過`_ViewStart.cshtml`檔案定義開始頁面相關資訊.
* `RunViewStartPages`:這個`bool`掌控執行開始頁面判斷
* 
```csharp
public class RazorView : BuildManagerCompiledView
{
	public string LayoutPath { get; private set; }

	public bool RunViewStartPages { get; private set; }

	public IEnumerable<string> ViewStartFileExtensions { get; private set; }

	protected override void RenderView(ViewContext viewContext, TextWriter writer, object instance)
	{
		if (writer == null)
		{
			throw new ArgumentNullException("writer");
		}

		WebViewPage webViewPage = instance as WebViewPage;
		if (webViewPage == null)
		{
			throw new InvalidOperationException(
				String.Format(
					CultureInfo.CurrentCulture,
					MvcResources.CshtmlView_WrongViewBase,
					ViewPath));
		}

		webViewPage.OverridenLayoutPath = LayoutPath;
		webViewPage.VirtualPath = ViewPath;
		webViewPage.ViewContext = viewContext;
		webViewPage.ViewData = viewContext.ViewData;

		webViewPage.InitHelpers();

		if (VirtualPathFactory != null)
		{
			webViewPage.VirtualPathFactory = VirtualPathFactory;
		}
		if (DisplayModeProvider != null)
		{
			webViewPage.DisplayModeProvider = DisplayModeProvider;
		}

		WebPageRenderingBase startPage = null;
		if (RunViewStartPages)
		{
			startPage = StartPageLookup(webViewPage, RazorViewEngine.ViewStartFileName, ViewStartFileExtensions);
		}
		webViewPage.ExecutePageHierarchy(new WebPageContext(context: viewContext.HttpContext, page: null, model: null), writer, startPage);
	}
}
```

`RenderView`方法執行幾個步驟.

1. `RenderView`方法將`BuildManagerCompiledView`方法取得`instance`物件轉換型別成`WebViewPage`
2. 資料初始化(建立`UrlHelp`,....)物件
3. 判斷是否使用`Razor`共用樣板
4. 呼叫`ExecutePageHierarchy`,進行頁面渲染,最主要呼叫`Execute`方法來執行子類別實現邏輯.

下面是`IView`類別關係圖

![UML_Model](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/24/IView_Uml.png)

最後由`WebFormView`,`RazorView`實現頁面的渲染工作.

## IViewEngine

這個介面提供找尋使用`ViewEngineResult`,`View`和`ViewEngine`屬性找到`View`物件和使用的`ViewEngine`物件,`SearchedLocations`屬性表示在獲取目標搜索過程中使用的搜索位置列表

```csharp
public interface IViewEngine
{
    ViewEngineResult FindPartialView(ControllerContext controllerContext, string partialViewName, bool useCache);
    ViewEngineResult FindView(ControllerContext controllerContext, string viewName, string masterName, bool useCache);
    void ReleaseView(ControllerContext controllerContext, IView view);
}

public class ViewEngineResult
{
	public IEnumerable<string> SearchedLocations { get; private set; }

	public IView View { get; private set; }

	public IViewEngine ViewEngine { get; private set; }
}
```

### VirtualPathProviderViewEngine

`VirtualPathProviderViewEngine`這個抽象類別,實現`FindPartialView`和`FindView`方法,另外提供一個抽象方法`CreateView`和`CreatePartialView`提供子類(`WebFormViewEngine`,`RazorViewEngine`)來實現.

下面是`FindView`原始碼.

```csharp
public virtual ViewEngineResult FindView(ControllerContext controllerContext, string viewName, string masterName, bool useCache)
{
    //....

    string[] viewLocationsSearched;
    string[] masterLocationsSearched;

    string controllerName = controllerContext.RouteData.GetRequiredString("controller");
    string viewPath = GetPath(controllerContext, ViewLocationFormats, AreaViewLocationFormats, "ViewLocationFormats", viewName, controllerName, CacheKeyPrefixView, useCache, out viewLocationsSearched);
    string masterPath = GetPath(controllerContext, MasterLocationFormats, AreaMasterLocationFormats, "MasterLocationFormats", masterName, controllerName, CacheKeyPrefixMaster, useCache, out masterLocationsSearched);

    if (String.IsNullOrEmpty(viewPath) || (String.IsNullOrEmpty(masterPath) && !String.IsNullOrEmpty(masterName)))
    {
        return new ViewEngineResult(viewLocationsSearched.Union(masterLocationsSearched));
    }

    return new ViewEngineResult(CreateView(controllerContext, viewPath, masterPath), this);
}
```

### RazorViewEngine

前面有提到`VirtualPathProviderViewEngine`提供一個抽象類別給子類來實現如何建立一個`IView`物件.

`RazorViewEngine`透過上面資訊建立一個`RazorView`(此類別實現`IView`介面),最終`ViewBaseResult`就是呼叫`IView`的`Render`方法.

> `RazorViewEngine`就是建立到時候要`Render`到`OutputStream`物件.

```csharp
protected override IView CreateView(ControllerContext controllerContext, string viewPath, string masterPath)
{
    var view = new RazorView(controllerContext, viewPath,
                                layoutPath: masterPath, runViewStartPages: true, viewStartFileExtensions: FileExtensions, viewPageActivator: ViewPageActivator)
    {
        DisplayModeProvider = DisplayModeProvider
    };
    return view;
}
```

### ViewEngines and ViewEngineCollection

透過`ViewEngines.Engines`可以取得目前可以使用`View`引擎.

**ASP.NET MVC**為我們提供了兩種`View`引擎(`RazorViewEngine`,`WebFormViewEngine`)，

* 提供傳統**Web Form**引擎，`.aspx`頁面一致`WebFormViewEngine`，
* 另一種預設使用也是推薦使用**Razor**引擎`RazorViewEngine`。

```csharp
public static class ViewEngines
{
    private static readonly ViewEngineCollection _engines = new ViewEngineCollection
    {
        new WebFormViewEngine(),
        new RazorViewEngine(),
    };

    public static ViewEngineCollection Engines
    {
        get { return _engines; }
    }
}
```

`ViewEngine`類別關係圖如下

![UML_Model](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/24/IViewEngine_Uml.png)

這邊以`RazorViewEngine`來介紹

* `ViewLocationFormats`:預設找尋`View`實體檔案位置
* `PartialViewLocationFormats`:預設找尋`PartialView`實體檔案位置
* `FileExtensions`:`Razor`使用附檔名.

## 提升執行效率小技巧

這裡有個小技巧可提高**MVC**執行效率.

### 移除不必要ViewEngine提升執行效率

**MVC**藉由`ViewEngineCollection`這個集合來判斷使用`ViewEngine`,且它預設有兩個`ViewEngines`提供給我們使用(`RazorViewEngine`,`WebFormViewEngine`)一般來說我們只使用一個`ViewEngine`另一個就不會用到.

如果我們只使用`RazorViewEngine`就可在`Global.cs`上撰寫這段程式碼,主要是把不必要`ViewEngine`移除只關注在我們使用`ViewEngine`

```csharp
ViewEngines.Engines.Clear();
ViewEngines.Engines.Add(new RazorViewEngine());
```

### 只允許某個View副檔名

在`Razor`有支援兩個副檔名

1. `vbhtml`:vb使用
2. `cshtml`:c#使用

如果我們想強制這個專案都使用C#的Razor撰寫view,可藉由幾個屬性來幫我們限制完成.

```csharp
ViewEngines.Engines.Add(new RazorViewEngine()
{
	AreaViewLocationFormats = new[]
	{
		"~/Areas/{2}/Views/{1}/{0}.cshtml",
		"~/Areas/{2}/Views/Shared/{0}.cshtml",
	},
	AreaMasterLocationFormats = new[]
	{
		"~/Areas/{2}/Views/{1}/{0}.cshtml",
		"~/Areas/{2}/Views/Shared/{0}.cshtml",
	},
	AreaPartialViewLocationFormats = new[]
	{
		"~/Areas/{2}/Views/{1}/{0}.cshtml",
		"~/Areas/{2}/Views/Shared/{0}.cshtml"
	},

	ViewLocationFormats = new[]
	{
		"~/Views/{1}/{0}.cshtml",
		"~/Views/Shared/{0}.cshtml",
	},
	MasterLocationFormats = new[]
	{
		"~/Views/{1}/{0}.cshtml",
		"~/Views/Shared/{0}.cshtml"
	},
	PartialViewLocationFormats = new[]
	{
		"~/Views/{1}/{0}.cshtml",
		"~/Views/Shared/{0}.cshtml"
	},
	FileExtensions = new[]
	{
		"cshtml",
	}
});
```

## 小結:

本篇大致上把產生`View`頁面使用到的幾個核心介面和類別介紹完了,我們主要會使用繼承`ViewResultBase`物件並透過,相對應實現`IView`物件來進行畫面渲染,如何取得使用的`IView`物件就透過`ViewEngines`集合.

上面介紹了三個抽象類別和介面,每個都有自己核心職責並且和其他物件有清晰關係

* `ViewResultBase`:實現`ActionResult`提供`Controller`呼叫產生頁面`ExecuteResult`方法.
* `IView`:提供如何渲染頁面
* `IViewEngine`:透過虛擬路徑找到要執行頁面(透過一些機制).
