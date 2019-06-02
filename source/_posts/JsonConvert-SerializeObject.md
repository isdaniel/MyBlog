---
title: JsonConvert.SerializeObject 呼叫 object.Equals 問題探討
date: 2019-05-26 22:40:46
tags: [C#,Json.net]
categories: [C#]
---

最近在 StackOverFlow 解答一個很有趣的問題[Json.Net / Newtonsoft: Using JsonConvert.SerializeObject results in weird .Equals calls - why?](https://stackoverflow.com/questions/51669072/json-net-newtonsoft-using-jsonconvert-serializeobject-results-in-weird-equal/51670641#51670641)

## 問題簡述是：

使用`Newtonsoft.Json.JsonConvert.SerializeObject`方法 來把物件轉成`JSON`資料時,為什麼會呼叫物件的`Equals` 方法 且傳入的`object obj`類型不是此類別類型,而是屬性的類型

以下是發問者提供的程式碼:

``` c#
public class JsonTestClass
{
    public string Name { get; set; }
    public List<int> MyIntList { get; set; }

    public override bool Equals(object obj)
    {
        if (obj == null)
            return false;
        JsonTestClass jtc = (JsonTestClass)obj;
        return true;
    }
}

JsonTestClass c = new JsonTestClass();
c.Name = "test";
c.MyIntList = new List<int>();
c.MyIntList.Add(1);

string json = JsonConvert.SerializeObject(c, new JsonSerializerSettings() { TypeNameHandling = TypeNameHandling.All });
```

-----

## 問題解析：

看到問題後我就直接去看[Json.net原始碼](https://github.com/JamesNK/Newtonsoft.Json) 一探到底原因出在哪邊.

後面發現當我們在呼叫`JsonConvert.SerializeObject`方法,會執行一個 [private bool CheckForCircularReference](https://github.com/JamesNK/Newtonsoft.Json/blob/c90e6e871ae39cd4686dac6fa64a780e527123a8/Src/Newtonsoft.Json/Serialization/JsonSerializerInternalWriter.cs)私有方法.

``` c#
bool exists = (Serializer._equalityComparer != null)
                ? _serializeStack.Contains(value, Serializer._equalityComparer)
                : _serializeStack.Contains(value);
```

###　重點：

這個方法主要用意是**判斷目前序列化JSON物件是否有重複引用本身**,方法中有段程式碼使用到 `List<T>.Contains`.

當我們在呼叫`List<T>.Contains`時 預設`EqualityComparer<T>.Default` 進行比較來進行判斷是否存在集合中.

要寫客製化比較方式有兩種

1. 在.net中每個類別都繼承於`Object`, `Object` 中有`object.Equals` 所以可以重寫`object.Equals`方法.
2. 將此類別實現 `IEquatable<T>` 並重寫你要的比較方式.

所以會呼叫`object.Equals`是因為上段程式碼

-----

## 補充說明：

什麼是**判斷目前序列化JSON物件是否有重複引用本身**?

以下的範例是[private bool CheckForCircularReference](https://github.com/JamesNK/Newtonsoft.Json/blob/c90e6e871ae39cd4686dac6fa64a780e527123a8/Src/Newtonsoft.Json/Serialization/JsonSerializerInternalWriter.cs)想要防止的問題

```c#
public class JsonTestClass
{
    public string Name { get; set; }
    public List<int> MyIntList { get; set; }
    public JsonTestClass Test{get;set;}
}

JsonTestClass c = new JsonTestClass();
c.Name = "test";
c.Test = c;
string json = JsonConvert.SerializeObject
               (c, new JsonSerializerSettings() { TypeNameHandling = TypeNameHandling.All });
```

我們可以看到`c.Test = c;` 將自己本身付值給 `public JsonTestClass Test{get;set;}` 這個屬性.

我們執行上面程式碼會得到此錯誤

> Self referencing loop detected for property 'Test' with type 'Program+JsonTestClass'. Path ''.

是因為他要防止重複引用本身導致無限迴圈解析`JSON`.

## Note

**預設**值類型的比較是比較值.
**預設**參考類別比較的是地址.