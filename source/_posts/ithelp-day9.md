---
title:  進入MVC原始碼世界 Route & RouteTable 原始碼解析 (第9天)
date: 2019-09-20 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---
# Agenda<!-- omit in toc -->
- [前言](#%e5%89%8d%e8%a8%80)
- [介紹Route](#%e4%bb%8b%e7%b4%b9route)
  - [RouteTable.Routes](#routetableroutes)
  - [MapRoute擴展方法](#maproute%e6%93%b4%e5%b1%95%e6%96%b9%e6%b3%95)
  - [Route物件](#route%e7%89%a9%e4%bb%b6)
  - [MapPageRoute 擴展方法](#mappageroute-%e6%93%b4%e5%b1%95%e6%96%b9%e6%b3%95)
- [在 Route中建立處理客製化HttpHandler](#%e5%9c%a8-route%e4%b8%ad%e5%bb%ba%e7%ab%8b%e8%99%95%e7%90%86%e5%ae%a2%e8%a3%bd%e5%8c%96httphandler)
- [小結：](#%e5%b0%8f%e7%b5%90)

## 前言

現在開始進入Asp.net MVC原始碼世界，我們從路由開始切入一步一步進入MVC核心.

我有做一個可以針對於[Asp.net MVC Debugger](https://github.com/isdaniel/Asp.net-MVC-Debuger)的專案，只要下中斷點就可輕易進入Asp.net MVC原始碼.

如下面動畫

![](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/9/Debugger.gif)

## 介紹Route

每個HTTP請求`MVC`使用路由的目標是`Controller`和`Action`，不像`ASP.NET Web Form`處理物理文件(`.aspx`文件)，要執行`Controller`和`Action`名稱包含在HTTP請求中，`ASP.NET MVC`需要通過解析HTTP請求得到正確的`Controller`和`Action`的名稱。

使用`Route`比**處理物理文件**有以下幾個優勢：

* 靈活性：請求`URL`是對物理文件路徑，意味著如果物理文件的路徑發生了改變（比如改變了文件的目錄結構或者文件名），原來該文件連結將變得無效。
* 可讀性：在很多情況下，URL不僅僅需要能夠訪問正確的網絡資源，也需要具有很好的可讀性，最好的URL應該讓我們一眼就能看出針對它訪問的目標資源是什麼。請求地址與物理文件緊密綁定讓我們完全失去了定義高可讀性URL的機會。
* SEO優化：對於網站開發來說，為了迎合搜索引擎檢索的規則，我們需要對URL進行有效的設計使之能易於被主流的引擎檢索收錄。如果URL完全與物理地址關聯，這失去了SEO優化的能力。
* 安全性：如接指向文件相對路徑無疑跟大家說你伺服器資料夾的結構，如果被有心人士（黑客）知道就可旁敲側擊攻擊您的伺服器．

### RouteTable.Routes

在Global.cs檔案中，有一個`RouteTable.Routes`是`RouteCollection`類型的集合物件

我們通過`RouteTable`靜態屬性`Routes`得到一個全域的路由表，路由註冊的核心價值在此集合上添加路由設定。

```csharp
RouteConfig.RegisterRoutes(RouteTable.Routes);
```

> `RouteCollection`他是繼承`Collection<RouteBase>`的集合物件，可以對此集合添加一個繼承`RouteBase`物件.

在Mvc一般是透過`MapRoute`擴展方法來添加路由

```csharp
public static void RegisterRoutes(RouteCollection routes)
{
    routes.IgnoreRoute("{resource}.axd/{*pathInfo}");
    routes.MapRoute(
        name: "Default",
        url: "{controller}/{action}/{id}",
        defaults: new { controller = "Home", action = "Index", id = UrlParameter.Optional }
    );
}
```

### MapRoute擴展方法

看一下`MapRoute`原始碼，這個方式是基於`RouteCollection`集合物件做的擴展方法，可看到最重要的部分是新增一個`Route`物件並加入集合中.

```csharp
public static Route MapRoute(this RouteCollection routes, string name, string url, object defaults, object constraints, string[] namespaces)
{
    // 判斷...
    Route route = new Route(url, new MvcRouteHandler())
    {
        Defaults = CreateRouteValueDictionaryUncached(defaults),
        Constraints = CreateRouteValueDictionaryUncached(constraints),
        DataTokens = new RouteValueDictionary()
    };

    ConstraintValidation.Validate(route);

    if ((namespaces != null) && (namespaces.Length > 0))
    {
        route.DataTokens[RouteDataTokenKeys.Namespaces] = namespaces;
    }
    //加入註冊路由器
    routes.Add(name, route);

    return route;
}
```

### Route物件

`Route`類別是繼承於`RouteBase`(這也就是為什麼可以把`Route`物件加入`RouteCollection`集合中)

下面我刪減一些此次不會介紹到的程式碼.

```csharp
public class Route : RouteBase
  {
    private const string HttpMethodParameterName = "httpMethod";
    private string _url;
    private ParsedRoute _parsedRoute;
    /// <summary>
    ///   使用指定的 URL 模式、預設參數值、條件約束、自訂值和處理常式類別，初始化 <see cref="T:System.Web.Routing.Route" /> 類別的新執行個體。
    /// </summary>
    /// <param name="url">路由的 URL 模式。</param>
    /// <param name="defaults">URL 未包含所有參數時所要使用的值。</param>
    /// <param name="constraints">指定 URL 參數之有效值的規則運算式。</param>
    /// <param name="dataTokens">
    ///   傳遞給路由處理常式的自訂值，但不會用來判斷路由是否符合特定 URL 模式。
    ///    這些值會傳遞至路由處理常式，以用來處理要求。
    /// </param>
    /// <param name="routeHandler">處理路由要求的物件。</param>
    public Route(
      string url,
      RouteValueDictionary defaults,
      RouteValueDictionary constraints,
      RouteValueDictionary dataTokens,
      IRouteHandler routeHandler)
    {
      this.Url = url;
      this.Defaults = defaults;
      this.Constraints = constraints;
      this.DataTokens = dataTokens;
      this.RouteHandler = routeHandler;
    }

    /// <summary>取得或設定運算式的字典，這些運算式指定 URL 參數的有效值。</summary>
    public RouteValueDictionary Constraints { get; set; }

    /// <summary>取得或設定自訂值，這些自訂值會傳遞給路由處理常式，但不會用來判斷路由是否符合 URL 模式。</summary>
    public RouteValueDictionary DataTokens { get; set; }

    /// <summary>取得或設定 URL 未包含所有參數時所要使用的值。</summary>
    public RouteValueDictionary Defaults { get; set; }

    /// <summary>取得或設定處理路由要求的物件。</summary>
    public IRouteHandler RouteHandler { get; set; }


    /// <summary>取得或設定路由的 URL 模式。</summary>
    public string Url
    {
      get
      {
        return this._url ?? string.Empty;
      }
      set
      {
        this._parsedRoute = RouteParser.Parse(value);
        this._url = value;
      }
    }

    /// <summary>傳回所要求路由的相關資訊。</summary>
    /// <param name="httpContext">封裝 HTTP 要求相關資訊的物件。</param>
    /// <returns>包含路由定義值的物件。</returns>
    public override RouteData GetRouteData(HttpContextBase httpContext)
    {
      RouteValueDictionary values = this._parsedRoute.Match(httpContext.Request.AppRelativeCurrentExecutionFilePath.Substring(2) + httpContext.Request.PathInfo, this.Defaults);
      if (values == null)
        return (RouteData) null;
      RouteData routeData = new RouteData((RouteBase) this, this.RouteHandler);
      if (!this.ProcessConstraints(httpContext, values, RouteDirection.IncomingRequest))
        return (RouteData) null;
      foreach (KeyValuePair<string, object> keyValuePair in values)
        routeData.Values.Add(keyValuePair.Key, keyValuePair.Value);
      if (this.DataTokens != null)
      {
        foreach (KeyValuePair<string, object> dataToken in this.DataTokens)
          routeData.DataTokens[dataToken.Key] = dataToken.Value;
      }
      return routeData;
    }
  }
```

在`Route`類別中`GetRouteData`是個重要方法，藉由我們的路由設定去解析當前是否匹配到路由規則，如果有就回傳一個`RouteData`物件，否則回傳`Null`

> 上一篇有介紹`UrlRoutingModule`這個`HttpModule`會藉由`RouteCollection.GetRouteData(context)`動作取得一個`RouteData`並透過他拿到`IHttpHander`物件並給值到`HttpContext.Handler`
> 
> 在裡面的實做是透過一個`foreach`去找尋匹配的`Route`物件，因為`ADD`路由是有順序性,所以在`RegisterRoutes(RouteCollection routes)`找尋路由會有第一個`MapRoute`到最後一個

`Url`這個屬性的`set`方法上做一個很有意思的動作，在設定值時除了賦值給`_url`字段,另外還將 設定template url Parse 取得一個`ParsedRoute _parsedRoute`物件.

* `ParsedRoute`將我們注冊的template url用`/`分割存起來方便日後判斷執行的`Action`和`Contoller`.

### MapPageRoute 擴展方法

路由除了使用於取得調用`Contoller`和`Action`資訊外，我們還可以通過`MapPageRoute`註冊URL樣板和某種文件的配對關係.

範例在:[Asp.net MVC Debugger](https://github.com/isdaniel/Asp.net-MVC-Debuger)

本次使用幾個參數

1. 路由名稱
2. 樣版URL
3. 指向實體`aspx`檔案路徑
4. 此路由是否找尋實體路徑
5. 樣版URL預設參數

```csharp
routes.MapPageRoute(
    "PhysicalFile",
    "GetFile/{Name}",
    "~/PhysicalFile.aspx", true,
    new RouteValueDictionary()
    {
        { "Name","PhysicalFile"}
    });
```

下圖是我們專案建立一個新的`.aspx`檔案

![](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/9/MapPageRoute.PNG)

裡面內容很簡單只是印出一段文字

```csharp
Hello PhysicalFile.aspx
```

因為有加入`MapPageRoute`路由,在瀏覽器網址列輸入`http:localhost:[your port]/GetFile`，我們就可以將`PhysicalFile.aspx`檔案內容顯示出來.

![](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/9/PhysicalFileAction.gif)

## 在 Route中建立處理客製化HttpHandler

在`Route`建構子中我們可以設定實現`IRouteHandler`物件,這個物件會有個方法可以返回`IHttpHandler`給`asp.net`請求使用.

```csharp

public class MyHandler : IHttpHandler
{
    public bool IsReusable
    {
        get
        {
            return true;
        }
    }

    public void ProcessRequest(HttpContext context)
    {
      
        context.Response.Write("Hello MyHandler!!");
    }
}

public class MyHandlerRouter : IRouteHandler
{
    public IHttpHandler GetHttpHandler(RequestContext requestContext)
    {
        return new MyHandler();
    }
}
```

我們可以建立`MyHandlerRouter`在`GetHttpHandler`返回一個`MyHandler`物件,之後把`MyHandlerRouter`當作參數傳入`Route`物件中

把`Route`加入全域路由集合中

```csharp
routes.Add(new Route("Customer",new MyHandlerRouter()));
```

> 在瀏覽器輸入 `http://localhost:[your port]/Customer` 我們就會執行我們自己客製化的`HttpHandler`


## 小結：

路由封裝了Http請求路徑資訊可以讓我們找到相對應的`Action`和`Controller`並呼叫執行外，可以透過`MapPageRoute`來將請求教給`.aspx`實體檔案來處理請求.

`Route`甚至可以讓我們自己客製化處理`HttpHandler` 如 [在 Route中建立處理客製化HttpHandler](#%E5%9C%A8-Route%E4%B8%AD%E5%BB%BA%E7%AB%8B%E8%99%95%E7%90%86%E5%AE%A2%E8%A3%BD%E5%8C%96HttpHandler)可謂很有彈性

下篇介紹`Route`物件建立`MvcRouteHandler`物件如何取到`IHttpHandler`.