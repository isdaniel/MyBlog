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

這是為什麼呢??

原因出在Boxing和UnBoxing上...


## Boxing 和 UnBoxing.