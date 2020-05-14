---
title: C# Boxing vs UnBoxing
date: 2020-05-02 22:30:11
tags: [C#]
categories: [C#,Boxing-UnBoxing]
---

## 前言:

`Boxing`跟`UnBoxing`在.net中,我們可能在無意識使用到但這個事情確會造成一些效能影響...

## .NET兩種類型

在.NET有分兩種類型

1.  值類型(int,double,char....)
2.  參考類型(自行宣告的類別,string....)

而存放資料的方式也有兩種:

1.  堆疊Stack  
2.  堆積Heap

談談Boxing和UnBoxing之前，我們先來了解`Stack`和`Heap`

值類型(Value Type)會存取在`Stack`記憶體區塊中

參考類型(Reference Type)內容會在`Heap`記憶體區塊上，Stack會指向Heap上記憶體位置(有點像c++傳址)

如下圖

![](https://az787680.vo.msecnd.net/user/%E4%B9%9D%E6%A1%83/dc60b613-5aab-4031-b07e-ba95b3eb8c59/1519278342_30764.png)

了解`Stack`和`Heap`後

我們來談談`Boxing`和`UnBoxing`

## Boxing:

型態由大轉小

```c#
int i=20;
object o=(object)i;
```

<div class="note note--normal"> int強制轉型為object 因為我們所有物件都是繼承於object物件</div>

原本值類型存在`Stack`中,但因為我們強轉成`Object = 20`會存在Heap記憶體區塊中.

> 因為Object是ReferType型別,這個現象就是`Boxing`

如下圖

![](https://az787680.vo.msecnd.net/user/九桃/62a967a6-4b35-4ca6-a9d1-90318cd12cdc/1556535346_2245.png)

## UnBoxing:

型態由小轉大(小轉大會有轉型出錯的問題)

```c#
int i=20;
object o=(object)i;
int j=(int)o;
```

將`Object`強轉成`int`在這個案例不會有問題，但如果是將o轉為char就會有問題 

在執行`UnBoxing`如下圖 

可以看到原本存在`Heap`上值 我們會把他搬回`Stack`並附值給`J`

![](https://az787680.vo.msecnd.net/user/九桃/62a967a6-4b35-4ca6-a9d1-90318cd12cdc/1556535644_50214.png)

> 把`Heap`上直搬回`Stake`上就會遇到UnBoxing.

## .Net現實生活中常遇到的案例

* `String.Format`
* `DataTable`

### String.Format的Boxing

```c#
public static string Format(string format, params object[] args)
```

我們常使用上面`String.Format`重載方法,但使用這個方法會不小心遇到Boxing問題

我們在呼叫方法時假如參數是一個`Value Type`,`.Net`會在呼叫前把此值**複製**在傳入方法中(如果是`Refer Type`傳入此物件`Heap`記憶體位置).

`String.Format`吃參數是`Object`,所以如果傳入參數是`Value Type`如(`1`,`1.1m`)就會遇到`Boxing`.

> 但如果我們在呼叫`String.Format`前使用`ToString`方法就可以避免Boxing的動作,` $"{times.ToString()}"`.

### DataTable的Boxing UnBoxing

我們在`ADO.Net`將資料存放在`DataTable`就會經歷一次`Boxing`在利用`DataTable.Row[][]`返回是一個`Object`型態資料(因為會把ValueType型別資料放進Heap中).

我們在取用時會把`Object`轉成我們希望型態(UnBoxing).

```c#
DataTable dt= new DataTable();
dt.Rows[0]["col1"] //返回一個object型態的物件
```

> 所以我在讀取DB資料時建議使用`DataReader`而不是使用`DataTable`,因為使用DataReader可以直接去得使用型態(避免Boxing and UnBoxing).

## 小結

希望本篇文章可以讓大家對於Boxing和UnBoxing更了解，避免踏入這個問題中。

## 參考連結

> 參考 MSDN https://msdn.microsoft.com/zh-tw/library/yz2be5wk.aspx