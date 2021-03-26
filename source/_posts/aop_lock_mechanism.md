---
title: AOP Lock Architecture
date: 2020-11-10 16:00:00
tags: [C#,IOC,Autofac,AOP,Lock]
categories: [C#,Lock]
---

## 前言:

在系統中多少會遇到某些交易間需要互斥(不然容易造成`DeadLock`).

在我們當前系統中有許多動作間需要互斥,不然會有DeadLock問題

藉由已經分析DeadLock Report後,我開始構思如何讓建立Lock可以變得更容易且好理解.

所以就建構出此Lock架構.

## 如何在此框架使用Lock機制

我們只需要做幾個步驟:

1. 在使用Lock類別上掛`LockerInterceptor`攔截器標籤.
2. 使用Lock方法上使用`LockAttribute`標籤`[Lock(LockKey = "Your lock Key")]`(`Key`屬性是必填的)
3. 設定Lock屬性.

> 目前寫法是針對單一Server Mutiple Thread來建立互斥Lock. 假如有遇到多台Servers需要建立互斥模式可以,參考Redis的`Redlock.Net`.

使用方法如下,這樣在多執行緒系統中`MethodA1`跟`MethodB_A`就不會有同時執行問題,這樣就可以造成這兩個動作互斥.

```csharp
[Intercept(typeof(LockerInterceptor))]
public class LockerContext : ILockerContext
{
    [Lock(Key = "A")]
    public virtual void MethodA1()
    {
        Thread.Sleep(5);
        Console.WriteLine($"{DateTime.Now:HH:mm:ss fff} MethodA1 Done");
        Thread.Sleep(5);
    }

    [Lock(Key = "A")]
    public virtual void MethodB_A()
    {
        Thread.Sleep(5);
        Console.WriteLine($"{DateTime.Now:HH:mm:ss fff} MethodB_A Done");
        Thread.Sleep(5);
    }
}
```

## 架構解說

我是使用[ReaderWriterLockSlim](https://docs.microsoft.com/en-us/dotnet/api/system.threading.readerwriterlockslim?view=netcore-3.1)

> 因為支援ReadLock不互斥,WriteLock互斥邏輯

![](https://i.imgur.com/kESEvl4.png)

我是如何讓使用者輸入`Key`來建立不同lock呢?

> 我是使用[ConcurrentDictionary](https://docs.microsoft.com/en-us/dotnet/api/system.collections.concurrent.concurrentdictionary-2?view=netcore-3.1)來處理此問題,每個`Key`都有不同`Lock`物件

### LockAttribute

`LockAttribute`有幾個屬性.

* `Key`:鎖名稱
* `Mode`:鎖的模式
  1.  `LockMode.XLock`:獨占鎖會排斥其他資源請求此鎖,須等待資源釋放.
  2.  `LockMode.Shared`:Shared lock之間不互斥.
* `Order`:因為支援多個`LockAttribute`,此屬性決定執行此方法前要求鎖順序

```csharp
[AttributeUsage(AttributeTargets.Method, AllowMultiple = true)]
public sealed class LockAttribute : Attribute
{
    public string Key { get; set; }

    public LockMode Mode { get; set; } = LockMode.XLock;

    public int Order { get; set; }
}
```
### LockerInterceptor

我們直接來`IInterceptor`物件最核心邏輯方法`Intercept(IInvocation invocation)`.

利用`GetCustomAttributes`取得方法上所有`LockAttribute`並在方法執行前要求拿到,所需要`Lock`資源才可以執行方法,最後在`finally`時釋放lock資源

```csharp
public void Intercept(IInvocation invocation)
{
    var methodName = invocation.Method.Name;
    var lockAttributes = invocation.Method.GetCustomAttributes(typeof(LockAttribute), true) as LockAttribute[];

    if (IsMarkLockLockAttribute(lockAttributes))
    {
        var lockProviders = GetLockProviders(lockAttributes);
        try
        {
            foreach (var lockProvider in lockProviders)
            {
                lockProvider.AddLock();
            }
            invocation.Proceed();
        }
        catch (Exception e)
        {
            _log.Exception("Something wrong!", e);
            throw e;
        }
        finally {
            foreach (var lockProvider in lockProviders)
            {
                lockProvider.ReleaseLock();
            }
            _log.Info($"{DateTime.Now:HH:mm:ss fff} {methodName} Release Lock");
        }
    }
    else
    {
        invocation.Proceed();
    }

}
```

## SampleCode

我利用Nunit寫一個簡單程式Print在console讓我們方便觀看結果.

* `MethodA`:Shared lock mode on key A
* `MethodA1`:X lock mode on key A
* `MethodB_A`:X lock mode on key A and B
* `MethodB`:X lock mode on key B

理論上`MethodB`只會對於`MethodB_A`互斥,`MethodB`並不會跟`MethodA`,`MethodA1`有互斥反應.

```csharp
[Intercept(typeof(LockerInterceptor))]
public class LockerContext : ILockerContext
{
    [Lock(Key = "A", Mode = LockMode.SharedLock)]
    public virtual void MethodA ()
    {
        Thread.Sleep(100);
        Console.WriteLine($"{DateTime.Now:HH:mm:ss fff} MethodA Done");
        Thread.Sleep(100);
    }

    [Lock(Key = "A")]
    public virtual void MethodA1()
    {
        Thread.Sleep(100);
        Console.WriteLine($"{DateTime.Now:HH:mm:ss fff} MethodA1 Done");
        Thread.Sleep(100);
    }

    [Lock(Key = "A")]
    [Lock(Key = "B")]
    public virtual void MethodB_A()
    {
        Thread.Sleep(100);
        Console.WriteLine($"{DateTime.Now:HH:mm:ss fff} MethodB_A Done");
        Thread.Sleep(100);
    }

    [Lock(Key = "B")]
    public virtual  void MethodB()
    {
        Thread.Sleep(100);
        Console.WriteLine($"{DateTime.Now:HH:mm:ss fff} MethodB Done");
        Thread.Sleep(100);
    }
}

public interface ILockerContext
{
    void MethodA();
    void MethodA1();

    void MethodB_A();

    void MethodB();
}

public class AutofacConfig
{
    public static IContainer Container { get; set; }

    public static void Register()
    {
        ContainerBuilder builder = new ContainerBuilder();
        builder.RegisterType<LockerInterceptor>().AsSelf();
        builder.RegisterType<LockerContext>().As<ILockerContext>().EnableClassInterceptors();
        builder.RegisterType<ConsoleProvider>().As<ISysLog>().SingleInstance();
        Container = builder.Build();
    }
}

[TestFixture]
public class LockerTest
{
    //You can use the following additional attributes as you write your tests:
    [OneTimeSetUp]
    public void OneTimeSetUp()
    {
        AutofacConfig.Register();
    }

    [Test]
    public void LockGroupTest()
    {
        var lockerContext= AutofacConfig.Container.Resolve<ILockerContext>();

        List<Task> taskList =new List<Task>();

        for (int i = 0; i < 10; i++)
        {
            taskList.Add(Task.Factory.StartNew(() => { lockerContext.MethodA(); }));
            taskList.Add(Task.Factory.StartNew(() => { lockerContext.MethodA1(); }));
            taskList.Add(Task.Factory.StartNew(() => { lockerContext.MethodB_A(); }));
            taskList.Add(Task.Factory.StartNew(() => { lockerContext.MethodB(); }));

        }

        Task.WaitAll(taskList.ToArray());

    }
}
```

**Result**

我們發現`MethodB_A`這個方法會對於,所有key是`A`,`B`方法互斥,`MethodA`則不會對於`MethodA`,`MethodB`互斥.

```message
14:26:59 815 MethodA1 Done
14:26:59 816 MethodB Done
14:26:59 919 MethodA1 Release Lock
14:26:59 920 MethodB Release Lock
14:27:00 020 MethodB Done
14:27:00 120 MethodB Release Lock
14:27:00 220 MethodB_A Done
14:27:00 320 MethodB_A Release Lock
14:27:00 420 MethodA1 Done
14:27:00 520 MethodA1 Release Lock
14:27:00 620 MethodB_A Done
14:27:00 720 MethodB_A Release Lock
14:27:00 820 MethodB Done
14:27:00 820 MethodA1 Done
14:27:00 920 MethodB Release Lock
14:27:00 920 MethodA1 Release Lock
14:27:01 020 MethodB_A Done
14:27:01 120 MethodB_A Release Lock
14:27:01 220 MethodB_A Done
14:27:01 320 MethodB_A Release Lock
14:27:01 420 MethodB Done
14:27:01 420 MethodA1 Done
14:27:01 520 MethodB Release Lock
14:27:01 520 MethodA1 Release Lock
14:27:01 620 MethodA Done
14:27:01 620 MethodA Done
14:27:01 620 MethodA Done
14:27:01 620 MethodA Done
14:27:01 620 MethodA Done
14:27:01 720 MethodA Release Lock
14:27:01 720 MethodA Release Lock
14:27:01 720 MethodA Release Lock
14:27:01 720 MethodA Release Lock
14:27:01 720 MethodA Release Lock
14:27:01 820 MethodB Done
14:27:01 920 MethodB Release Lock
14:27:02 020 MethodB Done
14:27:02 120 MethodB Release Lock
14:27:02 220 MethodB_A Done
14:27:02 320 MethodB_A Release Lock
14:27:02 420 MethodA1 Done
14:27:02 520 MethodA1 Release Lock
14:27:02 620 MethodB_A Done
14:27:02 720 MethodB_A Release Lock
14:27:02 820 MethodB_A Done
14:27:02 920 MethodB_A Release Lock
14:27:03 020 MethodA1 Done
14:27:03 020 MethodB Done
14:27:03 120 MethodA1 Release Lock
14:27:03 120 MethodB Release Lock
14:27:03 220 MethodA1 Done
14:27:03 220 MethodB Done
14:27:03 320 MethodA1 Release Lock
14:27:03 320 MethodB Release Lock
14:27:03 420 MethodB_A Done
14:27:03 520 MethodB_A Release Lock
14:27:03 620 MethodA1 Done
14:27:03 720 MethodA1 Release Lock
14:27:03 820 MethodB_A Done
14:27:03 920 MethodB_A Release Lock
14:27:04 020 MethodA1 Done
14:27:04 020 MethodB Done
14:27:04 120 MethodA1 Release Lock
14:27:04 120 MethodB Release Lock
14:27:04 220 MethodA Done
14:27:04 220 MethodA Done
14:27:04 220 MethodA Done
14:27:04 220 MethodA Done
14:27:04 320 MethodA Release Lock
14:27:04 320 MethodA Release Lock
14:27:04 320 MethodA Release Lock
14:27:04 320 MethodA Release Lock
14:27:04 420 MethodB Done
14:27:04 520 MethodB Release Lock
14:27:04 620 MethodB_A Done
14:27:04 720 MethodB_A Release Lock
14:27:04 820 MethodA1 Done
14:27:04 920 MethodA1 Release Lock
14:27:05 020 MethodA Done
14:27:05 120 MethodA Release Lock
```

## 小結

本篇主要想要介紹使用Lock機制.

利用[ReaderWriterLockSlim](https://docs.microsoft.com/en-us/dotnet/api/system.threading.readerwriterlockslim?view=netcore-3.1)就可以建立如DB lock,實在非常方便.

假如想要細部了解[Autofac + Interceptors(AOP) 動態代理](https://isdaniel.github.io/Autofac-AOP/)可以參考我之前寫文章,這裡我就不多敘述了.

[SourceCode LockService](https://github.com/isdaniel/ExtenionTool/tree/master/src/ExtensionTool/ThirdPartyExtension/LockService)
