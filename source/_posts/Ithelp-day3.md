---
title: 啟動吧!Asp.Net IsapiRunTime & HttpRuntime (第3天)
date: 2019-09-13 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---
# Agenda<!-- omit in toc -->
- [前言:](#%e5%89%8d%e8%a8%80)
- [IIS 與 Asp net (W3SVC服務)](#iis-%e8%88%87-asp-net-w3svc%e6%9c%8d%e5%8b%99)
- [IISAPIRuntime介面](#iisapiruntime%e4%bb%8b%e9%9d%a2)
- [IsapiRunTime.ProcessRequest](#isapiruntimeprocessrequest)
- [HttpRuntime.ProcessRequestNoDemand](#httpruntimeprocessrequestnodemand)
  - [ProcessRequestInternal](#processrequestinternal)
- [小結](#%e5%b0%8f%e7%b5%90)

## 前言:

上一篇我們介紹`HttpModule & HttpHandler`對於

今天正式進入`.Net CLR`處理Http請求的世界.

先附上`Asp.net`執行請求流程圖.

![瀏覽器請求IIS流程](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/IIS_Asp.net_Process.png)

現在開始講解藍色區塊.

>　查看原始碼好站 [Reference Source](https://referencesource.microsoft.com/) 

## IIS 與 Asp net (W3SVC服務)

`World Wide Web Publishing Service`（簡稱`W3SVC`）是一個Window Service.

`W3SVC`在`SvcHost.exe`這個應用程式上被執行.

`W3SVC`主要功能

1. **HTTP**請求的監聽
2. 工作執行緒的管理以及配置管理

當檢測到某個`HTTP Request`後，先根據一個註冊表判斷請求的副檔名是否是靜態資源(比如`.html,.img,.txt,.xml`...)
如果是則直接將文件內容以**HTTP Response**的形式返回。

如果是動態資源（比如`.aspx,asp,php`等等），則通過副檔名從`IIS`的`Script Map`找到相應`ISAPI.dll`

## IISAPIRuntime介面

前面說到透過`W3SVC`服務

`System.Web.Hosting.IISAPIRuntime`這個介面是一個基於`COM`的`Interface`,
`ASP.NET ISAPI`可以通過`COM`的方式調用實現該`Interface`的`Class`物件的`ProcessRequest`方法，從非託管環境進入了託管的環境。

```csharp
[ComImport, Guid("08a2c56f-7c16-41c1-a8be-432917a1a2d1"), InterfaceTypeAttribute(ComInterfaceType.InterfaceIsIUnknown)]
public interface IISAPIRuntime {

	void StartProcessing();

	void StopProcessing();

	[return: MarshalAs(UnmanagedType.I4)]
	int ProcessRequest(
					  [In]
					  IntPtr ecb, 
					  [In, MarshalAs(UnmanagedType.I4)]
					  int useProcessModel);

	void DoGCCollect();
}
```

>　所以`IISAPIRuntime.ProcessRequest`是我們探討原始碼起始點.

## IsapiRunTime.ProcessRequest

一開始會先呼叫`IsapiRunTime`的`ProcessRequest`方法來執行此次請求.

在`CreateWorkerRequest`會依據不同IIS版本建立不同`ISAPIWorkerRequest`物件,之後在呼叫`Initialize`方法把`Http`請求內容初次填入這個對象.

```csharp
ISAPIWorkerRequest wr = null;
try {
    bool useOOP = (iWRType == WORKER_REQUEST_TYPE_OOP);

    //初始化WorkerRequest物件
    wr = ISAPIWorkerRequest.CreateWorkerRequest(ecb, useOOP);
    wr.Initialize();

    // check if app path matches (need to restart app domain?)                
    String wrPath = wr.GetAppPathTranslated();
    String adPath = HttpRuntime.AppDomainAppPathInternal;                
    
    if (adPath == null ||
        StringUtil.EqualsIgnoreCase(wrPath, adPath)) {
        
        //執行請求
        HttpRuntime.ProcessRequestNoDemand(wr);
        return 0;
    }
    else {
        // need to restart app domain
        HttpRuntime.ShutdownAppDomain(ApplicationShutdownReason.PhysicalApplicationPathChanged,
                                        SR.GetString(SR.Hosting_Phys_Path_Changed,
                                                                        adPath,
                                                                        wrPath));
        return 1;
    }
}
```

這段程式碼有兩個重點:

1. 把Http請求內文封裝到`WorkerRequest`物件中,方便日後使用.
2. `wr.Initialize()`初始化`WorkerRequest`物件
3. 呼叫`HttpRuntime.ProcessRequestNoDemand`方法並把剛剛初始化的`WorkerRequest`物件當作參數傳入.

## HttpRuntime.ProcessRequestNoDemand

先來看看剛剛呼叫的`HttpRuntime.ProcessRequestNoDemand`方法.

這裡需要注意兩個重點.

1. 判斷目前執行程序池是否已經超過負荷,如果是會把`wr`物件指向`null`

    ```csharp
    if (rq != null)  
    wr = rq.GetRequestToExecute(wr);
    ```

2. 如果`wr!=null`(代表還有資源可以執行請求)就呼叫`ProcessRequestNow`方法會繼續呼叫`ProcessRequestInternal`方法.

```csharp
internal static void ProcessRequestNoDemand(HttpWorkerRequest wr) {
    RequestQueue rq = _theRuntime._requestQueue;

    wr.UpdateInitialCounters();

    if (rq != null)  // could be null before first request
        wr = rq.GetRequestToExecute(wr);

    if (wr != null) {
        CalculateWaitTimeAndUpdatePerfCounter(wr);
        wr.ResetStartTime();
        ProcessRequestNow(wr);
    }
}

internal static void ProcessRequestNow(HttpWorkerRequest wr) {
    _theRuntime.ProcessRequestInternal(wr);
}
```

### ProcessRequestInternal

在`HttpRuntime`很重要的方法之一是`ProcessRequestInternal`

> 下面程式碼，我把`ProcessRequestInternal`方法中註解移除且只貼出我覺得重要的程式碼

此方法有做幾個事情:

1. 如果Server很忙碌回傳`wr.SendStatus(503, "Server Too Busy");`
2. 利用`HttpWorkerRequest`物件封裝我們常常使用`HttpContext`
3. 透過`HttpApplicationFactory.GetApplicationInstance`返回一個`IHttpHandler`物件
4. 如果返回的`IHttpHandler`物件支援異步請求優先執行,不然就執行同步請求.

上面第3,4點最為重要,因為我們就可以很清楚了解到為什麼最後都會找到一個繼承`IHttpHandler`介面的物件來執行`ProcessRequest`方法.

因為`Asp.net`在`HttpRunTime`程式碼中倚賴一個`IHttpHandler`介面抽象才造就具有彈性的系統架構.

```csharp
private void ProcessRequestInternal(HttpWorkerRequest wr) {

    HttpContext context;

    try {
        //封裝我們常常使用`HttpContext`
        context = new HttpContext(wr, false /* initResponseWriter */);
    }
    catch {
        try {
            wr.SendStatus(400, "Bad Request");
            wr.SendKnownResponseHeader(HttpWorkerRequest.HeaderContentType, "text/html; charset=utf-8");
            byte[] body = Encoding.ASCII.GetBytes("<html><body>Bad Request</body></html>");
            wr.SendResponseFromMemory(body, body.Length);
            wr.FlushResponse(true);
            wr.EndOfRequest();
            return;
        } finally {
            Interlocked.Decrement(ref _activeRequestCount);
        }
    }

    try {
        try {
            EnsureFirstRequestInit(context);
        }
        catch {
            if (!context.Request.IsDebuggingRequest) {
                throw;
            }
        }

        context.Response.InitResponseWriter();

        IHttpHandler app = HttpApplicationFactory.GetApplicationInstance(context);

        if (app == null)
            throw new HttpException(SR.GetString(SR.Unable_create_app_object));

        if (EtwTrace.IsTraceEnabled(EtwTraceLevel.Verbose, EtwTraceFlags.Infrastructure)) EtwTrace.Trace(EtwTraceType.ETW_TYPE_START_HANDLER, context.WorkerRequest, app.GetType().FullName, "Start");

        //如果返回的IHttpHandler物件支援異步請求優先執行,不然就執行同步請求.
        if (app is IHttpAsyncHandler) {
            // asynchronous handler
            IHttpAsyncHandler asyncHandler = (IHttpAsyncHandler)app;
            context.AsyncAppHandler = asyncHandler;
            asyncHandler.BeginProcessRequest(context, _handlerCompletionCallback, context);
        }
        else {
            // synchronous handler
            app.ProcessRequest(context);
            FinishRequest(context.WorkerRequest, context, null);
        }
    }
    catch (Exception e) {
        context.Response.InitResponseWriter();
        FinishRequest(wr, context, e);
    }
}
```

下面此這個方法執行時兩個小重點.

> `ProcessRequestInternal`方法初始化我們常用`HttpContext`物件,把`Http`內容封裝到這個類別中.

> 如果返回`IHttpHandler`物件支援異步請求優先執行,不然就執行同步請求.

## 小結

今天我們學到

* `ISAPIRunTime.ProcessRequest`方法
   1. 建立一個`WorkerRequest`物件把Http內容封裝到裡面,並呼叫
   2. `HttpRuntime.ProcessRequestNoDemand`方法.
* `HttpRuntime.ProcessRequestNoDemand`方法
   1. 檢查目前是否有資源可以處理請求
   2. 封裝`HttpContext`並初始化內容資料
   3. 利用`HttpApplicationFactory.GetApplicationInstance`取得`IHttpHanlder`物件
   4. 呼叫`IHttpHanlder` `ProcessRequest`方法

下篇我們會來好好介紹`HttpApplicationFactory`這個工廠到底如何返回`IHttpHanlder`物件.
