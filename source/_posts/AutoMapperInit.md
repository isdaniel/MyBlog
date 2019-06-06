---
title: (AutoMapper)反射自動註冊AutoMapper Profile
date: 2019-06-10 22:30:11
tags: [C#,Automapper,Model]
categories: [C#]
---

## 前言：

AutoMapper 幫我我們方便管理物件跟物件之間屬性值格式轉換

## 模型轉換

**這裡有兩個類別**

UserInfoModel 當作我們從DB撈取出來 模型資料

```csharp 
public class UserInfoModel
{
    public int RowId { get; set; }
    public string Name { get; set; }
    public int Age { get; set; }
}
```

UserInfoViewModel 是呈現在UI或其他地方的模型  

其中 `Detail `欄位由 `UserInfoModel  `的 `Name `和 `Age `屬性組成的

```csharp 
public class UserInfoViewModel
{
    public string Detail { get; set; }
}
```

這時我們就會引用 AutoMapper 幫我們統一管理轉換模型上的問題

## 建立一個Profile

設置`UserInfoModel `對於 `UserInfoViewModel `之前的欄位轉換

```csharp 
public class UserInfoProfile : Profile
{
        public UserInfoProfile()
        {
            CreateMap<UserInfoModel, UserInfoViewModel>()
                    .ForMember(t => t.Detail, 
                                    s => s.MapFrom(_ => $"DetailInfo:{_.Name} {_.Age}"));
        }
}
```

而我們在註冊時會呼叫 `AddProfile `方法

```csharp
Mapper.Initialize(x => x.AddProfile<UserInfoProfile>());
```

但每次新加Profile這邊都需要設置新的Profile，我們就會想有沒有方法可以讓他自動註冊？

> 我們可以使用反射來完成

## 反射自動註冊AutoMapper Profile 

此程式我使用我的 [ExtenionTool](https://github.com/isdaniel/ExtenionTool)

```csharp 
var profiles =  Assembly.GetExecutingAssembly()
                        .GetInstancesByAssembly<Profile>();

foreach (var profile in profiles)
{
    Mapper.Initialize(x => x.AddProfile(profile));
}
```

上面程式碼很簡單清晰，呼叫 `` 取得目前組件所有的 `Profile `物件實體並且加到`Profile`中，我們將上面程式碼在初始化執行一次

```csharp 
public static IEnumerable<TResult> GetInstancesByAssembly<TResult>(this Assembly ass)
{
    return ass.GetTypes()
            .Where(x => typeof(TResult).IsAssignableFrom(x) && x.IsNormalClass())
            .Select(x => Activator.CreateInstance(x))
            .Cast<TResult>();
}
```

核心程式使用Linq 動態取得你所需的類型並使用反射創建

之後我們就可以不用在手動把`Profile `加至`AutoMapper `容器中了

[Source Code](https://github.com/isdaniel/AutoRegisterAutoMapper)
