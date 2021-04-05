---
title:  探討Model上客製化標籤如何被解析使用 (第20天)
date: 2019-10-01 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---

# Agenda<!-- omit in toc -->
- [前言](#%e5%89%8d%e8%a8%80)
- [IMetadataAware介面](#imetadataaware%e4%bb%8b%e9%9d%a2)
  - [AllowHtmlAttribute標籤](#allowhtmlattribute%e6%a8%99%e7%b1%a4)
  - [為何可以透過實現IMetadataAware介面來擴充對於metadata操作](#%e7%82%ba%e4%bd%95%e5%8f%af%e4%bb%a5%e9%80%8f%e9%81%8e%e5%af%a6%e7%8f%beimetadataaware%e4%bb%8b%e9%9d%a2%e4%be%86%e6%93%b4%e5%85%85%e5%b0%8d%e6%96%bcmetadata%e6%93%8d%e4%bd%9c)
- [CachedDataAnnotationsModelMetadataProvider](#cacheddataannotationsmodelmetadataprovider)
  - [CachedDataAnnotationsModelMetadata](#cacheddataannotationsmodelmetadata)
  - [CachedDataAnnotationsMetadataAttributes](#cacheddataannotationsmetadataattributes)
- [小結：](#%e5%b0%8f%e7%b5%90)

## 前言

上一篇有介紹`ModelMetadata`和參數`Model`之間的關係.

![UML_Model](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/18/metadata_uml.png)

**MVC**提供我們一個`IMetadataAware`介面,讓我們可以對最終生成`ModelMetadata`進行自由設定.

## IMetadataAware介面

在`IMetadataAware`介面有一個`OnMetadataCreated`方法

```csharp
public interface IMetadataAware
{
    void OnMetadataCreated(ModelMetadata metadata);
}
```

在**MVC**有預設兩個實現`IMetadataAware`介面的標籤.

* `AllowHtmlAttribute`:標上的屬性可以攜帶`Html`資料.
* `AdditionalMetadataAttribute`:對於當前屬性的`modelmetadata`資訊的`AdditionalValues`添加資料(添加資料可透過`ViewData.ModelMetadata.AdditionalValues`取得資料)

如果你想要對於`modelmetadata`資訊做修改或新增資料可以製作自己`IMetadataAware`介面標籤.

> 我有做一個可以針對於[Asp.net MVC Debugger](https://github.com/isdaniel/Asp.net-MVC-Debuger)的專案，只要下中斷點就可輕易進入Asp.net MVC原始碼.

### AllowHtmlAttribute標籤

為了防止[(Cross-site scripting)XSS攻擊](https://zh.wikipedia.org/zh-tw/%E8%B7%A8%E7%B6%B2%E7%AB%99%E6%8C%87%E4%BB%A4%E7%A2%BC)通過在針對某些輸入框中寫入或注入`HTML`來攻擊我們`Web`應用

針對`HTML`標記驗證通過`ModelMetadata`的`RequestValidationEnabled`來控制，如下面程式碼顯示

這是一個布爾類型的可讀寫屬性。

```csharp
public class ModelMetadata
{
	public virtual bool RequestValidationEnabled { get; set; } 
}
```

> 此屬性在默認情況下為`True`進行驗證防護

**ASP.NET MVC**有一個預設標籤`AllowHtmlAttribute`在進行`Model`綁定之前會對對應請求資料進行驗證，確保沒有任何`HTML`標記包含其中。

如果在`Input` tag輸入有關`Html`資料就會出現下面錯誤.(這是**MVC**貼心幫我們開啟防護XSS攻擊的機制)

> 具有潛在危險`Request.Form` 的值已從用戶端 (xxxxxx) 偵測到。

![UML_Model](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/19/XSS.PNG)

如果查看`AllowHtmlAttribute`原始碼就很簡單只是把`metadata.RequestValidationEnabled`設成`false`允許使用者上傳`Html`資料.

```csharp
[AttributeUsage(AttributeTargets.Property, AllowMultiple = false, Inherited = true)]
public sealed class AllowHtmlAttribute : Attribute, IMetadataAware
{
    public void OnMetadataCreated(ModelMetadata metadata)
    {
        if (metadata == null)
        {
            throw new ArgumentNullException("metadata");
        }

        metadata.RequestValidationEnabled = false;
    }
}
```

我們就可以把`Html`資料傳送到**AP**端了

> 只是這個標籤請斟酌使用打開有一定風險.

### 為何可以透過實現IMetadataAware介面來擴充對於metadata操作

在`AssociatedMetadataProvider`抽象類別中有個`ApplyMetadataAwareAttributes`方法.

參數物件上屬性進行反射取得使用到`IMetadataAware`的標籤,並呼叫他的`OnMetadataCreated`方法.

```csharp
public abstract class AssociatedMetadataProvider : ModelMetadataProvider
{
    private static void ApplyMetadataAwareAttributes(IEnumerable<Attribute> attributes, ModelMetadata result)
    {
        foreach (IMetadataAware awareAttribute in attributes.OfType<IMetadataAware>())
        {
            awareAttribute.OnMetadataCreated(result);
        }
    }
}
```

## CachedDataAnnotationsModelMetadataProvider

在**MVC** `Action`傳入參數上可以標示許多標籤例如

```csharp
public class VerifyCodeViewModel
{
	[Required]
	public string Provider { get; set; }

	[Required]
	[Display(Name = "代碼")]
	public string Code { get; set; }
	public string ReturnUrl { get; set; }

	[Display(Name = "記住此瀏覽器?")]
	public bool RememberBrowser { get; set; }

	public bool RememberMe { get; set; }
}

public class ForgotViewModel
{
	[Required]
	[Display(Name = "電子郵件")]
	public string Email { get; set; }
}
```

* `RequiredAttribute`
* `DisplayAttribute`

還有其他一大堆,下面會跟大家介紹**MVC**是怎麼取得並使用這些標籤,`ModelMetadataProviders`這個類別會提供使用哪個`ModelMetadataProvider`

在原始碼建構子預設使用`CachedDataAnnotationsModelMetadataProvider`

```csharp
public class ModelMetadataProviders
{
    private static ModelMetadataProviders _instance = new ModelMetadataProviders();
    private ModelMetadataProvider _currentProvider;
    private IResolver<ModelMetadataProvider> _resolver;

    internal ModelMetadataProviders(IResolver<ModelMetadataProvider> resolver = null)
    {
        _resolver = resolver ?? new SingleServiceResolver<ModelMetadataProvider>(
                                    () => _currentProvider,
                                    new CachedDataAnnotationsModelMetadataProvider(),
                                    "ModelMetadataProviders.Current");
    }
    //....
}
```

在`CachedDataAnnotationsModelMetadataProvider`類別有一個`CreateMetadataPrototype`方法返回一個`CachedDataAnnotationsModelMetadata`物件,這個物件存放參數上屬性欄位使用標籤資訊.

```csharp
public class CachedDataAnnotationsModelMetadataProvider : CachedAssociatedMetadataProvider<CachedDataAnnotationsModelMetadata>
{
	protected override CachedDataAnnotationsModelMetadata CreateMetadataPrototype(IEnumerable<Attribute> attributes, Type containerType, Type modelType, string propertyName)
	{
		return new CachedDataAnnotationsModelMetadata(this, containerType, modelType, propertyName, attributes);
	}

	protected override CachedDataAnnotationsModelMetadata CreateMetadataFromPrototype(CachedDataAnnotationsModelMetadata prototype, Func<object> modelAccessor)
	{
		return new CachedDataAnnotationsModelMetadata(prototype, modelAccessor);
	}
}
```

### CachedDataAnnotationsModelMetadata

`CachedDataAnnotationsModelMetadata`類別上有許多屬性,主要是方便日後來判斷使用**MVC**使用標籤

```csharp
public class CachedDataAnnotationsModelMetadata : CachedModelMetadata<CachedDataAnnotationsMetadataAttributes>
{
    private bool _isEditFormatStringFromCache;

    public CachedDataAnnotationsModelMetadata(CachedDataAnnotationsModelMetadata prototype, Func<object> modelAccessor)
        : base(prototype, modelAccessor)
    {
    }

    public CachedDataAnnotationsModelMetadata(CachedDataAnnotationsModelMetadataProvider provider, Type containerType, Type modelType, string propertyName, IEnumerable<Attribute> attributes)
        : base(provider, containerType, modelType, propertyName, new CachedDataAnnotationsMetadataAttributes(attributes.ToArray()))
    {
    }

    protected override bool ComputeConvertEmptyStringToNull()
    {
        return PrototypeCache.DisplayFormat != null
                    ? PrototypeCache.DisplayFormat.ConvertEmptyStringToNull
                    : base.ComputeConvertEmptyStringToNull();
    }

    protected override string ComputeDataTypeName()
    {
        if (PrototypeCache.DataType != null)
        {
            return PrototypeCache.DataType.ToDataTypeName();
        }

        if (PrototypeCache.DisplayFormat != null && !PrototypeCache.DisplayFormat.HtmlEncode)
        {
            return DataTypeUtil.HtmlTypeName;
        }

        return base.ComputeDataTypeName();
    }
    //...
}
```

有一個蠻特別事情是`CachedDataAnnotationsModelMetadata : CachedModelMetadata<CachedDataAnnotationsMetadataAttributes>`他繼承一個泛型類別`CachedDataAnnotationsMetadataAttributes`存放取得物件標籤的資訊.

### CachedDataAnnotationsMetadataAttributes

`CachedDataAnnotationsMetadataAttributes`類別主要把屬性上的某些標籤給值到類別的屬性上,方便`CachedDataAnnotationsModelMetadata`來操作使用.

這也是為什麼只有某些標籤掛在屬性上可以被使用.預設只有`CachedDataAnnotationsMetadataAttributes`才會被反射取得.

```csharp
public class CachedDataAnnotationsMetadataAttributes
{
	public CachedDataAnnotationsMetadataAttributes(Attribute[] attributes)
	{
		DataType = attributes.OfType<DataTypeAttribute>().FirstOrDefault();
		Display = attributes.OfType<DisplayAttribute>().FirstOrDefault();
		DisplayColumn = attributes.OfType<DisplayColumnAttribute>().FirstOrDefault();
		DisplayFormat = attributes.OfType<DisplayFormatAttribute>().FirstOrDefault();
		DisplayName = attributes.OfType<DisplayNameAttribute>().FirstOrDefault();
		Editable = attributes.OfType<EditableAttribute>().FirstOrDefault();
		HiddenInput = attributes.OfType<HiddenInputAttribute>().FirstOrDefault();
		ReadOnly = attributes.OfType<ReadOnlyAttribute>().FirstOrDefault();
		Required = attributes.OfType<RequiredAttribute>().FirstOrDefault();
		ScaffoldColumn = attributes.OfType<ScaffoldColumnAttribute>().FirstOrDefault();
        //.....
	}

	public DataTypeAttribute DataType { get; protected set; }

	public DisplayAttribute Display { get; protected set; }

	public DisplayColumnAttribute DisplayColumn { get; protected set; }

	public DisplayFormatAttribute DisplayFormat { get; protected set; }

	public DisplayNameAttribute DisplayName { get; protected set; }

	public EditableAttribute Editable { get; protected set; }

	public HiddenInputAttribute HiddenInput { get; protected set; }
    //.....
}
```

## 小結：

`ModelMetaData`是一個**Model Binding**很重要物件,裡面存放許多調用參數的資訊.

**MVC**提供一個`IMetadataAware`介面可以改變`ModelMetaData`中資訊,提高更高的彈性.

這篇也介紹了`IMetadataAware`介面是在哪邊做攔截.

另外也分享常掛在屬性上標籤取得的類別跟機制

* `DisplayNameAttribute`
* `RequiredAttribute`
* `DisplayAttribute`

透過`CachedDataAnnotationsModelMetadataProvider`這個類別來取得以上標籤,並在日後做判斷.

下篇會和大家分享另一種屬性標籤`ValidationAttribute`的取得和呼叫過程.
