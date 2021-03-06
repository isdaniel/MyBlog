---
title: 提供ModelBing幾個重要功臣(Model) (第18天)
date: 2019-09-29 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---

# Agenda<!-- omit in toc -->
- [前言](#%e5%89%8d%e8%a8%80)
- [IModelBinder(DefaultModelBinder)](#imodelbinderdefaultmodelbinder)
	- [ModelBinders](#modelbinders)
	- [ModelBinderDictionary](#modelbinderdictionary)
- [IValueProvider 提供參數填值](#ivalueprovider-%e6%8f%90%e4%be%9b%e5%8f%83%e6%95%b8%e5%a1%ab%e5%80%bc)
	- [ValueProvider工廠集合(ValueProviderFactories)](#valueprovider%e5%b7%a5%e5%bb%a0%e9%9b%86%e5%90%88valueproviderfactories)
- [ValueProviderFactory](#valueproviderfactory)
	- [JsonValueProviderFactory](#jsonvalueproviderfactory)
- [取得IValueProvider](#%e5%8f%96%e5%be%97ivalueprovider)
	- [NameValueCollectionValueProvider](#namevaluecollectionvalueprovider)
- [小結：](#%e5%b0%8f%e7%b5%90)

## 前言

**MVC**的`Model-Binding`建立複雜物件(牽扯到複雜模型綁定.)

這篇會跟大家介紹**MVC**是如何把達成這個複雜的動作

> 我有做一個可以針對於[Asp.net MVC Debugger](https://github.com/isdaniel/Asp.net-MVC-Debuger)的專案，只要下中斷點就可輕易進入Asp.net MVC原始碼.

## IModelBinder(DefaultModelBinder)

`DefaultModelBinder`將Http請求傳來資料轉換為強型別物件,`DefaultModelBinder`是如何取得使用`Model`資料呢?

> 實現`IValueProvider`來處理。

### ModelBinders


`IModelBinder.BindModel`方法使用兩個參數

```csharp
public object BindModel(ControllerContext controllerContext, ModelBindingContext bindingContext)
```

1. `ControllerContext`:`Controller`資訊，
2. `ModelBindingContext`:當前參數綁定資訊

`BindModel`方法機於`Http`請求傳送資料進行`Model`綁定(對於`Action`方法使用參數),其中`ModelBindingContext`參數會提供綁定使用的重要物件成員.

> 關於`ModelBindingContext`建立我們會在後續部分進行的單獨介紹.

在`IModelBinder.BindModel`方法中主要透過兩個重要`internal`方法.

* `BindComplexModel`:複雜參數綁定
* `BindSimpleModel`:簡單參數綁定

下圖可以表示`SimpleModel`和`ComplexModel`

![BindSimpleModel](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/17/UML_Model.jpg)

> `ComplexModel`一個人可擁有多個房子,所以`Person`類別擁有`HouseCollection`引用.
取得使用`ModelBinder`機制。

取得`ModelBinder`會依照下面順序

1. 參數掛有`ModelBinderAttribute`標籤並將`BinderType`屬性指向一個繼承`IModelBinder`型別.
2. 參數掛有繼承`CustomModelBinderAttribute`類型
3. 透過`ModelBinderProviderCollection`(預設**MVC**沒有提供`ModelBinderProvider`)
4. 預設`DefaultModelBinder`

下面兩個使用`ModelBinder`都是`DefaultModelBinder`,但一個是使用第一點,另一個使用第四點.

```csharp
public ActionResult HttpModules(Person p)

public ActionResult HttpModules([ModelBinder(typeof(DefaultModelBinder))]Person p)
```

在`Global.cs`可透過`ModelBinders.Binders.Add`方法註冊綁定類型.

如下面程式碼.

```csharp
ModelBinders.Binders.Add(typeof(Arg),new FooModelBinder());
```

### ModelBinderDictionary

一般參數透過`DefaultModelBinder`來幫我們完成參數綁定.

但有些特別的資料需要透過`ModelBinderDictionary`取得使用`ModelBinder`,例如上傳檔案,我們可以使用`HttpPostedFileBase`來取得檔案資訊流.

那是因為在`ModelBinderDictionary`有註冊一個`HttpPostedFileBaseModelBinder`來幫我們做解析.

```csharp
private static ModelBinderDictionary CreateDefaultBinderDictionary()
{
    ModelBinderDictionary binders = new ModelBinderDictionary()
    {
        { typeof(HttpPostedFileBase), new HttpPostedFileBaseModelBinder() },
        { typeof(byte[]), new ByteArrayModelBinder() },
        { typeof(Binary), new LinqBinaryModelBinder() },
        { typeof(CancellationToken), new CancellationTokenModelBinder() }
    };
    return binders;
}
```

## IValueProvider 提供參數填值

`IValueProvider`介面有一個重要方法`GetValue`會返回`ValueProviderResult`物件對於`ValueProvider`參數封裝

```csharp
ValueProviderResult GetValue(string key)
```

### ValueProvider工廠集合(ValueProviderFactories)

在`ControllerBase`類別中有一個屬性`ValueProvider`設定參數填值動作

```csharp
public IValueProvider ValueProvider
{
    get
    {
        if (_valueProvider == null)
        {
            _valueProvider = ValueProviderFactories.Factories.GetValueProvider(ControllerContext);
        }
        return _valueProvider;
    }
    set { _valueProvider = value; }
}
```

**Http**傳送參數可能又多種模式(`Post Form`,`Query String`,`Ajax`....)

```csharp
public static class ValueProviderFactories
{
    private static readonly ValueProviderFactoryCollection _factories = new ValueProviderFactoryCollection()
    {
        new ChildActionValueProviderFactory(),
        new FormValueProviderFactory(),
        new JsonValueProviderFactory(),
        new RouteDataValueProviderFactory(),
        new QueryStringValueProviderFactory(),
        new HttpFileCollectionValueProviderFactory(),
    };

    public static ValueProviderFactoryCollection Factories
    {
        get { return _factories; }
    }
}
```

1. `ChildActionValueProviderFactory`：取得另一個呼叫`@Html.Action`傳來**Model**資料
2. `FormValueProviderFactory`：取得`HTTP POST`送來的資料
3. `JsonValueProviderFactory`：取得`JSON`資料(`Content-Type = application/json`)
4. `RouteDataValueProviderFactory`：取得從網址路徑取得到路由參數值
5. `QueryStringValueProviderFactory`：取得從`Http`請求的`Query String`資料
6. `HttpFileCollectionValueProviderFactory`：取得檔案上傳功能傳來檔案

如果此次請求匹配到多個`ValueProvider`機制會怎處理?

> 會按照上面`ProviderFactory`設定順序來排執行優先順序來填值

## ValueProviderFactory

**MVC**利用工廠模式透過`ValueProviderFactory`實現的工廠來`IValueProvider`填值提供者物件.

### JsonValueProviderFactory

在`ValueProviderFactory`IValueProvider GetValueProvider

```csharp
public sealed class JsonValueProviderFactory : ValueProviderFactory
{
	private static void AddToBackingStore(EntryLimitedDictionary backingStore, string prefix, object value)
	{
		IDictionary<string, object> d = value as IDictionary<string, object>;
		if (d != null)
		{
			foreach (KeyValuePair<string, object> entry in d)
			{
				AddToBackingStore(backingStore, MakePropertyKey(prefix, entry.Key), entry.Value);
			}
			return;
		}

		IList l = value as IList;
		if (l != null)
		{
			for (int i = 0; i < l.Count; i++)
			{
				AddToBackingStore(backingStore, MakeArrayKey(prefix, i), l[i]);
			}
			return;
		}

		// primitive
		backingStore.Add(prefix, value);
	}

	private static object GetDeserializedObject(ControllerContext controllerContext)
	{
		if (!controllerContext.HttpContext.Request.ContentType.StartsWith("application/json", StringComparison.OrdinalIgnoreCase))
		{
			// not JSON request
			return null;
		}

		StreamReader reader = new StreamReader(controllerContext.HttpContext.Request.InputStream);
		string bodyText = reader.ReadToEnd();
		if (String.IsNullOrEmpty(bodyText))
		{
			// no JSON data
			return null;
		}

		JavaScriptSerializer serializer = new JavaScriptSerializer();
		object jsonData = serializer.DeserializeObject(bodyText);
		return jsonData;
	}

	public override IValueProvider GetValueProvider(ControllerContext controllerContext)
	{
		if (controllerContext == null)
		{
			throw new ArgumentNullException("controllerContext");
		}

		object jsonData = GetDeserializedObject(controllerContext);
		if (jsonData == null)
		{
			return null;
		}

		Dictionary<string, object> backingStore = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
		EntryLimitedDictionary backingStoreWrapper = new EntryLimitedDictionary(backingStore);
		AddToBackingStore(backingStoreWrapper, String.Empty, jsonData);
		return new DictionaryValueProvider<object>(backingStore, CultureInfo.CurrentCulture);
	}
	//....
}
```

![UML_Model](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/17/ValueProvider_Factory.jpg)

## 取得IValueProvider

透過`ValueProviderFactory`返回相對應的`IValueProvider`物件.

下面介紹幾個實現`ValueProvider`物件

### NameValueCollectionValueProvider

`NameValueCollectionValueProvider`可從`NameValueCollection`集合取得參數.

因為`Request.Form`和`Request.QueryString`都是`NameValueCollection`類型集合.

>　這個方法很巧妙利用一個共同參數類型簽章來達成多態轉折點

```csharp
public virtual NameValueCollection Form
{
    get
    {
        //....
    }
}

public virtual NameValueCollection QueryString
{
    get
    {
        //....
    }
}
```

**Http**傳值到**Server**有許多方式,這裡介紹**MVC**利用哪個**ValueProvider**將`Form`跟`QueryString`填值到物件上,很巧妙使用`NameValueCollectionValueProvider`建構子參數`NameValueCollection`決定是要使用`Form`或`QueryString`填充值到參數.

```csharp
public sealed class FormValueProvider : NameValueCollectionValueProvider
{
	public FormValueProvider(ControllerContext controllerContext)
		: this(controllerContext, new UnvalidatedRequestValuesWrapper(controllerContext.HttpContext.Request.Unvalidated))
	{
	}

	internal FormValueProvider(ControllerContext controllerContext, IUnvalidatedRequestValues unvalidatedValues)
		: base(controllerContext.HttpContext.Request.Form, unvalidatedValues.Form, CultureInfo.CurrentCulture)
	{
	}
}

public sealed class QueryStringValueProvider : NameValueCollectionValueProvider
{

	public QueryStringValueProvider(ControllerContext controllerContext)
		: this(controllerContext, new UnvalidatedRequestValuesWrapper(controllerContext.HttpContext.Request.Unvalidated))
	{
	}

	internal QueryStringValueProvider(ControllerContext controllerContext, IUnvalidatedRequestValues unvalidatedValues)
		: base(controllerContext.HttpContext.Request.QueryString, unvalidatedValues.QueryString, CultureInfo.InvariantCulture)
	{
	}
}
```

實現`IValueProvider`物件主要會依靠`GetValue`方法取得`ValueProviderResult`.

```csharp
[Serializable]
public class ValueProviderResult
{
	private static readonly CultureInfo _staticCulture = CultureInfo.InvariantCulture;
	private CultureInfo _instanceCulture;

	protected ValueProviderResult()
	{
	}

	public ValueProviderResult(object rawValue, string attemptedValue, CultureInfo culture)
	{
		RawValue = rawValue;
		AttemptedValue = attemptedValue;
		Culture = culture;
	}

	public string AttemptedValue { get; protected set; }

	public CultureInfo Culture
	{
		get
		{
			if (_instanceCulture == null)
			{
				_instanceCulture = _staticCulture;
			}
			return _instanceCulture;
		}
		protected set { _instanceCulture = value; }
	}

	public object RawValue { get; protected set; }

	public object ConvertTo(Type type)
	{
		return ConvertTo(type, null /* culture */);
	}

	public virtual object ConvertTo(Type type, CultureInfo culture)
	{
		//....
	}
}
```

`ValueProviderResult`對於`ValueProvider`物件做封裝，一般存放`Http`參數擁有兩個只讀屬性

1. `RawValue`表示物件值
2. `AttemptedValue`主要用於顯示

`ValueProviderResult`提供兩個`ConvertTo`重載方法實現向指定目標類型轉換。

某些類型格式化依賴於相應的語言文化（比如時間、日期和貨幣等），這個語言文化通過`Culture`屬性來達成.

最終會呼叫一個`UnwrapPossibleArrayType`方法來建立物件

## 小結：

在`ControllerActionInvoker.GetParameterValue`取得參數方法,`ModelBing`動作有兩個重要的屬性

* `IValueProvider`:提供如何填值
* `IModelBinder`:建立物件(綁定關聯) 預設使用`DefaultModelBinder`類別.

目前分享的`IValueProvider`和`IModelBinder` UML類別關聯圖如下

![UML_Model](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/17/UML_Model.jpg)

下篇會介紹`ModelBind`模型綁定重點邏輯,有分簡單參數綁定和複雜參數綁定

* `BindComplexModel`
* `BindSimpleModel`
