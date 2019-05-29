---
title: Asp.net使用快取 (二)
date: 2019-05-27 14:52:47
tags: [C#,Asp.net,cache]
---

{% post_link cache-asp-net-1 %}

向大家簡單介紹

1. 快取是什麼
2. 為何要使用快取
3. 使用簡單`HttpRuntime.Cache`使用快取機制

這篇是分享把快取程式碼變得更有彈性

-----

## 第二篇大綱

1. 提出介面,提高可替換性
2. 使用泛型改寫快取 讀取方式
3. 使用擴充方法改寫快取

-----

### 提出介面,提高可替換性

情境:

目前有個專案使用 `HttpRuntime.Cache` 物件

在記憶體快取中除了使用 Asp.Net 中`HttpRuntime.Cache`類別外還有很多解決方案.例如使用**Memcache**,**Redis**...

如果我們原本使用`HttpRuntime.Cache`類別但之後要轉成其他快取方式怎麼辦?

```c#
public class HomeController : Controller
{
	System.Web.Caching.Cache cacheContainer = HttpRuntime.Cache;

	public ActionResult Index()
	{

		string cacheData = cacheContainer.Get("data") as string;

		if (cacheData==null)
		{
			cacheContainer.Insert("test1", DateTime.Now.ToShortDateString());
		}
  
		return View(cacheData);
	}
}
```

雖然使用不同快取方式,但記得我上篇的重點**快取會有兩個動作,讀和寫**,所以最基本就會有讀和寫這兩個**動作**

OOP有個很重要的觀念 **多個類有重複動作考慮提出父類別**

為了方便了解我把`HttpRuntime.Cache`封裝成一個類別

``` c#
public class NetCache {
    System.Web.Caching.Cache cacheContainer = HttpRuntime.Cache;
    public object GetCacheObject(string key) {
        return cacheContainer.Get(key);
    }

    public void SetCache(string key,object obj) {
        cacheContainer.Insert(key, obj);
    }
}
```


這邊有另一個`Memcache`快取Class

```c#
public class MemeryCache {
	private ObjectCache _cache = MemoryCache.Default;
	public object GetCacheObject(string key)
	{
		return _cache[cacheKey];
	}

	public void SetCache(string key, object obj)
	{
		var policy = new CacheItemPolicy();
		policy.RemovedCallback = OnFileContentsCacheRemove;
		// 設定快取時間2分鐘
		policy.AbsoluteExpiration = DateTimeOffset.Now.Minute(2);
		_cache.Set(cacheKey, fileContents, policy);
	}
}
```

先不關注這兩個物件裡面細節,我們可以發現他們都有 `GetCacheObject` 方法和`SetCache` 方法

這時我們就可以適時提出**介面(interface)**,當作這兩個類別的合約

```c#
public interface ICache {

	void Set(string key,object obj);

	object Get(string key);
}
```

之後將他們兩個類別實現 `ICache` 介面

```c#
public class MemeryCache : ICache
{
	private ObjectCache _cache = MemoryCache.Default;
	public object Get(string key)
	{
		return _cache[cacheKey];
	}

	public void Set(string key, object obj)
	{
		var policy = new CacheItemPolicy();
		policy.RemovedCallback = OnFileContentsCacheRemove;
		// 設定快取時間2分鐘
		policy.AbsoluteExpiration = DateTimeOffset.Now.Minute(2);
		_cache.Set(cacheKey, fileContents, policy);
	}
}

public class NetCache : ICache
{
    System.Web.Caching.Cache cacheContainer = HttpRuntime.Cache;
    public object Get(string key) {
        return cacheContainer.Get(key);
    }
    
    public void Set(string key,object obj) {
        cacheContainer.Insert(key, obj);
    }
}
```

提出介面有甚麼好處?

我們可以把前面程式碼改成**IOC依賴注入**的方式,不要在程式碼寫死使用`HttpRuntime.Cache`,由IOC容器幫我們把物件注入程式碼中.

Note:我使用建構子注入法

```c#
public class HomeController : Controller
{
    //不用寫死使用  HttpRuntime.Cache
	//System.Web.Caching.Cache cacheContainer = HttpRuntime.Cache;
    ICache cacheContainer;
    public HomeController(ICache Container){
        cacheContainer = Container;
    }
    
	public ActionResult Index()
	{

		string cacheData = cacheContainer.Get("data") as string;

		if (cacheData==null)
		{
			cacheContainer.Insert("test1", DateTime.Now.ToShortDateString());
		}
  
		return View(cacheData);
	}
}
```

`ICache` 變成快取程式碼的潤滑劑.可讓程式變得更有彈性


-----


### 使用泛型改寫快取 讀取方式

我在[StackOverFlow解答](https://stackoverflow.com/questions/51160978/sql-server-data-caching-in-asp-net/51161277#51161277)的方式就是第二種

其中最主要的技巧就是把`Get`方法返回的`Object`改成使用泛型

```c#
 public T GetOrSetCache<T>
    (string key,T obj, int cacheTime) where T:class,new()
{
    System.Web.Caching.Cache cacheContainer = HttpRuntime.Cache;
    T cacheObj = cacheContainer.Get(key) as T;

    if (cacheObj == null)
    {
        cacheContainer.Insert(key,
            obj,
            null, 
            DateTime.Now.AddMinutes(cacheTime),
            System.Web.Caching.Cache.NoSlidingExpiration);
        cacheObj = obj;
    }

    return cacheObj;
}
```

讓我們在使用時可以變成

```c#
var data = DateTime.Now.ToShortDateString();
int numberOfMinutes = 3;
data = GetOrSetCache("name1",data,numberOfMinutes );
```

我們只需要呼叫`GetOrSetCache`方法,這個方法把`GetCache`和`SetCache`封裝起來了

-----

### 使用擴充方法改寫快取

.Net有提供一個很方便的機制 **擴充方法**,這個機制幫我們解決一個很重要的問題.
我們可以**擴充已經封裝但沒有原始碼的類別**,

在這段程式碼中,使用`Func<TObj>` 可以使用`lambda` 表達式,讓程式碼更簡潔有力!!

```c#
public static TObj GetOrSetCache<TObj>(this Func<TObj> selector, string key, int cacheTime)    where TObj : class
{ 
	Cache cacheContainer = HttpRuntime.Cache;
	//get cache Object
	var obj = cacheContainer.Get(key) as TObj;

	//if there isn't cache object add this object to cache
	if (obj == null)
	{
		obj = selector();
		cacheContainer.Insert(key, obj);
	}

	return obj;
}
```

我們使用時如下

變更簡潔動作更漂亮

```c#
int numberOfMinutes = 3;
data = GetOrSetCache(()=> DateTime.Now.ToShortDateString(),"name1",data,numberOfMinutes );
```



-----

同場加映:

擴展方法和介面搭配使用

```C#

public class WebDefaultCache : ICache
{
	Cache cacheContainer = HttpRuntime.Cache;
	public object Get(string key)
	{
		return cacheContainer.Get(key);
	}

	public void Set(string key, object obj)
	{
		cacheContainer.Insert(key, obj);
	}
}
public interface ICache{
	void Set(string key, object obj);

	object Get(string key);
}

public static class InfrastructureExtension
{
	public static TObj GetOrSetCache<TObj>(this Func<TObj> selector, string key) where TObj : class {
		return GetOrSetCache(selector, key,10);
	}

	public static TObj GetOrSetCache<TObj>(this Func<TObj> selector, string key, int cacheTime) where TObj : class
	{
		return GetOrSetCache(selector, key, cacheTime, new WebDefaultCache());
	}

	public static TObj GetOrSetCache<TObj>(this Func<TObj> selector, string key, int cacheTime, ICache cacheContainer) where TObj : class
	{
		//get cache Object
		var obj = cacheContainer.Get(key) as TObj;

		//if there isn't cache object add this object to cache
		if (obj == null)
		{
			obj = selector();
			cacheContainer.Set(key, obj);
		}

		return obj;
	}
}
```

雖然在使用上和第三種一樣
但我們多了使用**方法重載**多傳一個參數`ICache`介面 可以讓我們在寫程式時決定要使用哪種cache方式,不用改快去那邊程式碼.

同場加映[程式碼](https://github.com/isdaniel/ExtenionTool)我放在我自己常用的**ExtenionTool**專案中
