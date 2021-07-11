---
title: 【C#】我們來土砲一個 Asp.net Session (Session核心原理)
date: 2019-05-27 21:16:07
tags: [C#,Asp.net,Session]
categories: [C#,SourceCode]
---

我們在寫網站一定會使用到 `Session`
今天就跟大家分享自製微型 `Asp.net Session`
> 分析Session->實作Session->使用Session

在實作之前您必須先了解甚麼是Session
網路上一大堆介紹Session文章在此我就不多介紹
或可以點進之前小弟的介紹文來簡單了解 [SessionID.cookie,Session傻傻分不清楚??](https://dotblogs.com.tw/daniel/2017/04/08/110915)

簡單說明：
Http協議是一個無狀態協議。

> 核心是 請求=>處理=>回應

每次請求都是獨立不會記住上一次做了甚麼
Session可以幫我們把資料存在Server記憶體，方便我們下次請求使用
上網連線眾多使用者，Server怎麼知道哪份資料,屬於哪個使用者的? 這就要依靠 **SessonID**
**SessionID**就像使用者的號碼牌，可以到Server拿相對應的資料

分析：

1. 使用者請求頁面時會攜帶該網域下Cookies。
2. Asp.net接收到並使用Key為SessionID的Cookie，使用Cookie的Value來SessionPool中查找屬於使用者的Session。
  如果是第一次請求或是沒有SessionID 會幫他產生一個新的並加入回應的Cookie中
3. 取得Session物件後就可以在程式中使用。

分析如下圖：

![](https://i.imgur.com/FUmkKyI.png)

我們作出幾個核心來完成模擬Session:

1. SessionPool來存放目前所有Session
2. SessionObject (支援快取在系統記憶體中)
   模擬HttpContext封裝Session

實作：
我要簡單呈現就選擇使用輕便 [泛型處理常式]

![](https://i.imgur.com/K6FlxMp.png)

**ApplicationContext** 模擬HttpContext封裝SessionPool
創建一個靜態的SessionPool物件，因為程式都共用此SessionPool

``` C#
/// <summary>
/// 請求上下文
/// </summary>
public class ApplicationContext
{
    /// <summary>
    /// 存在Cookie中的SessionID
    /// </summary>
    private readonly string MySessionID = "MySessionID";

    public HttpRequest Request { get; private set; }
    public HttpResponse Respone { get; private set; }

    public ApplicationContext(HttpContext context)
    {
        Respone = context.Response;
        Request = context.Request;
    }

    private static SessionPool _container = new SessionPool();

    public SessionObject Session
    {
        get
        {
            return GetSessionObj();
        }
    }

    /// <summary>
    /// 從SessionPool中取得Session對象
    /// </summary>
    /// <returns></returns>
    private SessionObject GetSessionObj()
    {
        Guid sessionGuid;
        HttpCookie CookieSessionID = Request.Cookies[MySessionID];
        //如果沒有MySessionID的cookie，做一個新的
        if (CookieSessionID == null)
        {
            sessionGuid = Guid.NewGuid();
            HttpCookie cookie = new HttpCookie(MySessionID, sessionGuid.ToString())
            {
                Expires = DateTime.Now.AddDays(60)
            };
            Respone.Cookies.Add(cookie);
        }
        else
        {
            sessionGuid = Guid.Parse(CookieSessionID.Value);
        }
        return _container[sessionGuid];
    }
}
```

**CacheDictionary** 負責快取

使用一個 Dictionary 來對Session存取物件設置快取

```c#
/// <summary>
/// 掌管物件存活時間的集合
/// </summary>
private readonly Dictionary<string, CancellationTokenSource> _expireContaner =
    new Dictionary<string, CancellationTokenSource>();
```

在Task.Delay可以讓物件存放在工作執行緒中 等Delay時間到就呼叫 ContinueWith 將物件消毀

```c#
/// <summary>
/// 設置快取對象
/// </summary>
/// <typeparam name="T"></typeparam>
/// <param name="key"></param>
/// <param name="create"></param>
/// <param name="expireIn"></param>
/// <returns></returns>
public T Set<T>(string key, Func<T> create, TimeSpan expireIn)
{
    //如果此Key被使用 將原本的內容移除
    if (_expireTasks.ContainsKey(key))
    {
        _expireTasks[key].Cancel();
        _expireTasks.Remove(key);
    }

    var expirationTokenSource = new CancellationTokenSource();
    var expirationToken = expirationTokenSource.Token;
    //物件快取
    Task.Delay(expireIn, expirationToken).ContinueWith(_ => Expire(key), expirationToken);

    _expireTasks[key] = expirationTokenSource;

    return (T)(this[key] = create());
}
```

**SeesionPool** 存放所有Session
取Session會判斷此Guid是否有對應的Session物件，沒有會幫她創建一個放在池子中

```c#
/// <summary>
/// 存放所有Session池子
/// </summary>
public class SessionPool
{
    private Dictionary<Guid, SessionObject> _SessionContain = new Dictionary<Guid, SessionObject>();

    public SessionObject this[Guid index]
    {
        get
        {
            SessionObject obj;
            if (_SessionContain.TryGetValue(index, out obj))
            {
                return obj;
            }
            else
            {
                obj = new SessionObject();
                _SessionContain.Add(index, obj);
            }
            return obj;
        }
    }
}
```

**SessionObject** 控制讀取時的值 (一般我們所使用的Session)

```c#
/// <summary>
/// Session物件
/// </summary>
public class SessionObject
{
    private CacheDictionary cache = new CacheDictionary();

    public object this[string index]
    {
        get
        {
            return GetObj(index);
        }
        set
        {
            SetCache(index, value);
        }
    }

    private void SetCache(string key, object value)
    {
        cache.Set(key, () => value);
    }

    private object GetObj(string key)
    {
        return cache.GetOrDefault(key, () => default(object));
    }
}
```

使用：

在建構子中創建一個 ApplicationContext 之後,即可Asp.net那樣來使用Session

```c#
private ApplicationContext app;

public SessionHanlder()

{
    app = new ApplicationContext(HttpContext.Current);
}

public void ProcessRequest(HttpContext context)
{
    if (null == app.Session["Time"])
    {
        app.Session["Time"] = $"Hello {DateTime.Now.ToString("yyyy-MM-dd hh-mm-ss")}";
    }
    context.Response.Write(app.Session["Time"]);
    context.Response.ContentType = "text/plain";
}
```

上面程式是簡單模擬Session核心作用的程式

但並未處理多執行緒並發讀寫...等等問題，所以建議別再實際專案中使用XD!!

專案使用 VS2015 [GitHub原始碼](https://github.com/isdaniel/OwnSession)