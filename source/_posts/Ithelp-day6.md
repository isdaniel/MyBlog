---
title:  Asp.Net重要物件HttpApplication(二) 建置執行管道 (第6天)
date:  2019-09-17 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---
# Agenda<!-- omit in toc -->
- [前言](#%e5%89%8d%e8%a8%80)
- [ApplicationStepManager](#applicationstepmanager)
	- [BuildSteps 建置Pipleline流程](#buildsteps-%e5%bb%ba%e7%bd%aepipleline%e6%b5%81%e7%a8%8b)
	- [CreateEventExecutionSteps 載入事件](#createeventexecutionsteps-%e8%bc%89%e5%85%a5%e4%ba%8b%e4%bb%b6)
	- [HttpApplication事件集合](#httpapplication%e4%ba%8b%e4%bb%b6%e9%9b%86%e5%90%88)
	- [IExecutionStep介面](#iexecutionstep%e4%bb%8b%e9%9d%a2)
- [ResumeSteps方法呼叫IExecutionStep物件](#resumesteps%e6%96%b9%e6%b3%95%e5%91%bc%e5%8f%abiexecutionstep%e7%89%a9%e4%bb%b6)
	- [HttpApplication的ExecuteStep](#httpapplication%e7%9a%84executestep)
- [重要的兩個IExecutionStep](#%e9%87%8d%e8%a6%81%e7%9a%84%e5%85%a9%e5%80%8biexecutionstep)
- [小結：](#%e5%b0%8f%e7%b5%90)

## 前言

前面有提到`InitInternal`方法，是如何載入註冊`HttpModule`並呼叫`Init`方法，經典模式和管道模式比較.

> 查看原始碼好站 [Reference Source](https://referencesource.microsoft.com/)
> 此文的程式碼比較多我會在原始碼上邊上說明相對應編號方便大家觀看

今天跟大家介紹`StepManager`是如何建立管道和依序呼叫`IHttpModule`註冊事件

## ApplicationStepManager

這部分可說是`Asp.net`最核心部分，利用`Event`事件和`AOP`概念,讓`Asp.net`可以擁有高度的可擴展性.

### BuildSteps 建置Pipleline流程

`BuildSteps`最主要透過`CreateEventExecutionSteps`方法，把所有**Application**`event`註冊添加到`steps`集合中方便後面依照順序去呼叫使用.

> `steps` 最後把載入所有事件給 `_execSteps`

這裡就是我們熟知的管道事件介紹 [Asp.Net支柱 IHttpMoudle & IHttphandler](https://ithelp.ithome.com.tw/articles/10214999) 有介紹到

透過`BuildSteps`方法**step by step**把`Asp.net`執行事件依照順序註冊進去.

```CSharp
internal override void BuildSteps(WaitCallback stepCallback ) {
	ArrayList steps = new ArrayList();
	HttpApplication app = _application;
	steps.Add(new ValidateRequestExecutionStep(app));
	steps.Add(new ValidatePathExecutionStep(app));

	if (urlMappingsEnabled)
		steps.Add(new UrlMappingsExecutionStep(app)); 

	app.CreateEventExecutionSteps(HttpApplication.EventBeginRequest, steps);
	app.CreateEventExecutionSteps(HttpApplication.EventAuthenticateRequest, steps);
	app.CreateEventExecutionSteps(HttpApplication.EventDefaultAuthentication, steps);
	app.CreateEventExecutionSteps(HttpApplication.EventPostAuthenticateRequest, steps);
	app.CreateEventExecutionSteps(HttpApplication.EventAuthorizeRequest, steps);
	app.CreateEventExecutionSteps(HttpApplication.EventPostAuthorizeRequest, steps);
	app.CreateEventExecutionSteps(HttpApplication.EventResolveRequestCache, steps);
	app.CreateEventExecutionSteps(HttpApplication.EventPostResolveRequestCache, steps);
	steps.Add(new MapHandlerExecutionStep(app));     // map handler
	app.CreateEventExecutionSteps(HttpApplication.EventPostMapRequestHandler, steps);
	app.CreateEventExecutionSteps(HttpApplication.EventAcquireRequestState, steps);
	app.CreateEventExecutionSteps(HttpApplication.EventPostAcquireRequestState, steps);
	app.CreateEventExecutionSteps(HttpApplication.EventPreRequestHandlerExecute, steps);
	steps.Add(app.CreateImplicitAsyncPreloadExecutionStep()); // implict async preload step
	steps.Add(new CallHandlerExecutionStep(app));  // execute handler
	app.CreateEventExecutionSteps(HttpApplication.EventPostRequestHandlerExecute, steps);
	app.CreateEventExecutionSteps(HttpApplication.EventReleaseRequestState, steps);
	app.CreateEventExecutionSteps(HttpApplication.EventPostReleaseRequestState, steps);
	steps.Add(new CallFilterExecutionStep(app));  // filtering
	app.CreateEventExecutionSteps(HttpApplication.EventUpdateRequestCache, steps);
	app.CreateEventExecutionSteps(HttpApplication.EventPostUpdateRequestCache, steps);
	_endRequestStepIndex = steps.Count;
	app.CreateEventExecutionSteps(HttpApplication.EventEndRequest, steps);
	steps.Add(new NoopExecutionStep()); // the last is always there

	_execSteps = new IExecutionStep[steps.Count];
	steps.CopyTo(_execSteps);
}
```

> 如果在`Web.Config`設定`urlMappingsEnabled`就會實施`UrlMappingsModule.UrlMappingRewritePath`(UrlRerwite)
> `MapHandlerExecutionStep`：找尋匹配`HttpHandler`物件

### CreateEventExecutionSteps 載入事件

下面程式碼可以看到`CreateEventExecutionSteps`方法透過`eventIndex`去**事件集合**查找註冊事件,並把事件寫入`ArrayList steps`集合中.

```Csharp
private void CreateEventExecutionSteps(Object eventIndex, ArrayList steps) {
    // async
    AsyncAppEventHandler asyncHandler = AsyncEvents[eventIndex];

    if (asyncHandler != null) {
        asyncHandler.CreateExecutionSteps(this, steps);
    }

    // sync
    EventHandler handler = (EventHandler)Events[eventIndex];

    if (handler != null) {
        Delegate[] handlers = handler.GetInvocationList();

        for (int i = 0; i < handlers.Length; i++)  {
            steps.Add(new SyncEventExecutionStep(this, (EventHandler)handlers[i]));
        }
    }
}
```

為了建立管道最後可看到`steps.CopyTo(_execSteps);`把建立的管道`Step`複製到`_execSteps`集合中

```csharp
private IExecutionStep[] _execSteps;

internal override void BuildSteps(WaitCallback stepCallback ) {
    ArrayList steps = new ArrayList();
    //.....其他程式碼
    _execSteps = new IExecutionStep[steps.Count];
    steps.CopyTo(_execSteps);
}
```

> `steps`最後把所有註冊事件`Copy`到`ApplicationStepManager`的`private IExecutionStep[] _execSteps`集合中提供`ResumeSteps`方法呼叫使用.

### HttpApplication事件集合

這兩個欄位集合乘載我們註冊的`Asp.net`事件

* `EventHandlerList` 同步使用事件.
* `AsyncAppEventHandlersTable` 非同步使用事件.

```Csharp
private EventHandlerList _events;
protected EventHandlerList Events {
    get {
        if (_events == null) {
            _events = new EventHandlerList();
        }
        return _events;
    }
}


private AsyncAppEventHandlersTable _asyncEvents;
private AsyncAppEventHandlersTable AsyncEvents {
    get {
        if (_asyncEvents == null)
            _asyncEvents = new AsyncAppEventHandlersTable();
        return _asyncEvents;
    }
}
```

用其中一個事件舉例

`PostMapRequestHandler`提供擴充的事件註冊點，透過`AddSyncEventHookup`把事件加入集合中.

1. `object key`:此事件識別資訊(每個事件都有自己的Object),如`PostMapRequestHandler`事件傳入`EventPostMapRequestHandler`物件.
2. `Delegate handler`:使用者撰寫事件方法.
3. `RequestNotification notification`:屬於哪種分群.

```Csharp
public event EventHandler PostMapRequestHandler {
    add { AddSyncEventHookup(EventPostMapRequestHandler, value, RequestNotification.MapRequestHandler, true); }
    remove { RemoveSyncEventHookup(EventPostMapRequestHandler, value, RequestNotification.MapRequestHandler); }
}
```

> 其他10幾個事件使用方式大同小異,這裡就不一一介紹了

### IExecutionStep介面

`IExecutionStep`這個介面，裡面最重要的方法是`void Execute();`來執行注冊的事件方法.

```csharp
// interface to represent one execution step
internal interface IExecutionStep {
	void Execute();
	bool CompletedSynchronously { get;}
	bool IsCancellable { get; }
}
```

在`BuildSteps`方法中可以看到，全部事件轉成`IExecutionStep`介面放入`_execSteps`待被執行`IExecutionStep`集合列表.

> `_execSteps`是一個物件區域變數，提供`internal override void ResumeSteps(Exception error)`呼叫使用.

## ResumeSteps方法呼叫IExecutionStep物件

`ResumeSteps`這個方法做了許多事情,我下面只保留`ResumeSteps`方法如何去呼叫`IExecutionStep`物件的`Execute`方法

```csharp
private int _currentStepIndex;
 

[System.Diagnostics.DebuggerStepperBoundaryAttribute]
internal override void ResumeSteps(Exception error) {
	bool appCompleted = false;
	bool stepCompletedSynchronously = true;
	HttpApplication app = _application;
	CountdownTask appInstanceConsumersCounter = app.ApplicationInstanceConsumersCounter;
	HttpContext context = app.Context;
	ThreadContext threadContext = null;
	AspNetSynchronizationContextBase syncContext = context.SyncContext;
	
	try {
		using (syncContext.AcquireThreadLock()) {
			try {
				threadContext = app.OnThreadEnter();
			}
			catch (Exception e) {
				if (error == null)
					error = e;
			}

			try {
				try {
					for (; ; ) {
						// record error

						if (syncContext.Error != null) {
							error = syncContext.Error;
							syncContext.ClearError();
						}

						if (error != null) {
							app.RecordError(error);
							error = null;
						}

						// check for any outstanding async operations

						if (syncContext.PendingCompletion(_resumeStepsWaitCallback)) {
							// wait until all pending async operations complete
							break;
						}

						// advance to next step

						if (_currentStepIndex < _endRequestStepIndex && (context.Error != null || _requestCompleted)) {
							// end request
							context.Response.FilterOutput();
							_currentStepIndex = _endRequestStepIndex;
						}
						else {
							_currentStepIndex++;
						}

						if (_currentStepIndex >= _execSteps.Length) {
							appCompleted = true;
							break;
						}

						// execute the current step

						_numStepCalls++;          // count all calls

						// enable launching async operations before each new step
						syncContext.Enable();

						// call to execute current step catching thread abort exception
						error = app.ExecuteStep(_execSteps[_currentStepIndex], ref stepCompletedSynchronously);

						// unwind the stack in the async case
						if (!stepCompletedSynchronously)
							break;

						_numSyncStepCalls++;      // count synchronous calls
					}
				}
				finally {
					if (appCompleted) {
						// need to raise OnRequestCompleted while within the ThreadContext so that things like User, CurrentCulture, etc. are available
						context.RaiseOnRequestCompleted();
					}

					if (threadContext != null) {
						try {
							threadContext.DisassociateFromCurrentThread();
						}
						catch {
						}
					}
				}
			}
			catch { // Protect against exception filters
				throw;
			}

		}   // using

		if (appCompleted) {

			context.RaiseOnPipelineCompleted();

			context.Unroot();

			app.AsyncResult.Complete((_numStepCalls == _numSyncStepCalls), null, null);
			app.ReleaseAppInstance();
		}
	}
	finally {
		if (appInstanceConsumersCounter != null) {
			appInstanceConsumersCounter.MarkOperationCompleted(); // ResumeSteps call complete
		}
	}
}
```

上面程式碼最核心的片段在

```csharp
if (_currentStepIndex < _endRequestStepIndex && (context.Error != null || _requestCompleted)) {

    context.Response.FilterOutput();
    _currentStepIndex = _endRequestStepIndex;
}
else {
    _currentStepIndex++;
}

if (_currentStepIndex >= _execSteps.Length) {
    appCompleted = true;
    break;
}

// execute the current step
_numStepCalls++;         
// enable launching async operations before each new step
syncContext.Enable();
// call to execute current step catching thread abort exception
error = app.ExecuteStep(_execSteps[_currentStepIndex], ref stepCompletedSynchronously);
```

1. `_currentStepIndex`這個欄位表示取得當前需要跑事件`Index`(從之前`IExecutionStep[]`集合取得),每次執完都會`_currentStepIndex++` 
2. 有一個無限迴圈`for (; ; )`一直在跑除非兩種情況才會終止迴圈.
   1. `_currentStepIndex >= _execSteps.Length`代表全部事件都跑完了.
   2. 判斷`context.Error != null`執行得過程是否有出錯,如果有就終止繼續執行.
3. 透過`HttpApplication.ExecuteStep`方法執行前面註冊的事件
4. `bool appCompleted`來判斷目前是否執行完全部事件.
5. 只要還有事件就呼叫`ExecuteStep`,把當前事件傳入(`_execSteps[_currentStepIndex]`)

### HttpApplication的ExecuteStep

這邊蠻有趣一件事情是`ExecuteStep`方法回傳一個`Exception`物件當作這次執行成功或失敗,而`ExecuteStep`執行過程是主要是呼叫`ExecuteStepImpl`方法來呼叫`step.Execute();`

```csharp
internal Exception ExecuteStep(IExecutionStep step, ref bool completedSynchronously) {
    Exception error = null;

    try {
        try {
            if (step.IsCancellable) {
                _context.BeginCancellablePeriod();  // request can be cancelled from this point

                try {
                    ExecuteStepImpl(step);
                }
                finally {
                    _context.EndCancellablePeriod();  // request can be cancelled until this point
                }

                _context.WaitForExceptionIfCancelled();  // wait outside of finally
            }
            else {
                ExecuteStepImpl(step);
            }

            if (!step.CompletedSynchronously) {
                completedSynchronously = false;
                return null;
            }
        }
        catch (Exception e) {
            error = e;
            if (e is ThreadAbortException &&
                ((Thread.CurrentThread.ThreadState & ThreadState.AbortRequested) == 0))  {
                error = null;
                _stepManager.CompleteRequest();
            }
        }
    }
    catch (ThreadAbortException e) {
        if (e.ExceptionState != null && e.ExceptionState is CancelModuleException) {
            CancelModuleException cancelException = (CancelModuleException)e.ExceptionState;

            if (cancelException.Timeout) {
                // Timed out
                error = new HttpException(SR.GetString(SR.Request_timed_out),
                                    null, WebEventCodes.RuntimeErrorRequestAbort);
                PerfCounters.IncrementCounter(AppPerfCounter.REQUESTS_TIMED_OUT);
            }
            else {
                // Response.End
                error = null;
                _stepManager.CompleteRequest();
            }

            Thread.ResetAbort();
        }
    }

    completedSynchronously = true;
    return error;
}

private void ExecuteStepImpl(IExecutionStep step) {
    if(_stepInvoker != null) {
        bool stepCalled = false;

        _stepInvoker.Invoke(() => {
            if (!stepCalled) {
                stepCalled = true;
                step.Execute();
            }
        });

        if (!stepCalled) {
            step.Execute();
        }
    } else {
        step.Execute();
    }
}
```

## 重要的兩個IExecutionStep

* `MapHandlerExecutionStep`:透過`HttpApplication.MapHttpHandler`方法取得使用`HttpHandler`(透過`IHttpHandlerFactory`和XML註冊表來完成)
* `CallHandlerExecutionStep`:取得使用`HttpHandler`依照非同步或同步`HttpHandler`執行相對應呼叫(先判斷是否非同步)

## 小結：

今天我們了解到

1. `Appliaction`管道是如何被建立(透過`BuildSteps`方法)依照`Asp.net`順序註冊事件
2. 所有事件被封裝到繼承`IExecutionStep`物件中
3. 透過呼叫`ResumeSteps`方法來依序執行註冊事件.

下篇會跟大家詳細分享重要的兩個`IExecutionStep`物件

* `MapHandlerExecutionStep`
* `CallHandlerExecutionStep`

微軟管道設計(透過事件)讓程式開發人員提供高擴展設計方式(`AOP`編成),值得讓我們思考且學習.
