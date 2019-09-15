---
title: 掌控HttpApplication物件建立 - HttpApplicationFactory (第4天)
date: 2019-09-15 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---
# Agenda<!-- omit in toc -->
- [前言：](#%e5%89%8d%e8%a8%80)
- [HttpApplication物件](#httpapplication%e7%89%a9%e4%bb%b6)
- [取得使用 HttpApplication物件 (GetApplicationInstance)](#%e5%8f%96%e5%be%97%e4%bd%bf%e7%94%a8-httpapplication%e7%89%a9%e4%bb%b6-getapplicationinstance)
  - [HttpApplicationFactory 初始化 (EnsureInited方法)](#httpapplicationfactory-%e5%88%9d%e5%a7%8b%e5%8c%96-ensureinited%e6%96%b9%e6%b3%95)
  - [Application_Start方法為什麼只會呼叫一次? (EnsureAppStartCalled)](#applicationstart%e6%96%b9%e6%b3%95%e7%82%ba%e4%bb%80%e9%ba%bc%e5%8f%aa%e6%9c%83%e5%91%bc%e5%8f%ab%e4%b8%80%e6%ac%a1-ensureappstartcalled)
- [GetNormalApplicationInstance](#getnormalapplicationinstance)
- [小結](#%e5%b0%8f%e7%b5%90)

## 前言：

附上`Asp.net`執行請求流程圖.

![瀏覽器請求IIS流程](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/IIS_Asp.net_Process.png)

在前一篇我們說到`HttpRunTime`會透過`GetApplicationInstance`來取得一個`IHttpHandler`對象.

今天跟著原始碼來了解到底回傳一個什麼`IHttpHandler`物件給`HttpRunTime`使用.

>　查看原始碼好站 [Reference Source](https://referencesource.microsoft.com/) 

## HttpApplication物件

HttpApplication是整個`ASP.NET`基礎的核心。一個HttpApplication物件在某個時刻只能處理一個請求,只有完成對某個請求處理後,該HttpApplication才能用於後續的請求的處理。

所以`ASP.NET`利用物件程序池機制來建立或者取得HttpApplication物件。具體來講,當第一個`Http`請求抵達的時候,`ASP.NET`會一次建立多個HttpApplication物件,並將其置於池中,選擇其中一個物件來處理該請求。

而如果程序池中沒有`HttpApplication`物件,`Asp.net`會建立新的`HttpApplication`物件處理請求

`HttpApplication`物件處理`Http`請求整個生命週期是一個相對複雜的過程,在該過程的不同階段會觸發相應的事件。我們可以註冊相應的事件(如同[上一篇](https://ithelp.ithome.com.tw/articles/10214999)介紹事件表)

下圖就是模擬`HttpApplication`的`ObjectPool`樣子

![HttpApplication](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/4/objectPool.png)

## 取得使用 HttpApplication物件 (GetApplicationInstance)

讓我們看看`GetApplicationInstan`方法做了什麼事情.

```Csharp
private static HttpApplicationFactory _theApplicationFactory = new HttpApplicationFactory();

internal static IHttpHandler GetApplicationInstance(HttpContext context) {
    if (_customApplication != null)
        return _customApplication;

    // Check to see if it's a debug auto-attach request
    if (context.Request.IsDebuggingRequest)
        return new HttpDebugHandler();

    _theApplicationFactory.EnsureInited();

    _theApplicationFactory.EnsureAppStartCalled(context);

    return _theApplicationFactory.GetNormalApplicationInstance(context);
}
```

`_theApplicationFactory`是一個靜態物件

`_theApplicationFactory`呼叫三個方法`EnsureInited`,`EnsureAppStartCalled`,`GetNormalApplicationInstance`,讓我們一一來解析做了些什麼事情吧

### HttpApplicationFactory 初始化 (EnsureInited方法)

通過查找Init方法的代碼以及其中2行如下代碼裡的細節,我們可以得知,這2行代碼主要是從global.asax獲取內容,然後進行編譯。

`HttpApplicationFactory.EnsureInited()`方法檢查`HttpApplicationFactory`是否已經被初始化,如果沒有就呼叫`HttpApplicationFactory.Init()`進行初始化。

在`Init()`中,先獲取網站下`global.asax`文件完整路徑(透過`GetApplicationFile`方法),最後呼叫`CompileApplication()`方法對`global.asax`進行編譯.

在EnsureInited方法

```csharp
private void EnsureInited() {
    if (!_inited) {
        lock (this) {
            if (!_inited) {
                Init();
                _inited = true;
            }
        }
    }
}

private void CompileApplication() {
    // Get the Application Type and AppState from the global file
    _theApplicationType = BuildManager.GetGlobalAsaxType();

    BuildResultCompiledGlobalAsaxType result = BuildManager.GetGlobalAsaxBuildResult();

    if (result != null) {
        if (result.HasAppOrSessionObjects) {
            GetAppStateByParsingGlobalAsax();
        }

        _fileDependencies = result.VirtualPathDependencies;
    }

    if (_state == null) {
        _state = new HttpApplicationState();
    }

    ReflectOnApplicationType();
}
```

`ReflectOnApplicationType`方法取得目前特別事件方法,並添加到相對應的`MethodInfo`成員上

會透過以下三類方法名稱去取方法資訊

* `Application_OnStart` or `Application_Start`
* `Application_OnEnd` or `Application_End`
* `Session_OnEnd` or `Session_End`

> 取得這些資訊會提供`EnsureAppStartCalled`去呼叫`Application_OnStart`方法

```csharp
private void ReflectOnApplicationType() {
    ArrayList handlers = new ArrayList();
    MethodInfo[] methods;

    Debug.Trace("PipelineRuntime", "ReflectOnApplicationType");

    // get this class methods
    methods = _theApplicationType.GetMethods(BindingFlags.NonPublic | BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static);
    foreach (MethodInfo m in methods) {
        if (ReflectOnMethodInfoIfItLooksLikeEventHandler(m))
            handlers.Add(m);
    }
    
    // get base class private methods (GetMethods would not return those)
    Type baseType = _theApplicationType.BaseType;
    if (baseType != null && baseType != typeof(HttpApplication)) {
        methods = baseType.GetMethods(BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static);
        foreach (MethodInfo m in methods) {
            if (m.IsPrivate && ReflectOnMethodInfoIfItLooksLikeEventHandler(m))
                handlers.Add(m);
        }
    }

    // remember as an array
    _eventHandlerMethods = new MethodInfo[handlers.Count];
    for (int i = 0; i < _eventHandlerMethods.Length; i++)
        _eventHandlerMethods[i] = (MethodInfo)handlers[i];
}
```

### Application_Start方法為什麼只會呼叫一次? (EnsureAppStartCalled)

`HttpApplicationFactory.EnsureAppStartCalled`方法建立一個`HttpApplication`物件並觸發`Application_OnStart`事件(執行`Global.asax`中的`Application_Start(object sender, EventArgs e)`)

在處理完事件`Application_OnStart`後`HttpApplication`物件會立即被回收掉,因為系統初始化只需要一次

> 但是其中`GetSpecialApplicationInstance`裡會對`IIS7`做一些特殊的事情這裡就不多提

```csharp
private void EnsureAppStartCalled(HttpContext context) {
    if (!_appOnStartCalled) {
        lock (this) {
            if (!_appOnStartCalled) {
                using (new DisposableHttpContextWrapper(context)) {

                    WebBaseEvent.RaiseSystemEvent(this, WebEventCodes.ApplicationStart);

                    FireApplicationOnStart(context);
                }

                _appOnStartCalled = true;
            }
        }
    }
}

private void FireApplicationOnStart(HttpContext context) {
    if (_onStartMethod != null) {
        HttpApplication app = GetSpecialApplicationInstance();

        app.ProcessSpecialRequest(
                                    context,
                                    _onStartMethod,
                                    _onStartParamCount,
                                    this, 
                                    EventArgs.Empty, 
                                    null);

        RecycleSpecialApplicationInstance(app);
    }
}
```

> 在處理完事件`Application_OnStart`呼叫`RecycleSpecialApplicationInstance`回收`HttpApplication`物件

## GetNormalApplicationInstance

方法中主要做.

1. 判斷`_freeList`集合中是否有可用`HttpApplication`物件(物件程序池中),如果沒有就利用`HttpRuntime.CreateNonPublicInstance(_theApplicationType)`透過反射建立一個新的`HttpApplication`返回(呼叫完`IHttpHandler.ProcessRequst`方法後會將這個物件存入`_freeList`中),最後將

```Csharp
private HttpApplication GetNormalApplicationInstance(HttpContext context) {
    HttpApplication app = null;

    if (!_freeList.TryTake(out app)) {
        // If ran out of instances, create a new one
        app = (HttpApplication)HttpRuntime.CreateNonPublicInstance(_theApplicationType);

        using (new ApplicationImpersonationContext()) {
            app.InitInternal(context, _state, _eventHandlerMethods);
        }
    }

    if (AppSettings.UseTaskFriendlySynchronizationContext) {
        // When this HttpApplication instance is no longer in use, recycle it.
        app.ApplicationInstanceConsumersCounter = new CountdownTask(1); // representing required call to HttpApplication.ReleaseAppInstance
        app.ApplicationInstanceConsumersCounter.Task.ContinueWith((_, o) => RecycleApplicationInstance((HttpApplication)o), app, TaskContinuationOptions.ExecuteSynchronously);
    }
    return app;
}
```

所以最終我們是返回一個`HttpApplication`物件來使用.

## 小結

今天我們學到

1. `IHttpHandler GetApplicationInstance(HttpContext context)`其實是返回一個`HttpApplication`物件.
2. 這個工廠會有一個 `_freeList` 集合來存取之前用過的`HttpApplication`物件,如果集合中沒有適合的`HttpApplication`物件就會使用反射返回一個新的`HttpApplication`並將他初始化．
3. 所以`HttpRuntime`呼叫的是`HttpApplication`物件的`ProcessRequest`方法

下篇會跟大家介紹`HttpApplication`類別成員詳細資訊
