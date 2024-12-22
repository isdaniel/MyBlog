---
title: Autofac + Interceptors(AOP) 動態代理
date: 2019-06-02 22:30:11
tags: [C#,IOC,Autofac,AOP]
categories: [C#,IOC]
---

Autofac 是個IOC容器  不懂IOC 參考 我之前寫
的{% post_link ioc-di %}

小弟之前有一個開源框架{% post_link awesomeproxy-net %} 裡面簡單介紹 AOP核心概念和如何實作!

Autofac 有寫一個 [Autofac.Extras.DynamicProxy](https://github.com/autofac/Autofac.Extras.DynamicProxy) 把AOP和IOC容器融合的框架


在Autofac使用AOP 需要實現下面幾個步驟

本次範例我們從資料庫中撈取時間資料出來，並使用`Thread.Sleep(5000) `作出延遲，判斷時間是否前後一致。

## 第一步（定義攔截器）：

我們撰寫一個快取的攔截器繼承`IInterceptor` 介面，並實現`Intercep`方法

其中 `IInvocation `參數有許多有用的資料

*   Arguments：傳入方法中的參數
*   InvocationTarget ：被代理物件
*   MethodInvocationTarget：被代理物件的呼叫方法資訊
*   Proxy：代理物件
*   Method：代理的呼叫方法資訊
*   ReturnValue：呼叫方法的回傳值

這幾個欄位是我們比較常用的資訊

    public class TimeInterceptor : IInterceptor
    {
        private ITimeService _timeService;
        public TimeInterceptor(ITimeService s)
        {

            _timeService = s;
        }

        public void Intercept(IInvocation invocation)
        {
            var time = CallContext.GetData("time")?.ToString();
            if (time == null)
            {
                //如果沒有快取 執行呼叫Service
                invocation.Proceed();
                CallContext.SetData("time", invocation.ReturnValue);
            }
            else
            {
                //如果有快取直接取值
                invocation.ReturnValue = time;
            }
        }
    }

他使用到 `TimeService` 模擬從資料庫中撈取資料出來

    public interface ITimeService
    {
        string GetTime();
    }

    public class TimeService : ITimeService
    {
        public string GetTime()
        {
            return DateTime.Now.ToString("MM/dd/yyyy hh:mm:ss");
        }
    }

## 第二步（標記攔截器）： 

使用`Intercept`標籤並帶入要攔截類別型態．

    [Intercept(typeof(TimeInterceptor))]
    public class Person : IPerson
    {
        public string SaySomething()
        {
            return DateTime.Now.ToLongTimeString();
        }
    }

    public interface IPerson
    {
        string SaySomething();
    }

## 第三步（註冊攔截器到容器中）：

這邊有兩個小細節

1.  如果是註冊介面使用`EnableInterfaceInterceptors`，註冊一般類別使用`EnableClassInterceptors`
2.  註冊攔截器入容器

因為這個範例使用``所以我們要呼叫`EnableInterfaceInterceptors`

    var builder = new ContainerBuilder();

    builder.RegisterType<TimeInterceptor>(); //註冊攔截器

    builder.RegisterType<Person>()
            .As<IPerson>()
            .EnableInterfaceInterceptors();

    //註冊時間Service
    builder.RegisterType<TimeService>().As<ITimeService>();

    return builder.Build();

 [原始碼連結](https://github.com/isdaniel/IOC_Sample/tree/master/src/AutofacWihtAOP)

## 小結

<span style="color:#FFD700;">Autofac + DynamicProxy </span>有一個很大優勢，是可以把要注入的抽象動作一起注入攔截器中

例如本次範例我們將`ITimeService`使用建構子注入法，注入至`TimeInterceptor`攔截器中

讓系統和寫法擁有更多更多的彈性
