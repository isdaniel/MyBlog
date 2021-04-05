---
title: 那些年String.Format中的Boxing和UnBoxing
date: 2020-05-10 22:30:11
tags: [C#]
categories: [C#,Boxing-UnBoxing]
---

## 前言：

下面有兩個虛擬程式碼

```c#
int times = 30000000;
string s = string.Empty;

s = $"{times}";
s = $"{times.ToString()}";
```

請問下面這兩段程式碼有沒有差別?

```c#
s = $"{times}";
s = $"{times.ToString()}";
```

> `$""`這個程式碼是`string.Format()`語法糖

如果知道差別的同學,恭喜你已經可以下課了

如果不知道差別也沒關係,讓我細細講述.

## String.Format方法簽章

在`String.Format`方法有一個重載方法,可以看到裡面吃參數是`params object[]`這可以讓我們傳進東西當作參數(他會在方法中呼叫`ToString`方法).

```c#
public static string Format(string format, params object[] args)
```

所以這段程式碼看起來應該是要一樣,但事實並非如此...

```c#
s = $"{times}";
s = $"{times.ToString()}";
```

### $"{times}" vs $"{times.ToString()}"

在執行下面程式碼會發現兩段程式碼不管怎麼執行

執行時間`$"{times}";`永遠都會比`$"{times.ToString()}";`來的多

```c#
class Program
{
    static void Main(string[] args)
    {
        int times = 30000000;
        string s = string.Empty;
        Stopwatch sw = new Stopwatch();
        sw.Start();
        for (int i = 0; i < times ; i++)
        {
            s = $"{times}";
        }
        
        sw.Stop();
        Console.WriteLine(sw.ElapsedMilliseconds);

        sw.Restart();
        for (int i = 0; i < times ; i++)
        {
            s = $"{times.ToString()}";
        }
        sw.Stop();
        Console.WriteLine(sw.ElapsedMilliseconds);
        Console.ReadKey();
    }
}
```

執行時間如上圖

![img](https://i.imgur.com/NzlZgu1.png)

[Source Code](https://github.com/isdaniel/BlogSample/tree/master/src/Samples/Box_UnBoxing)

這是為什麼呢??

原因出在Boxing和UnBoxing上...

## Boxing 和 UnBoxing

在說`Boxing`和`UnBoxing`之前

我們要了解.Net中的`Refer Type`和`Value Type`在記憶體存放上差別.

> 想了解`Refer Type`和`Value Type`的人,可以參考我之前寫文章 [【C#】 參考類型 , 值類型 Equals方法 和 ==]().

假如已經了解`Refer Type`和`Value Type`,在.Net中有分Stack記憶體區段和Heap記憶體區段.

* Stack:存放Value Type(struct)資料
* Heap:存放Refer Type資料

### Boxing

因為在Boxing時我們會把`Value Type`資料**複製**一份資料到`Refer Type`記憶體中.

```c#
int i=20;
object o=(object)i;
```

上面程式碼大概會如下圖操作

![](https://dotblogsfile.blob.core.windows.net/user/%E4%B9%9D%E6%A1%83/62a967a6-4b35-4ca6-a9d1-90318cd12cdc/1556535346_2245.png)

> int強制轉型為object 因為我們所有物件都是繼承於object物件

### UnBoxing

至於`UnBoxing`動作就如下面程式碼

```c#
int i=20;
object o=(object)i;
int j=(int)o;
```

`UnBoxing`會將原本存在Heap的值,會把他搬回Stack並附值給`J`

![](https://dotblogsfile.blob.core.windows.net/user/%E4%B9%9D%E6%A1%83/62a967a6-4b35-4ca6-a9d1-90318cd12cdc/1556535644_50214.png)

> `o Object`強轉成`int`在這個案例不會有問題，但如果是將`o`轉為`char`就會有問題 

## (解答)String.Format兩個範例 效能差異

如果有從頭看到尾小夥伴,相信應該可以了解到問什麼會有沒有`.ToString`會造成差異性了吧.

因為`Boxing`會造成系統無形中消耗,如果我們先把傳入`Value Type`資料轉成`String`再傳入就可以避免`Boxing`問題.

