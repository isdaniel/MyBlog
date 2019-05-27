---
title: 【財政部查詢類電子發票API】框架解說 C#
date: 2019-05-27 22:59:51
tags: [Open-Source,C#,Asp.net,OOP,Design-Pattern]
---

小弟之前有分享過串接【財政部查詢類電子發票API】小框架使用文

使用文連結 [快速使用財政部電子發票API 使用 C#](https://ithelp.ithome.com.tw/articles/10183904)
串接文件下載 [電子發票查詢API 1.4.4](https://www.einvoice.nat.gov.tw/home/DownLoad?fileName=1476855387455_0.4.4.pdf)
[程式原始碼連結](https://github.com/isdaniel/ElectronicInvoice_TW)

這次想跟大家分享我做出此框架的歷程..

-----

框架目的：希望可以做出方便日後維護擴展的API。

串接API時發現他們有幾個共同之處
1. API請求參數名稱需降冪排列
2. 請求參數最後會加上簽章
3. 都有時間戳記
4. 回應資料格式都是Json
5. 都是使用Http (Get or Post) 


我就想到可以使用 **工廠模式來實作這系列產品** (工廠模式主要是切割產品的使用和生產)


## 產品解說

因為他們都有共同的能力**傳入一組參數回傳一串Json **
我就先寫出一個API共同的介面簽章  `IApiRunner `
這個介面為基礎來撰寫後面的程式碼

``` c#
/// <summary>
/// 執行api的介面
/// </summary>
public interface IApiRunner
{
    /// <summary>
    /// 執行api
    /// </summary>
    /// <param name="model">傳入的參數</param>
    /// <returns>回傳資料</returns>
    string ExcuteApi(object model);
}
```

我在中間多一個抽象泛型類別 ApiBase<T> (用泛型是為了給子類決定傳入參數的Model)
原因:
1. 中間使用泛型抽象類別讓子類決定要傳入哪組參數
2. 可以將一些共通的方法寫在裡面
3. 子類別只需要知道要提供哪些動作，所以在ApiBase中提供兩個方法來override
   * 請求URL   目前預設讀取Config (GetApiURL)
   * 參數的組合 (SetParamter)

``` c#
/// <summary>
/// 子類繼承提供參數
/// </summary>
/// <returns></returns>
protected abstract string SetParamter(T model);

/// <summary>
/// 取得api的Url路徑
/// </summary>
/// <returns></returns>
protected virtual string GetApiURL()
{
    string apiname = this.GetType().Name;
    if (!ConfigurationManager.AppSettings.AllKeys.Contains(apiname))
    {
        throw new Exception(string.Format("請確認Config的appsetting有無此參數 {0}",
            apiname));
    }
    return ConfigurationManager.AppSettings[apiname];
}

/// <summary>
/// 執行Api
/// </summary>
/// <param name="model"></param>
/// <returns></returns>
public virtual string ExcuteApi(object model)
{
    //建立所需參數
    string result = string.Empty;
    string postData = string.Empty;
    string posturl = GetApiURL();

    var data = ObjectToModel(model);

    //取得加密後的參數
    postData = GetInvoiceParamter(SetParamter(data));

    try
    {
        ServicePointManager.ServerCertificateValidationCallback
            = HttpTool.ValidateServerCertificate;
        result = HttpTool.HttpPost(posturl, postData);
    }
    catch (Exception ex)
    {
        result = GetSysErrorMsg();
    }

    return result;
}
```


目前產品部分已經建構好了。

## 工廠解說

工廠部分這次我選擇使用【反射方式來實現工廠】

工廠類別 `MoblieInvoiceApiFactroy` 其實最主要是使用GetInstance方法
``` c#

/// <summary>
/// 提供api的工廠
/// Model和Api命名要相關
/// 例如:testModel 對 testApi
/// </summary>
/// <param name="model">Model參數</param>
/// <returns></returns>
public static IApiRunner GetInstace(object model)
{
    if (model == null) throw new ArgumentNullException("不能傳空的參數");

    string modelName = model.GetType().Name;
    return (IApiRunner)Activator.CreateInstance
        (GetInstanceType(model), null);
}
```

其中我把決定使用哪個組API的決定權交給Model並寫在標籤上(Attirbute)
在執行時他可獲取此參數Model所註冊參數的型別，來動態產生產品

``` c#
/// <summary>
/// 反射取得綁定Model上綁定的API型別
/// </summary>
/// <param name="model"></param>
/// <returns></returns>
public static Type GetInstanceType(object model)
{
    var modelType = model.GetType();
    var attr = modelType.GetCustomAttribute(typeof(ApiTypeAttribute)) as ApiTypeAttribute;
    if (attr != null)
    {
        return GetApiType(attr);
    }
    throw new Exception("Model尚未賦予ApiTypeAttribute");
}
```

EX:查詢中獎號碼API Model 可以很清楚知道這個Model隸屬於哪個API 

``` c#
[ApiType(ApiType = typeof(QryWinningListApi), MockApiType = typeof(QryWinningListMockApi))]
public class QryWinningListModel
{
    public string invTerm { get; set; }
}
```

值得一提的是它有多一個MockApiType 為什麼會有這個?
原因：如果財政部伺服器連不到我們可以改成假資料或是模擬資料(讀取資料庫或是其他方式)。

以上就是此框架的解說


外部只需要呼叫工廠的GetInstance方法並傳入參數Model就會回傳相對應的產品API類別
這樣就降低執行和產生產品的耦合度，因為外部不是直接強耦合於Api類別而是透過工廠
日後如需增加API產品只需擴展新的類別 **符合OCP(開放封閉原則)**
已經達到目的：希望可以做出方便日後維護擴展的API。



Ps:這次我除了使用 **工廠模式,也有用到樣板模式,代理模式** 剩下兩個模式讓大家來找看看吧^^

> 一般來說很少只用一個模式就可以解決一個問題的，通常都是配合使用
