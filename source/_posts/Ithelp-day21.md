---
title:  探討Model驗證標籤(ValidationAttribute) (第21天)
date: 2019-10-02 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---

# Agenda<!-- omit in toc -->
- [前言](#%e5%89%8d%e8%a8%80)
- [ValidationAttribute](#validationattribute)
	- [ModelValidatorProviders](#modelvalidatorproviders)
	- [ModelValidator](#modelvalidator)
- [CompositeModelValidator](#compositemodelvalidator)
- [DataAnnotationsModelValidator](#dataannotationsmodelvalidator)
	- [DataAnnotationsModelValidatorProvider](#dataannotationsmodelvalidatorprovider)
- [小結:](#%e5%b0%8f%e7%b5%90)

## 前言

`CachedDataAnnotationsMetadataAttributes`這個類別攔截某些標籤可被攔截驗證.

本篇會介紹另一個可以客製化驗證`ValidationAttribute`,常用驗證標籤並講述是如何參數屬性是如何取得這個標籤和使用過程.

> 我有做一個可以針對於[Asp.net MVC Debugger](https://github.com/isdaniel/Asp.net-MVC-Debuger)的專案，只要下中斷點就可輕易進入Asp.net MVC原始碼.

## ValidationAttribute

`ValidationAttribute`類別在`System.ComponentModel.DataAnnotations`命名空間下.

我們可以建立一個類別繼承`ValidationAttribute`並`bool IsValid(object value)`重載方法來製做我們客制化驗證機制.

`IsValid`方法有一個`Bool`回傳值回傳`true`代表驗證通過`false`反之

```csharp
public abstract class ValidationAttribute : Attribute{
    //...
    public virtual bool IsValid(object value)
    {
    
    }
	//....
}
```

* `RegularExpressionAttribute`
* `StringLengthAttribute`
* `RangeAttribute`

如果查看上面幾個標籤原始碼可發現這幾個標籤都是繼承於一個`ValidationAttribute`類別(這也是為什麼我們可以透過繼承`ValidationAttribute`來擴充自己驗證方式).

### ModelValidatorProviders

`ModelValidatorProviders`提供

* `DataAnnotationsModelValidatorProvider`
* `DataErrorInfoModelValidatorProvider`
* `ClientDataTypeModelValidatorProvider`

`ModelValidatorProviderCollection`是一個`ModelValidatorProvider`集合,可對於此集合加入`ModelValidatorProvider`物件.

```csharp
public static class ModelValidatorProviders
{
	private static readonly ModelValidatorProviderCollection _providers = new ModelValidatorProviderCollection()
	{
		new DataAnnotationsModelValidatorProvider(),
		new DataErrorInfoModelValidatorProvider(),
		new ClientDataTypeModelValidatorProvider()
	};

	public static ModelValidatorProviderCollection Providers
	{
		get { return _providers; }
	}
}
public class ModelValidatorProviderCollection : Collection<ModelValidatorProvider>
{
	//...
}
```

如果我們需要加入一個客製化`ModelValidatorProvider`，可以直接將相應物件新增到`ModelValidatorProviders`的`Providers`集合中。

### ModelValidator

所有的參數驗證都繼承自抽像類型`ModelValidator`,這個抽象類別有幾個重要成員.

* `IsRequired`:表示該`ModelValidator`是否是對目標屬性進行必要性驗證，默認是`False`
* `GetClientValidationRules`方法：`ModelClientValidationRule`是對客戶端驗證規則的封裝，我們會在進行客戶端驗證時對其進行詳細介紹。
* `Validate`方法:對於屬性實施驗證,驗證完後回傳一個`ModelValidationResult`的集合物件.

```csharp
public abstract class ModelValidator
{  
	///....
    public abstract IEnumerable<ModelValidationResult> Validate(object container);
    
	public virtual IEnumerable<ModelClientValidationRule> GetClientValidationRules();

    public virtual bool IsRequired { get; }
}
```

## CompositeModelValidator

從類別名稱可看出`CompositeModelValidator`,實並不是一個真正對`Model`物件實施驗證`ModelValidator`，它是一系列`ModelValidator`組合,根據基於`Model`本身類型及其屬性的`Model`元數據動態的取得`ModelValidator`（通過調用`ModelMetadata.GetValidators`方法）對`Model`參數實施驗證。

```csharp
private class CompositeModelValidator : ModelValidator
{
	//...

	public override IEnumerable<ModelValidationResult> Validate(object container)
	{
		bool propertiesValid = true;

		ModelMetadata[] properties = Metadata.PropertiesAsArray;

		for (int propertyIndex = 0; propertyIndex < properties.Length; propertyIndex++)
		{
			ModelMetadata propertyMetadata = properties[propertyIndex];
			foreach (ModelValidator propertyValidator in propertyMetadata.GetValidators(ControllerContext))
			{
				foreach (ModelValidationResult propertyResult in propertyValidator.Validate(Metadata.Model))
				{
					propertiesValid = false;
					yield return CreateSubPropertyResult(propertyMetadata, propertyResult);
				}
			}
		}

		if (propertiesValid)
		{
			foreach (ModelValidator typeValidator in Metadata.GetValidators(ControllerContext))
			{
				foreach (ModelValidationResult typeResult in typeValidator.Validate(container))
				{
					yield return typeResult;
				}
			}
		}
	}
}
```

下圖是`ModelValidator、ModelValidatorProvider、ModelValidatorProviders`UML關係圖

![UML_Model](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/20/uml_img.png)

## DataAnnotationsModelValidator

`ModelValidator`物件是用於進行`Model`參數驗證的模組類別中的`ValidationAttribute`透過建構子設定檢驗的標籤.

```csharp
public class DataAnnotationsModelValidator : ModelValidator
{
   public DataAnnotationsModelValidator(ModelMetadata metadata, ControllerContext context, ValidationAttribute attribute);
	protected internal ValidationAttribute Attribute { get; private set; }

	public override bool IsRequired
	{
		get { return Attribute is RequiredAttribute; }
	}

	internal static ModelValidator Create(ModelMetadata metadata, ControllerContext context, ValidationAttribute attribute)
	{
		return new DataAnnotationsModelValidator(metadata, context, attribute);
	}

	public override IEnumerable<ModelClientValidationRule> GetClientValidationRules()
	{
		//....
	}

	public override IEnumerable<ModelValidationResult> Validate(object container)
	{
		//....
	}
}
```

###　DataAnnotationsModelValidator<TAttribute>

`DataAnnotationsModelValidator<TAttribute>`這個泛型類別有一個合約`TAttribute`必須為`ValidationAttribute`

`DataAnnotationsModelValidator<TAttribute>`的子類。當我們將這些`ValidationAttribute`應用到`Model`型別時，真正用於`Model`參數驗證是`ModelValidator`的轉接器類別

> 在這裡使用**轉接器模式**把每個繼承`ValidationAttribute`標籤適配給一個`ModelValidator`物件.

例如下面程式碼每個`ModelValidator`都有自己的轉接器類別.

* `RangeAttributeAdapter` = `RangeAttribute`
* `RequiredAttributeAdapter` = `RequiredAttribute`
* `StringLengthAttributeAdapter` = `StringLengthAttribute`
* `RegularExpressionAttributeAdapter` = `RegularExpressionAttribute`

```csharp
public class
DataAnnotationsModelValidator<TAttribute> : DataAnnotationsModelValidator
where TAttribute : ValidationAttribute
{	
	//....
}

public class RequiredAttributeAdapter : DataAnnotationsModelValidator<RequiredAttribute>
{
   //....
}
 
public class RangeAttributeAdapter : DataAnnotationsModelValidator<RangeAttribute>
{    
   //....
}
 
public class RegularExpressionAttributeAdapter : DataAnnotationsModelValidator<				RegularExpressionAttribute>
{    
	//....
}
 
public class StringLengthAttributeAdapter : DataAnnotationsModelValidator<						StringLengthAttribute>
{    
	//....
}
```

### DataAnnotationsModelValidatorProvider

有一個委派`DataAnnotationsModelValidationFactory`主要可以存放一個執行動作且回傳一個`ModelValidator`

```csharp
public delegate ModelValidator DataAnnotationsModelValidationFactory(ModelMetadata metadata, ControllerContext context, ValidationAttribute attribute);

public delegate ModelValidator DataAnnotationsValidatableObjectAdapterFactory(ModelMetadata metadata, ControllerContext context);
```

* `AttributeFactories`：一個字典集合從屬性載入預設擁有`ValidationAttribute`標籤(上面介紹的轉接器`RegularExpressionAttributeAdapter`....)
* `DefaultAttributeFactory`：如果從`AttributeFactories`這個字典無法取得繼承`ValidationAttribute`標籤(自己客製化)就藉由`DataAnnotationsModelValidator`取得.

```csharp
internal static DataAnnotationsModelValidationFactory DefaultAttributeFactory =
	(metadata, context, attribute) => new DataAnnotationsModelValidator(metadata, context, attribute);

internal static DataAnnotationsValidatableObjectAdapterFactory DefaultValidatableFactory =
            (metadata, context) => new ValidatableObjectAdapter(metadata, context);

internal static Dictionary<Type, DataAnnotationsModelValidationFactory> AttributeFactories = BuildAttributeFactoriesDictionary();

protected override IEnumerable<ModelValidator> GetValidators(ModelMetadata metadata, ControllerContext context, IEnumerable<Attribute> attributes)
{
	//..
	foreach (ValidationAttribute attribute in attributes.OfType<ValidationAttribute>())
	{
		DataAnnotationsModelValidationFactory factory;
		if (!AttributeFactories.TryGetValue(attribute.GetType(), out factory))
		{
			factory = DefaultAttributeFactory;
		}
		results.Add(factory(metadata, context, attribute));
	}

	// Produce a validator if the type supports IValidatableObject
	if (typeof(IValidatableObject).IsAssignableFrom(metadata.ModelType))
	{
		DataAnnotationsValidatableObjectAdapterFactory factory;
		if (!ValidatableFactories.TryGetValue(metadata.ModelType, out factory))
		{
			factory = DefaultValidatableFactory;
		}
		results.Add(factory(metadata, context));
	}
	//....
}
```

最後從`Model`元數據中載入所有`ValidationAttribute`驗證標籤後就會在`DefaultModelBinder.BindProperties`呼叫方法時被觸發驗證

## 小結:

在整個**Model-Binding**流程中,算是蠻複雜的石頭希望可以跟大家簡述一些綁定概念和做法.

`ValidationAttribute`是舊有的類別,**MVC**利用一系列手法將她很好融入系統中.

原本`ValidationAttribute`被多個標籤繼承,透過`DataAnnotationsModelValidator<TAttribute>`設計(讓我驚豔),變成一個1對1關係(每個`ValidationAttribute`都有自己的轉接器物件),之後就可以在`BuildAttributeFactoriesDictionary()`更方便使用.
