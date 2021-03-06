---
title: 動手DIY改造 Asp.net MVC- Route解析機制 (第26天)
date: 2019-10-07 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---

# Agenda<!-- omit in toc -->
- [前言](#%e5%89%8d%e8%a8%80)
- [RouteData](#routedata)
- [建立自己Route機制](#%e5%bb%ba%e7%ab%8b%e8%87%aa%e5%b7%b1route%e6%a9%9f%e5%88%b6)
- [小結:](#%e5%b0%8f%e7%b5%90)

## 前言
	
`UrlRoutingModule`對於`OnPostResolveRequestCache`事件添加一個對於**MVC**很重要的動作,透過`RouteCollection`取得此次請求匹配`RouteData`物件.

利用此`RouteData`取得要使用的`IHttpHandler`來執行它.

```csharp
RouteData routeData = RouteCollection.GetRouteData(context);
```

`RouteCollection`是全域路由註冊表.我們在一開始使用`MapRoute`註冊與之匹配`Controller`和`Action`

> `RouteCollection`是基於`RouteBase`物件集合,所以它可以存放所有繼承`RouteBase`物件,`RouteBase`這個類別有一個重要的方法來取得`RouteData`,`RouteData`封裝此次`Http`請求的`Controller`,`Action`...等資訊

對於每個`Http`請求依序找尋第一個匹配路由規則

```csharp
routes.MapRoute(
    name: "Default",
    url: "{controller}/{action}/{id}",
    defaults: new { controller = "Home", action = "Index", id = UrlParameter.Optional }
);
```

## RouteData

在`RouteData`類別中有幾個重要屬性.

* `RouteHandler`:存放`IRouteHandler`物件(提供`IHttpHander`並呼叫執行物件)
* `Values`: 一個字典集合,存放Key為`Controller`和`Action`,`Value`是`URL`參數值相對位置參數
* `GetRequiredString`:利用傳入`string`參數對於`Values`字典取匹配名稱.

```csharp
public class RouteData
{
    private RouteValueDictionary _values = new RouteValueDictionary();
    private RouteValueDictionary _dataTokens = new RouteValueDictionary();
    private IRouteHandler _routeHandler;

    /// <summary>
    ///   使用指定的路由及路由處理常式，初始化 <see cref="T:System.Web.Routing.RouteData" /> 類別的新執行個體。
    /// </summary>
    /// <param name="route">此物件會定義路由。</param>
    /// <param name="routeHandler">處理要求的物件。</param>
    public RouteData(RouteBase route, IRouteHandler routeHandler)
    {
      this.Route = route;
      this.RouteHandler = routeHandler;
    }

    /// <summary>
    ///   取得自訂值集合，當 ASP.NET 路由判斷路由是否符合要求時，會將這些值傳遞至路由處理常式但不會使用。
    /// </summary>
    public RouteValueDictionary DataTokens
    {
      get
      {
        return this._dataTokens;
      }
    }

    /// <summary>取得或設定代表路由的物件。</summary>
    public RouteBase Route { get; set; }

    /// <summary>取得或設定處理要求路由的物件。</summary>
    public IRouteHandler RouteHandler
    {
      get
      {
        return this._routeHandler;
      }
      set
      {
        this._routeHandler = value;
      }
    }

    /// <summary>取得 URL 參數值和預設路由值的集合。</summary>
    public RouteValueDictionary Values
    {
      get
      {
        return this._values;
      }
    }

    /// <summary>擷取具有指定識別項的值。</summary>
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
}
```

`RouteData`主要把`Client`傳送**Http**請求資訊經解析後存放在`Values`中.

`RouteBase`中有個`GetRouteData`方法，藉由我們的路由設定去解析當前是否匹配到路由規則，如果有就回傳一個`RouteData`物件，否則回傳`Null`

## 建立自己Route機制

一般使用`Route`這個物件是使用`/`當作註冊對應的規則

`{Controller}/{Action}`在`Domian`後用`/`當作分隔

第一個區塊字串被當作`ControllerName`

第二個區塊字串被當作`ActionName`

> 因為在**Asp.net MVC**透過`RouteData.GetRequiredString`傳入`ControllerName`或`ActionName`取得相對應的值.

這次例子我們希望可以透過`QueryString`來製作`Route`對應規則

> `{domain}?controller=home&action=about`

透過上面`URL`期望呼叫`HomeController.About`方法

廢話不多說我們來看一下這個`QueryStringRoute`是如何被實現

```csharp
public class QueryStringRoute : RouteBase
{
    public string Url { get; set; }

    private bool Match(NameValueCollection queryString, out IDictionary<string, string> variables)
    {
        variables = new Dictionary<string, string>();

        var para = Url.Split('&');
        if (!para.All(x=>queryString.AllKeys.Contains(x)))
            return false;

        variables = para.ToDictionary(x => x, y => queryString[y]);

        return true;
    }

    public override RouteData GetRouteData(HttpContextBase httpContext)
    {
        IDictionary<string, string> value;

        if (Match(httpContext.Request.QueryString,out value))
        {
            RouteData routeData = new RouteData(this, new MvcRouteHandler());

            foreach (var dict in value)
                routeData.Values.Add(dict.Key,dict.Value);

            return routeData;
        }

        return null;
    }

    public override VirtualPathData GetVirtualPath(RequestContext requestContext, RouteValueDictionary values)
    {
        return null;
    }
}
```

我們實現`RouteBase`抽象類別兩個方法

* `GetRouteData`
* `GetVirtualPath`

其中`GetRouteData`是我們主要要實作方法

`Request.QueryString`這個集合封裝**Http** `QueryString`的資訊.

首先我們先判斷此次請求`QueryString`是否由傳`Controller`,`Action`資料過來,如果有把值填入`RouteData.Values`字典集合中,反之不匹配此`Route`規則就回傳`NULL`.

> **MVC**從`RouteData.Values`取得對應的資料.

使用上就可透過`RouteCollection.Add`將`Route`添加到集合中

```csharp
public static void RegisterRoutes(RouteCollection routes)
{
    routes.Add("customer",new QueryStringRoute()
    {
        Url = "controller&action"
    });
}
```

**Http**請求就會依序找尋第一個匹配`Route`來執行.

## 小結:

透過繼承`RouteBase`抽象類別並實現`GetRouteData`方法透過返回`RouteData`物件對於`Http`請求資訊封裝到`RouteData.Values`字典集合.(在**MVC**框架中會對於`Values`字典中取`Key`為`Controller`和`Action`的值.)

最後再把新建立`RouteBase`物件加入到全域`RouteCollection`中.

希望大家看完這篇後可以了解並自行擴充自己`Route`機制.

本次範例程式碼[Git Sample](https://github.com/isdaniel/ItHelp_MVC_10th/tree/CustomerRoute)(CustomerRoute Branch)
