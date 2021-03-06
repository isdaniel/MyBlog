---
title: Http參數如何綁定到Action參數上(簡單和複雜模型綁定探討) (第19天)
date: 2019-09-30 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---

# Agenda<!-- omit in toc -->
- [前言](#%e5%89%8d%e8%a8%80)
- [ModelMetadata 元數據儲存參數資料](#modelmetadata-%e5%85%83%e6%95%b8%e6%93%9a%e5%84%b2%e5%ad%98%e5%8f%83%e6%95%b8%e8%b3%87%e6%96%99)
- [BindSimpleModel 簡單模型綁定](#bindsimplemodel-%e7%b0%a1%e5%96%ae%e6%a8%a1%e5%9e%8b%e7%b6%81%e5%ae%9a)
- [BindComplexModel 複雜模型綁定](#bindcomplexmodel-%e8%a4%87%e9%9b%9c%e6%a8%a1%e5%9e%8b%e7%b6%81%e5%ae%9a)
- [小結：](#%e5%b0%8f%e7%b5%90)
	- [簡單模型綁定 vs 複雜模型綁定](#%e7%b0%a1%e5%96%ae%e6%a8%a1%e5%9e%8b%e7%b6%81%e5%ae%9a-vs-%e8%a4%87%e9%9b%9c%e6%a8%a1%e5%9e%8b%e7%b6%81%e5%ae%9a)

## 前言

`IValueProvider`物件透過一個`ValueProviderFactory`工廠來產生

`Action`方法綁定`Model`参数由實現`IModelBinder`的介面`ModelBinder（DefaultModelBinder）`物件來實現

在`IModelBinder`介面中有一個重要的方法`object BindModel`取得`Model`參數資料.

但在`Http`請求傳送參數極為複雜是如何將參數動態綁定在`Action`參數上呢?

最常見的**Json**參數透過`POST Body`傳到AP端,經由**MVC** `BindModel`來取得參數物件資料.

如下方資料.

```json
{
   "Key":"123",
   "value":"",
   "Adress":["test133","e2424"]
}
```

```csharp
public class RootObject
{
    public string Key { get; set; }
    public string value { get; set; }
    public List<string> Adress { get; set; }
}
```

> 網路上有個工具可方便使用Json字串取得`c#` 對應`Model`[Json to c# model](http://json2csharp.com/)

本篇就和大家分享這個機制是如何達成的

> 我有做一個可以針對於[Asp.net MVC Debugger](https://github.com/isdaniel/Asp.net-MVC-Debuger)的專案，只要下中斷點就可輕易進入Asp.net MVC原始碼.

## ModelMetadata 元數據儲存參數資料

`Model`參數類型可能是一個簡單字串或者是一個值類型，也可能是一個複雜類型物件。

對於一個複雜類型物件，基於類型本身和物件成員元數據通過一個`ModelMetadata`類別來達成

某個成員又可能是一個複雜類型物件，通過`ModelMetadata`物件表示`Model`狀態,所以`ModelMetadata`(元數據)實際上具有一個樹形層次化的資料結構.

```csharp
public class ModelMetadata
{
	public Type ModelType { get; }
	public virtual bool IsComplexType { get; }
	public bool IsNullableValueType { get; }
	public Type ContainerType { get; }
	public object Model { get; set; }
	public string PropertyName { get; }
	public virtual Dictionary<string, object> AdditionalValues { get; }
	protected ModelMetadataProvider Provider { get; set; }

	public virtual IEnumerable<ModelMetadata> Properties
	{
		get
		{
			if (_properties == null)
			{
				IEnumerable<ModelMetadata> originalProperties = Provider.GetMetadataForProperties(Model, RealModelType);
				_propertiesInternal = SortProperties(originalProperties.AsArray());
				_properties = new ReadOnlyCollection<ModelMetadata>(_propertiesInternal);
			}
			return _properties;
		}
	}
}
```

在`ModelMetadata`類別中有幾個重要的屬性.

1. `Provider(ModelMetadataProvider)`:存放當前物件下面一個`ModelMetadataProvider`資訊,`ModelMetadataProvider`主要是提供`ModelMetadata`是如何被產生(一般使用`CachedDataAnnotationsModelMetadataProvider`這個類別使用`MemoryCache`存放資訊)
2. `IEnumerable<ModelMetadata>`:用來表示當前物件所使用屬性資訊`ModelMetadata`集合
3. `IsComplexType`:判斷是否是複雜模型.
4. `ContainerType`:父節點類別型態(可以看做樹狀結構,可當作存放根結點類型)
5. `ModelType`:目前屬性或參數的類型.
6. `Model`:綁定完使用的參數

假如這邊有兩個類別`Person`,`AddressInfo`且一個`Person`可以擁有多個地址

這裡就會呈現一對多關係如下圖

![UML_Model](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/18/UML_Relation.png)

> 就像大樹支點和葉子,這個屬性可能是葉子也可能是別人的支點.

```csharp
public class Person
{
    public int Age{ get; set; }
    public string Name { get; set; }
    public IEnumerable<AddressInfo> Address { get; set; }
}
public class AddressInfo
{
    public string Name { get; set; }
}
```

上面類別關係圖就是簡單表示複雜模型

通過上面的介紹我們知道表示`Model`元數據`ModelMetadata`具有一個樹形層次結構

在每個`ModelMetadata`內部都有一個型別為`IEnumerable<ModelMetadata>`的`Properties`屬性來引用它的下級`ModelMetadata`，這就形成了一個無限巢狀的後設資料表示結構.

![UML_Model](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/18/metadata_uml.png)

此圖可以表示`ModelMetadata`跟`Person`類別屬性的關係.

## BindSimpleModel 簡單模型綁定

在上面介紹了`ModelMetadata`這個類別儲存了參數的各個資訊.

```csharp 
internal object BindSimpleModel(
		ControllerContext controllerContext, 
		ModelBindingContext bindingContext, 
		ValueProviderResult valueProviderResult
	)
{
	bindingContext.ModelState.SetModelValue(bindingContext.ModelName, valueProviderResult);

	if (bindingContext.ModelType.IsInstanceOfType(valueProviderResult.RawValue))
	{
		return valueProviderResult.RawValue;
	}

	if (bindingContext.ModelType != typeof(string))
	{
		if (bindingContext.ModelType.IsArray)
		{
			object modelArray = ConvertProviderResult(bindingContext.ModelState, bindingContext.ModelName, valueProviderResult, bindingContext.ModelType);
			return modelArray;
		}

		Type enumerableType = TypeHelpers.ExtractGenericInterface(bindingContext.ModelType, typeof(IEnumerable<>));
		if (enumerableType != null)
		{
			object modelCollection = CreateModel(controllerContext, bindingContext, bindingContext.ModelType);
			Type elementType = enumerableType.GetGenericArguments()[0];
			Type arrayType = elementType.MakeArrayType();
			object modelArray = ConvertProviderResult(bindingContext.ModelState, bindingContext.ModelName, valueProviderResult, arrayType);

			Type collectionType = typeof(ICollection<>).MakeGenericType(elementType);
			if (collectionType.IsInstanceOfType(modelCollection))
			{
				CollectionHelpers.ReplaceCollection(elementType, modelCollection, modelArray);
			}
			return modelCollection;
		}
	}

	object model = ConvertProviderResult(bindingContext.ModelState, bindingContext.ModelName, valueProviderResult, bindingContext.ModelType);
	return model;
}

private static object ConvertProviderResult(
	ModelStateDictionary modelState, 
	string modelStateKey, 
	ValueProviderResult valueProviderResult, 
	Type destinationType
	)
{
	try
	{
		object convertedValue = valueProviderResult.ConvertTo(destinationType);
		return convertedValue;
	}
	catch (Exception ex)
	{
		modelState.AddModelError(modelStateKey, ex);
		return null;
	}
}
```

透過`ConvertProviderResult`來將類型轉換成簡單模型綁定使用的參數實例.

在`BindSimpleModel`中依照下面幾個規則來做參數物件建立.

1. `Array`:如果此參數是陣列,判斷此陣列型別並利用`ValueProviderResult.ConvertTo()`建立陣列
2. `IEnumerable<>`:如果此參數是`IEnumerable<>`集合,判斷此`IEnumerable<>`型別`ValueProviderResult.ConvertTo()`建立集合
3. `object`:不是上面的型別就直接使用`ValueProviderResult.ConvertTo()`建立物件.

> `ConvertTo()`方法在簡單模型物件建立起到一個很大的作用

## BindComplexModel 複雜模型綁定

在`BindModel`方法中有一個`BindComplexModel`方法是針對複雜模型產生的方法.

一開始先判斷`ModelBindingContext.Model`是否為`Null`如果是就會建立一個物件實例返回.

會依照下面機制判斷產生物件

1. 判斷參數類型是否`Array`產生一個相對應陣列集合
2. 判斷參數類型是否`IDictionary<,>` and `ICollection<>`集合產生一個相對應陣列集合
3. 判斷參數類型是否`IEnumerable<>`集合產生一個相對應陣列集合

```csharp
internal object BindComplexModel(
    ControllerContext controllerContext, 
    ModelBindingContext bindingContext
    )
{
	object model = bindingContext.Model;
	Type modelType = bindingContext.ModelType;

	if (model == null && modelType.IsArray)
	{
		Type elementType = modelType.GetElementType();
		Type listType = typeof(List<>).MakeGenericType(elementType);
		object collection = CreateModel(controllerContext, bindingContext, listType);

		ModelBindingContext arrayBindingContext = new ModelBindingContext()
		{
			ModelMetadata = ModelMetadataProviders.Current.GetMetadataForType(() => collection, listType),
			ModelName = bindingContext.ModelName,
			ModelState = bindingContext.ModelState,
			PropertyFilter = bindingContext.PropertyFilter,
			ValueProvider = bindingContext.ValueProvider
		};
		IList list = (IList)UpdateCollection(controllerContext, arrayBindingContext, elementType);

		if (list == null)
		{
			return null;
		}

		Array array = Array.CreateInstance(elementType, list.Count);
		list.CopyTo(array, 0);
		return array;
	}

	if (model == null)
	{
		model = CreateModel(controllerContext, bindingContext, modelType);
	}

	Type dictionaryType = TypeHelpers.ExtractGenericInterface(modelType, typeof(IDictionary<,>));
	if (dictionaryType != null)
	{
		Type[] genericArguments = dictionaryType.GetGenericArguments();
		Type keyType = genericArguments[0];
		Type valueType = genericArguments[1];

		ModelBindingContext dictionaryBindingContext = new ModelBindingContext()
		{
			ModelMetadata = ModelMetadataProviders.Current.GetMetadataForType(() => model, modelType),
			ModelName = bindingContext.ModelName,
			ModelState = bindingContext.ModelState,
			PropertyFilter = bindingContext.PropertyFilter,
			ValueProvider = bindingContext.ValueProvider
		};
		object dictionary = UpdateDictionary(controllerContext, dictionaryBindingContext, keyType, valueType);
		return dictionary;
	}

	Type enumerableType = TypeHelpers.ExtractGenericInterface(modelType, typeof(IEnumerable<>));
	if (enumerableType != null)
	{
		Type elementType = enumerableType.GetGenericArguments()[0];

		Type collectionType = typeof(ICollection<>).MakeGenericType(elementType);
		if (collectionType.IsInstanceOfType(model))
		{
			ModelBindingContext collectionBindingContext = new ModelBindingContext()
			{
				ModelMetadata = ModelMetadataProviders.Current.GetMetadataForType(() => model, modelType),
				ModelName = bindingContext.ModelName,
				ModelState = bindingContext.ModelState,
				PropertyFilter = bindingContext.PropertyFilter,
				ValueProvider = bindingContext.ValueProvider
			};
			object collection = UpdateCollection(controllerContext, collectionBindingContext, elementType);
			return collection;
		}
	}

	BindComplexElementalModel(controllerContext, bindingContext, model);
	return model;
}
```

最後呼叫`BindComplexElementalModel`方法將剛剛建立值(`model`物件)透過`ValueProvider`把參數給值.

> 有分簡單綁定和複雜綁定,最後都還是會呼叫使用簡單綁定來值綁定給物件.

在`BindProperty`方法時填充子節點`ModelMetadata`的`Model`屬性.

`GetPropertyValue`透過`(DefaultModelBinder)`再次綁定物件動作如下

* `ModelMetadata`是簡單模型就會把值填充給此次`ModelMetadata.Model`
* `ModelMetadata`是複雜模型就建立一個物件後呼叫`BindProperty`直到找到最後的簡單模型.

```csharp
protected virtual void BindProperty(ControllerContext controllerContext, ModelBindingContext bindingContext, PropertyDescriptor propertyDescriptor)
{
	//...
	IModelBinder propertyBinder = Binders.GetBinder(propertyDescriptor.PropertyType);
	object originalPropertyValue = propertyDescriptor.GetValue(bindingContext.Model);
	ModelMetadata propertyMetadata = bindingContext.PropertyMetadata[propertyDescriptor.Name];
	propertyMetadata.Model = originalPropertyValue;
	ModelBindingContext innerBindingContext = new ModelBindingContext()
	{
		ModelMetadata = propertyMetadata,
		ModelName = fullPropertyKey,
		ModelState = bindingContext.ModelState,
		ValueProvider = bindingContext.ValueProvider
	};
	object newPropertyValue = GetPropertyValue(controllerContext, innerBindingContext, propertyDescriptor, propertyBinder);
	propertyMetadata.Model = newPropertyValue;
	//...
}

protected virtual object GetPropertyValue(ControllerContext controllerContext, ModelBindingContext bindingContext, PropertyDescriptor propertyDescriptor, IModelBinder propertyBinder)
{
	object value = propertyBinder.BindModel(controllerContext, bindingContext);

	if (bindingContext.ModelMetadata.ConvertEmptyStringToNull && Equals(value, String.Empty))
	{
		return null;
	}

	return value;
}
```

## 小結：

**MVC** `ModelBinding` 使用到一個設計模式(組合模式),當我發現時覺得十分興奮.

因為在現實專案中我較少看到(組合模式),發輝良好的作用而在這個案例上發揮的淋漓盡致.

組合模式關係圖如下

![UML_Model](https://raw.githubusercontent.com/isdaniel/MyBlog/master/source/images/itHelp/18/Composite_Design_Pattern_UML.jpg)

[參考圖片連結](https://en.wikipedia.org/wiki/Composite_pattern)

組合模式基本上分為兩個部分**葉**(`Left`)和**組件**(`component`)他們都依賴於一個抽象,組件實現取得動作的抽象只為了獲得下面的葉,真正有動作只會在葉有動作

`組合模式`很適合用在樹狀的資料結構且需求對於**葉**和**組件**要做大量不一樣判斷.

在模型綁定中他依靠兩個東西完成上面說的依賴關聯

* `ModelBindingContext`物件
* `object CreateModel`方法

### 簡單模型綁定 vs 複雜模型綁定

1. 簡單模型綁定:透過`ModelBindingContext`找到參數使用型別並利用`ValueProvider`給值,最後返回物件
2. 複雜模型綁定:透過`ModelBindingContext`建立參數利用`ValueProvider`給值,往下繼續重複動作直到呼叫簡單模型綁定方法,就不會繼續往下呼叫`object`方法.

這裡很巧妙的利用`ModelBinderDictionary`取得當前參數型別並取得相對應`IModelBinder`實現物件.
