---
title: Asp.net HttpHandler vs HttpModule 詳細解說.
date: 2019-06-11 19:16:37
tags: [C#,thread,concurrent]
categories: [C#,thread]
---
## 前言

假如有一個面試題目是

* 目前有三個Thread 每個Thread個別負責Print "A","B","C"
* 要求:利用三個Thread並按照A,B,C順序打印出20次資訊,中間不能錯號

    ex:
    A
    B
    C
    A
    B
    C

程式碼框架如下，在Main函式建立3個Threads分別負責A,B,C字母打印

```c#
class Program
{
    static void Main(string[] args)
    {
        Alternate c = new Alternate();
        var t1 = new Thread(c.CallA);
        var t2 = new Thread(c.CallB);
        var t3 = new Thread(c.CallC);

        t1.Start();
        t2.Start();
        t3.Start();

        t1.Join();
        t2.Join();
        t3.Join();

        Console.ReadKey();
    }
}
public class Alternate
{
    public void CallA()
    {
        for (int i = 0; i < 20; i++)
        {
            Console.WriteLine("A");
        }
        
    }

    public void CallB()
    {
        for (int i = 0; i < 20; i++)
        {
            Console.WriteLine("B");
        }

    }
    public void CallC()
    {
        for (int i = 0; i < 20; i++)
        {
            Console.WriteLine("C");
        }
    }
}
```

因為Thread被呼叫順序是由OS跟CPU來決定，目前執行如下圖所以目前打印出來的順序是無序的

![](https://i.imgur.com/j6mNk2W.png)

期望可以打印出如下圖

![](https://i.imgur.com/9FAhwA3.png)

> 讓Thread可以有順的執行打印.

假如是你會怎麼做?

## 問題分析

如果要完成上面需求，我們會希望程式如下執行

* 在執行ThreadA時，ThreadB,ThreadC在等待，執行完ThreadA時呼叫ThreadB起來動作
* 在執行ThreadB時，ThreadC,ThreadA在等待，執行完ThreadB時呼叫ThreadC起來動作
* 在執行ThreadC時，ThreadB,ThreadA在等待，執行完ThreadC時呼叫ThreadA起來動作

![](https://i.imgur.com/v5OlGWV.png)

核心動作:每個瞬間只有一個Thread可以動作，執行完呼叫下一個Thread做事情，自己在進行等待喚醒

如果你有建構多執行緒系統的話，看到上面動作應該就知道本題的核心類別是哪個了吧?

沒錯就是[EventWaitHandle](https://docs.microsoft.com/zh-tw/dotnet/api/system.threading.eventwaithandle?view=net-5.0)

## EventWaitHandle

如果要談起`AutoResetEvent`就不得不提下面兩個類別

* AutoResetEvent:執行緒同步處理事件會在發出訊號時，釋出**一個等候執行緒**之後就**自動重設**
* ManualResetEvent:執行緒同步處理事件可以釋出**多個等候執行緒**，收到訊號時**必須手動重設** ，不然其他執行緒會直接放行

我用現實生活中例子來解釋`AutoResetEvent`跟`ManualResetEvent`

* AutoResetEvent:捷運或火車的閘門一次只能放行一個並在放行完後會馬上關門
* ManualResetEvent:大門必須要是手動關閉房門，不然就會一直放行別人通過

我先來說說為什麼可以透過`EventWaitHandle`來解決問題.

一樣我們把要完成的思路先畫出來，假如我們可以在每一個Thread跟Thread之間設定一個閘門(圖中的小框框)，每次呼叫完就把下一關閘門打開叫醒另一個Thread去做事情（在把之前的閘門關起來等待
上一位呼叫）

![](https://i.imgur.com/DUFMMqs.png)

例如：

現在ThreadA剛剛執行完(打印出`A`)接著會去叫醒ThreadB做事情後，ThreadA繼續等待ThreadC做完事情叫他.

上面情境就需要使用`AutoResetEvent`來當作我們閘門跟叫醒Thread動作.

## 問題解答

本次我使用到`AutoResetEvent`兩個常用的method.

* WaitOne:Blocking目前Thread，直到目前WaitHandle收到訊號為止。
* Set:將事件的狀態設定為未收到信號，讓一個或多個等候執行緒繼續執行。

簡單來說`AutoResetEvent`就是閘門

`WaitOne`幫助我們達成Thread Blocking動作(等待被喚醒),而喚醒交由`Set`別人呼叫你`WaitOne`的AutoResetEvent.

按照上面的圖我們會需要使用到三個`AutoResetEvent`(三個閘門)

另外我們需要知道目前在哪一個閘門，所以有一個Index變數（我們有看到他使用`volatile`關鍵字）有興趣在自行尋找用處因為不是本次重點我就不說明了.

我們把

* ThreadA執行當作Index = 1
* ThreadB執行當作Index = 2
* ThreadC執行當作Index = 3

所以在一開始判斷是否是自己要執行Index，如果不是就等待被呼叫.

按照一開始例子我們設定index = 1，所以`CallA`動作不會被Blocking，就會接續打印出`A`並看到`notifyB.Set();`會叫醒`ThreadB`並且把Index設定成2

因為Index = 2，所以再一次跑迴圈ThreadA就會進行blocking，後面動作以此類推就會出現我們要的答案

![](https://i.imgur.com/9FAhwA3.png)

```c#
public class Alternate {

    AutoResetEvent notifyA = new AutoResetEvent(false);
    AutoResetEvent notifyB = new AutoResetEvent(false);
    AutoResetEvent notifyC = new AutoResetEvent(false);
    
    private volatile int index = 1;
	public void CallA()
	{
		for (int i = 0; i < 20; i++)
		{
			if (index != 1)
				notifyA.WaitOne();

			Console.WriteLine("A");
			index = 2;
			notifyB.Set();
		}

	}

	public void CallB()
	{
		for (int i = 0; i < 20; i++)
		{
			if (index != 2)
				notifyB.WaitOne();

			Console.WriteLine("B");
			index = 3;
			notifyC.Set();
		}

	}
	public void CallC()
	{
		for (int i = 0; i < 20; i++)
		{
			if (index != 3)
				notifyC.WaitOne();

			Console.WriteLine("C");
			Console.WriteLine("------------------------------");
			index = 1;
			notifyA.Set();
		}
	}
}
```

## 重購版本

上面那個本版雖然可以很好的完成需求，程式碼有很多重複的地方且可擴展性不佳.

下面版本是重購後的我們可以在`Alternate`建構子中撰寫對應列表(每個Thread要被誰喚醒跟做完事情要叫誰)，並給上相對應編號來查找

```c#
 public class Alternate {
    private class NotifyMap {
        public AutoResetEvent Wait { get; set; } 
        public AutoResetEvent Notify { get; set; }
    }
    private Dictionary<int, NotifyMap> _notifyMapping;
    private volatile int index = 0;

    AutoResetEvent notifyA = new AutoResetEvent(false);
    AutoResetEvent notifyB = new AutoResetEvent(false);
    AutoResetEvent notifyC = new AutoResetEvent(false);
    
    public Alternate()
    {
        _notifyMapping = new Dictionary<int, NotifyMap>
        {
            { 1, new NotifyMap{ Wait = notifyA, Notify = notifyB} },
            { 2, new NotifyMap{ Wait = notifyB, Notify = notifyC} },
            { 3, new NotifyMap{ Wait = notifyC, Notify = notifyA} }
        };

    }


    public void Call(CallerInfo caller)
    {
        for (int i = 0; i < 20; i++)
        {
            var key = index % _notifyMapping.Count + 1;
            var notifyMap = _notifyMapping[caller.Index];
            if (key != caller.Index)
                notifyMap.Wait.WaitOne();
            Console.WriteLine($"{caller.Name}");
            index++;
            notifyMap.Notify.Set();
        }
    }
}
```

經過重購後程式碼就變得簡單許多了.

## 小結

在multithread世界中我們要注意細節越來越多，本次介紹的`AutoResetEvent`可以用運的地方非常多（假如你有多個Thread需要順序執行）

因為Thread的呼叫順序我們不能掌控就必須考這個機制來幫我們完成.

[程式碼](https://github.com/isdaniel/BlogSample/tree/master/src/Samples/EventWaitHandleSample)我放在有需要可以拿去使用看看