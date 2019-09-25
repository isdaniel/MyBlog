---
title: 反轉起來~透過IOC解析來執行依賴反轉 (第14天)
date: 2019-09-25 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---
# Agenda<!-- omit in toc -->
- [前言](#%e5%89%8d%e8%a8%80)
- [DefaultControllerActivator](#defaultcontrolleractivator)
- [BuildManagerViewEngine](#buildmanagerviewengine)
- [FilterProviderCollection](#filterprovidercollection)
- [Autofac對於MVC擴充解析器AutofacDependencyResolver](#autofac%e5%b0%8d%e6%96%bcmvc%e6%93%b4%e5%85%85%e8%a7%a3%e6%9e%90%e5%99%a8autofacdependencyresolver)
- [小結：](#%e5%b0%8f%e7%b5%90)

## 前言

前一篇介紹`Asp.net MVC`可透過`DependencyResolver.SetResolver`替換成`IOC`容器注入控制器物件.

要建立客製化的解析器可以實現`IDependencyResolver`介面並使用`DependencyResolver.SetResolver`替換`DefaultDependencyResolver`預設解析器

`DependencyResolver`,`Controller`和`ControllerFactory`的關係如下圖

![IOC_Asp.netMVC.png](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/13/IOC_Asp.netMVC.png)

本篇介紹`DependencyResolver`在`Asp.net MVC`中有哪些實際的應用.

> 我有做一個可以針對於[Asp.net MVC Debugger](https://github.com/isdaniel/Asp.net-MVC-Debuger)的專案，只要下中斷點就可輕易進入Asp.net MVC原始碼.

## DefaultControllerActivator

在`DefaultControllerFactory`建構子建立`DefaultControllerActivator`,而`DefaultControllerActivator`有一個`Create`方法使用他來建立`Controller`物件.

```csharp
internal DefaultControllerFactory(IControllerActivator controllerActivator, IResolver<IControllerActivator> activatorResolver, IDependencyResolver dependencyResolver)
{
    if (controllerActivator != null)
    {
        _controllerActivator = controllerActivator;
    }
    else
    {
        _activatorResolver = activatorResolver ?? new SingleServiceResolver<IControllerActivator>(
                                                        () => null,
                                                        new DefaultControllerActivator(dependencyResolver),
                                                        "DefaultControllerFactory constructor");
    }
}
```

`DefaultControllerActivator`類別幫助我們建立`Controller`物件透過`Create`方法.

```csharp
private class DefaultControllerActivator : IControllerActivator
{
    private Func<IDependencyResolver> _resolverThunk;

    public DefaultControllerActivator()
        : this(null)
    {
    }

    public DefaultControllerActivator(IDependencyResolver resolver)
    {
        if (resolver == null)
        {
            _resolverThunk = () => DependencyResolver.Current;
        }
        else
        {
            _resolverThunk = () => resolver;
        }
    }

    public IController Create(RequestContext requestContext, Type controllerType)
    {
        try
        {
            return (IController)(_resolverThunk().GetService(controllerType) ?? Activator.CreateInstance(controllerType));
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                String.Format(
                    CultureInfo.CurrentCulture,
                    MvcResources.DefaultControllerFactory_ErrorCreatingController,
                    controllerType),
                ex);
        }
    }
}
```

因為`DependencyResolver.Current`建構子傳入參數`IDependencyResolver resolver`一般是`NULL`，所以會使用`DependencyResolver.Current`解析器.

`Create`方法預設利用`DefaultDependencyResolver.GetService`創建物件(使用`Activator.CreateInstance()`)

## BuildManagerViewEngine

`BuildManagerViewEngine`類別的詳細介紹會在之後的`View`如何產生有更細節的資訊.

這邊是提一下哪邊有用到`IDependencyResolver`解析器.

```csharp
internal class DefaultViewPageActivator : IViewPageActivator
{
    private Func<IDependencyResolver> _resolverThunk;

    public DefaultViewPageActivator()
        : this(null)
    {
    }

    public DefaultViewPageActivator(IDependencyResolver resolver)
    {
        if (resolver == null)
        {
            _resolverThunk = () => DependencyResolver.Current;
        }
        else
        {
            _resolverThunk = () => resolver;
        }
    }

    public object Create(ControllerContext controllerContext, Type type)
    {
        try
        {
            return _resolverThunk().GetService(type) ?? Activator.CreateInstance(type);
        }
        catch (MissingMethodException exception)
        {
            // Ensure thrown exception contains the type name.  Might be down a few levels.
            MissingMethodException replacementException =
                TypeHelpers.EnsureDebuggableException(exception, type.FullName);
            if (replacementException != null)
            {
                throw replacementException;
            }

            throw;
        }
    }
}
```

一樣可以看到有一個`Create`方法.透過跟`DefaultControllerActivator`一樣的操作來使用`IDependencyResolver`解析器

預設使用`DependencyResolver.Current`

## FilterProviderCollection

可以透過`IOC`容器注入客製化`ProvideFilter`使用行為.

預設`ProvideFilter`有三個(詳細資訊會在之後分享)

* `GlobalFilterCollection`(在Global擴充)
* `ControllerInstanceFilterProvider`(`Controller`自行`Override`)
* `FilterAttributeFilterProvider`(提供`Attribute`註冊最常用)

[MVC Filters With Dependency Injection](http://hwyfwk.com/blog/2013/10/06/mvc-filters-with-dependency-injection/)文章有介紹如何使用

```csharp
internal IFilterProvider[] CombinedItems
{
    get
    {
        IFilterProvider[] combinedItems = _combinedItems;
        if (combinedItems == null)
        {
            combinedItems = MultiServiceResolver.GetCombined<IFilterProvider>(Items, _dependencyResolver);
            _combinedItems = combinedItems;
        }
        return combinedItems;
    }
}
```

## Autofac對於MVC擴充解析器AutofacDependencyResolver

上面有說如果要改變**MVC**使用解析器可以透過`DependencyResolver.SetResolver`方法傳入一個`IDependencyResolver`物件,Autofac對於使的是[AutofacDependencyResolver 原始碼](https://github.com/autofac/Autofac.Mvc/blob/develop/src/Autofac.Integration.Mvc/AutofacDependencyResolver.cs).

替換完成後MVC就會使用`AutofacDependencyResolver.GetService`取得物件.

這裡就不多敘述**Autofac**內部完成細節.

```csharp
public class AutofacDependencyResolver : IDependencyResolver
{
    private static Func<AutofacDependencyResolver> _resolverAccessor = DefaultResolverAccessor;

    private readonly Action<ContainerBuilder> _configurationAction;

    private readonly ILifetimeScope _container;

    private ILifetimeScopeProvider _lifetimeScopeProvider;

    public AutofacDependencyResolver(ILifetimeScope container)
    {
        if (container == null)
        {
            throw new ArgumentNullException(nameof(container));
        }

        this._container = container;
    }

    public AutofacDependencyResolver(ILifetimeScope container, Action<ContainerBuilder> configurationAction)
        : this(container)
    {
        if (configurationAction == null)
        {
            throw new ArgumentNullException(nameof(configurationAction));
        }

        this._configurationAction = configurationAction;
    }

    public AutofacDependencyResolver(ILifetimeScope container, ILifetimeScopeProvider lifetimeScopeProvider) :
        this(container)
    {
        if (lifetimeScopeProvider == null)
        {
            throw new ArgumentNullException(nameof(lifetimeScopeProvider));
        }

        this._lifetimeScopeProvider = lifetimeScopeProvider;
    }


    public AutofacDependencyResolver(ILifetimeScope container, ILifetimeScopeProvider lifetimeScopeProvider, Action<ContainerBuilder> configurationAction)
        : this(container, lifetimeScopeProvider)
    {
        if (configurationAction == null)
        {
            throw new ArgumentNullException(nameof(configurationAction));
        }

        this._configurationAction = configurationAction;
    }

    /// <summary>
    /// Gets the Autofac implementation of the dependency resolver.
    /// </summary>
    public static AutofacDependencyResolver Current
    {
        get
        {
            return _resolverAccessor();
        }
    }

    public ILifetimeScope ApplicationContainer
    {
        get { return this._container; }
    }

    public ILifetimeScope RequestLifetimeScope
    {
        get
        {
            if (this._lifetimeScopeProvider == null)
            {
                this._lifetimeScopeProvider = new RequestLifetimeScopeProvider(this._container);
            }
            return this._lifetimeScopeProvider.GetLifetimeScope(this._configurationAction);
        }
    }


    public static void SetAutofacDependencyResolverAccessor(Func<AutofacDependencyResolver> accessor)
    {
        if (accessor == null)
        {
            _resolverAccessor = DefaultResolverAccessor;
        }
        else
        {
            _resolverAccessor = accessor;
        }
    }

    public virtual object GetService(Type serviceType)
    {
        return this.RequestLifetimeScope.ResolveOptional(serviceType);
    }

    public virtual IEnumerable<object> GetServices(Type serviceType)
    {
        var enumerableServiceType = typeof(IEnumerable<>).MakeGenericType(serviceType);
        var instance = this.RequestLifetimeScope.Resolve(enumerableServiceType);
        return (IEnumerable<object>)instance;
    }

    private static AutofacDependencyResolver DefaultResolverAccessor()
    {
        var currentResolver = DependencyResolver.Current;
        var autofacResolver = currentResolver as AutofacDependencyResolver;
        if (autofacResolver != null)
        {
            return autofacResolver;
        }

        var targetType = currentResolver.GetType().GetField("__target");
        if (targetType != null && targetType.FieldType == typeof(AutofacDependencyResolver))
        {
            return (AutofacDependencyResolver)targetType.GetValue(currentResolver);
        }

        throw new InvalidOperationException(string.Format(
            CultureInfo.CurrentCulture,
            AutofacDependencyResolverResources.AutofacDependencyResolverNotFound,
                currentResolver.GetType().FullName, typeof(AutofacDependencyResolver).FullName));
    }
}

```


## 小結：

本篇挑了幾個有使用到`DependencyResolver`的使用點

在`DefaultControllerActivator`建立Controller會利用當前使用的解析器來幫我們達成(預設`DefaultDependencyResolver`)

如果我們不想要使用預設解析器也可自行替換自己的解析器(像Autofac第三方容器)來控制我們自己如何產生物件.

能看到`Asp.net MVC`在設計上運用許多小巧思可讓系統可以更好的擴充且不用到到原本的程式碼

這些設計技巧很值得我們還學習效法.