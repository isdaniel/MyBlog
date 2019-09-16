---
title: Asp.Net重要物件HttpApplication(一) 初始化建立IHttpMoudule (第5天)
date: 2019-09-16 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---
# Agenda<!-- omit in toc -->
- [前言：](#%e5%89%8d%e8%a8%80)
- [初始化HttpApplication (InitInternal)](#%e5%88%9d%e5%a7%8b%e5%8c%96httpapplication-initinternal)
	- [InitModules](#initmodules)
- [管道模式 vs 經典模式](#%e7%ae%a1%e9%81%93%e6%a8%a1%e5%bc%8f-vs-%e7%b6%93%e5%85%b8%e6%a8%a1%e5%bc%8f)
- [取得執行HttpHandler物件](#%e5%8f%96%e5%be%97%e5%9f%b7%e8%a1%8chttphandler%e7%89%a9%e4%bb%b6)
- [小結](#%e5%b0%8f%e7%b5%90)

## 前言：

附上`Asp.net`執行請求流程圖.

![瀏覽器請求IIS流程](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/IIS_Asp.net_Process.png)

上一篇文章分享`HttpApplicationFactory.GetApplicationInstance`方法返回一個`HttpApplication`給`HttpRuntime`來呼叫使用.

今天開始介紹`HttpApplication`這個很重要的類別,它可謂是我們`Asp.net`中很複雜但重要的類別

`Global.cs`是繼承`HttpApplication`類別,但為什麼需要繼承這個類別呢? 讓我們繼續看下去.

> 查看原始碼好站 [Reference Source](https://referencesource.microsoft.com/)
> 此文的程式碼比較多我會在原始碼上邊上說明相對應編號方便大家觀看

## 初始化HttpApplication (InitInternal)

在`GetNormalApplicationInstance`返回一個`HttpApplication`物件前會呼叫`初始化HttpApplication.InitInternal`方法

這個方法主要做下面幾件事情

1. 初始化`HttpModule`，讀取`Host config`或`appconfig` 註冊的HttpMoudle,並調用Init方法，使用`AOP`編成方式註冊使用事件
2. 提供一個`Hock`給繼承`Application`物件來初始化設定使用
3. 判斷要走**管道模式**還是**經典模式**
4. 建置`Pipleline`流程
5. 建立許多實現`IExecutionStep`接口的物件並添加到目前`HttpApplication`物驗的`_execSteps`集合中.從這裡我們可以看到`HttpApplication`是以異步的方式處理請求

`HttpModule`是在`InitInternal`方法中被讀取執行.

> 我們可以透過 `HttpContext.ApplicationInstance.Modules` ，得知目前所有載入`HttpModule`.

下面是`InitInternal`原始碼(核心動作有寫中文註解)

```CSharp
internal void InitInternal(HttpContext context, HttpApplicationState state, MethodInfo[] handlers){
	// Remember state
	_state = state;

	PerfCounters.IncrementCounter(AppPerfCounter.PIPELINES);

	try {
		try {
			_initContext = context;
			_initContext.ApplicationInstance = this;

			context.ConfigurationPath = context.Request.ApplicationPathObject;

			using (new DisposableHttpContextWrapper(context)) {

				// 1.初始化HttpModule.
				if (HttpRuntime.UseIntegratedPipeline) {

					try {
						context.HideRequestResponse = true;
						_hideRequestResponse = true;
						InitIntegratedModules();
					}
					finally {
						context.HideRequestResponse = false;
						_hideRequestResponse = false;
					}
				}
				else {
					InitModules();
				}

				// Hookup event handlers via reflection
				if (handlers != null)
					HookupEventHandlersForApplicationAndModules(handlers);

				// Initialization of the derived class
				_context = context;
				if (HttpRuntime.UseIntegratedPipeline && _context != null) {
					_context.HideRequestResponse = true;
				}
				_hideRequestResponse = true;

				try {
					//2.提供一個Hock給繼承Application物件來初始化設定使用
					Init();
				}
				catch (Exception e) {
					RecordError(e);
				}
			}

			if (HttpRuntime.UseIntegratedPipeline && _context != null) {
				_context.HideRequestResponse = false;
			}
			_hideRequestResponse = false;
			_context = null;
			_resumeStepsWaitCallback= new WaitCallback(this.ResumeStepsWaitCallback);

			//3. 判斷要走管道模式還是經典模式
			if (HttpRuntime.UseIntegratedPipeline) {
				_stepManager = new PipelineStepManager(this);
			}
			else {
				_stepManager = new ApplicationStepManager(this);
			}

            //4. 建置Pipleline流程
			_stepManager.BuildSteps(_resumeStepsWaitCallback);
		}
		finally {
			_initInternalCompleted = true;

			// Reset config path
			context.ConfigurationPath = null;
			// don't hold on to the context
			_initContext.ApplicationInstance = null;
			_initContext = null;
		}
	}
	catch { // Protect against exception filters
		throw;
	}
}
```

### InitModules

這個方法讀取註冊的`HttpModule`並共同放在一起,在一起呼叫`InitModulesCommon`方法來呼叫所有Modules的`Init`方法

```Csharp
private void InitModules() {
	
	HttpModulesSection pconfig = RuntimeConfig.GetAppConfig().HttpModules;
	HttpModuleCollection moduleCollection = pconfig.CreateModules();
	HttpModuleCollection dynamicModules = CreateDynamicModules();
	moduleCollection.AppendCollection(dynamicModules);

	_moduleCollection = moduleCollection; 

	InitModulesCommon();
}

private void InitModulesCommon() {
	int n = _moduleCollection.Count;

	for (int i = 0; i < n; i++) {
		_currentModuleCollectionKey = _moduleCollection.GetKey(i);
		_moduleCollection[i].Init(this);
	}

	_currentModuleCollectionKey = null;
	InitAppLevelCulture();
}
```

> `_moduleCollection[i].Init(this);` 其中的`this`就是把`HttpApplication`物件本身傳入這也是為什麼我們繼承`IHttpMoudel`介面可以共同使用同一個`HttpApplication`物件

```Csharp
public interface IHttpModule
{

	void Init(HttpApplication context);

	void Dispose();
}
```

上面呼叫的就是`void Init(HttpApplication context)`方法.

> 如果要取得目前所註冊`HttpModule`可透過`HttpApplication.Modules`屬性

## 管道模式 vs 經典模式

下面兩張圖是**管道模式**和**經典模式**

**經典模式**

![經典模式](https://mytechnetknowhows.files.wordpress.com/2015/05/aspnet-integration-with-iis6-0.jpg)

**管道模式**

![管道模式](https://mytechnetknowhows.files.wordpress.com/2015/05/aspnet-integration-with-iis-7-integrated-mode.jpg)

[圖片來源](https://mytechnetknowhows.wordpress.com/2015/05/24/asp-net-and-iis-integration-iis-6-0-and-ii6-0-iis-7-0-iis-7-5-iis-8-0/)

除了執行流程不一樣跟一些差異外，他們最終還是為了要找到一個`HttpHandler`來執行.

## 取得執行HttpHandler物件

如果有認真看原始碼的小夥伴,會發現`HttpApplication`的`ProcessRequest`目前是**throw**一個錯誤.

那他是怎麼完成請求的呢?

```Csharp
void IHttpHandler.ProcessRequest(HttpContext context) {
	throw new HttpException(SR.GetString(SR.Sync_not_supported));
}
```

> 因為`HttpRunTime`是呼叫異步請求 `BeginProcessRequest` 方法.

這邊提一下 [啟動吧!Asp.Net IsapiRunTime & HttpRuntime](https://ithelp.ithome.com.tw/articles/10215221) 會先判斷`app`物件是否實現`IHttpAsyncHandler`.

`HttpApplication`有實現.所以優先執行異步請求.

```Csharp
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
```

## 小結

今天我們學到

1. `HttpApplication`去讀取所有註冊的`HttpModule`並呼叫他們的`Init`方法.
2. **經典模式**和**管道模式**除了執行流程不同最終目標還是找尋一個`HttpHandler`
3. `HttpRunTime`是呼叫異步請求

很多文章都會提到10幾個事件（`BeginRequest`, `EndRequest`.....等）

下篇會介紹`StepManager`如何建立管道和如何呼叫事件並找尋`HttpHandler`來執行.
