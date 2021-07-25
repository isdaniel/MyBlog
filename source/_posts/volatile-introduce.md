---
title: 多執行緒系統中不得不知-volatile
date: 2021-07-25 22:31:09
tags: [C#,volatile]
categories: [C#,volatile]
---

## 前言

假如你寫過多執行緒系統一定會看過`volatile`，但你對他的了解有多少？

MSDN對於[volatile](https://docs.microsoft.com/zh-tw/dotnet/csharp/language-reference/keywords/volatile)關鍵字解釋如下.

> volatile 關鍵字指出某個欄位可能是由同時執行的多個執行緒所修改。 編譯器、執行階段系統，甚至硬體都有可能基於效能因素，而重新排列對記憶體位置的讀取和寫入。 宣告為 volatile 的欄位不受限於這些最佳化考量。 加入 volatile 修飾詞可確保所有的執行緒都會依執行寫入的順序，觀察任何其他執行緒所執行的暫時性寫入。

MSDN上寫一堆文謅謅的解釋，如果沒有相對應OS或底層概念會很難理解上面敘述

## volatile 三大特性

這裡我先總結`volatile`三大特性

1. `volatile`修飾的變數具有**可見性**
2. `volatile`避免指令優化重排
3. `volatile`**不保證Atomic**

本文會針對這三大特性來一一解釋

> 注意在執行本文程式碼時要把Build Mode改成Release.

## volatile令變數具有可見性 & volatile避免指令優化重排

下面有段程式碼.

有一個`member`物件初始數值`Balance=100`，建立一個Thread裡面會把`member`物件的餘額成0

在Main Thread中`while (member.balance > 0)`有一段程式會等待`member.balance=0`跳出迴圈.

預期在程式最後印出`執行結束!`

但如果您使用Release Mode來跑會發現

![](https://i.imgur.com/1nZBMSC.png)

最後一行`執行結束!`不會如預期印出來..

```c#
class Program
{
    static void Main(string[] args)
    {
        
        Member member = new Member();
        new Thread(()=>{
            
            System.Console.WriteLine($"Sleep 前~ 餘額剩下:{member.balance}");
            member.UpdateBalance();
            System.Console.WriteLine($"Sleep 結束! 餘額剩下:{member.balance}");
        }).Start();
        
        while (member.balance > 0)
        {
            //等待sub thread把balance改成0跳出迴圈
        }   

        Thread.Sleep(50);
        Console.WriteLine("執行結束!");
        Console.ReadKey();
    }
}

public class Member
{
    public int balance = 100;
    public void UpdateBalance()
    {
        balance = 0;  
    }
}
```

### 解釋volatile可見性 & 指令優化重排

每個Thread對於變數操作，會先把Memory記憶體中的變數Copy一份到記憶體中並執行操作，操作完畢再重新寫入Memory中.

概念大致如下圖

![](https://i.imgur.com/zXprOIe.png)

所以這就會導致一個問題，假如ThreadA對於變數做異動，但ThreadB不會被通知

一般來說Release Mode，會把程式語言優化(包含一些CPU指令)，所以在multiple-Thread 系統中可能就會遇到一些不預期問題(如此範例)

所以依照上面特性我來總結解釋一下

* 一開始Main Thread跟sub Thread在取得Balance都是100
* sub Thread更新餘額成為0，但Main Thread沒有更新(還是100)
* Main Thread進入無限迴圈導致出不來.

### 使用 volatile 解決問題

解決上面問題我們只需要在`balance`上加一個`volatile`就好!

```c#
public class Member
{
    public volatile int balance = 100;
    public void UpdateBalance()
    {
        // sub thread update balance to 0
        balance = 0;  
    }
}
```

![](https://i.imgur.com/RaSL8k4.png)

執行結果如上，能看到程式可以正常結束了

還記得我一開始的總結前兩條嗎

1. `volatile`修飾的變數具有**可見性**
2. `volatile`避免指令優化重排

使用`volatile`會告訴編譯器別嘗試優化，使用此變數程式碼，無論是讀取還是寫入，都在主記憶體操作。

所以當呼叫`UpdateBalance`(`balance = 0;`) 方法時此異動在Main Thread就會看到Memory `balance = 0`所以就跳出迴圈.

## volatile 不保證Atomic

雖然volatile讓變數具有可見性，但不保證Atomic（原子性），這是甚麼意思？

我一樣用下圖來解釋來解釋.

![](https://i.imgur.com/zXprOIe.png)

在每個Thread要異動變數都會將數值Copy進Thread中進行修改在異動,就算目前有可見性,但我們不能保證修改指令具有原子性

所以可能造成兩個Thread剛好對於一個數值或物件異動造成Data Racing.

> 如果要解決此問題可以參閱 [高併發系統系列-使用lock & Interlocked CAS(compare and swap)](https://isdaniel.github.io/high-concurrency-atomic-cas-algorithm/)

下面的範例來演示我說的問題

```c#
class Program
{
    static void Main(string[] args)
    {
        
        NoAtomicMember m = new NoAtomicMember();
        List<Task> tasks = new List<Task>();

        for (var i = 0; i < 10; i++)
        {
            tasks.Add(Task.Run(()=>{
                for (var i = 0; i < 10000; i++)
                {
                    m.AddBalance();
                }
            }));
        }
        Task.WaitAll(tasks.ToArray());

        System.Console.WriteLine(m.balance);
        Console.ReadKey();
    }
}
public class NoAtomicMember{
        public volatile int balance = 0;
        public void AddBalance(){
            balance+=10;
        }
}
```

![](https://i.imgur.com/pUqN5ii.png)

我這個例子使用10個Task來模擬高併發動作,對於同一個數值做新增餘額10000次

理論上我們預期Balance要是10w，但每次執行的結果都不是10w且數值都不一樣，這個問題在正式環境很嚴重.

我們可以使用lock來避免同一時間會有多個Thread對於同一個物件修改

```c#
public class NoAtomicMember{
        public int balance = 0;
        object _sync = new object();
        public void AddBalance(){
            lock(_sync){
                balance+=10;
            }
        }
}
```

修改後結果如下

![](https://i.imgur.com/fszxx6X.png)

## 區域變數或參考型別使用volatile

如果是區域變數或參考型別`volatile`關鍵字就無法使用,這時候我們可以使用下面兩個method來替代使用.

* `Thread.VolatileRead`
* `Thread.VolatileWrite`

下面是`VolatileRead`,`VolatileWrite`原始碼

能發現在裡面都有呼叫`MemoryBarrier`方法.

> `MemoryBarrier`保證我們程式可見性，概念跟volatile一樣清除cache直接讀取主要Memory資料.

```c#
public static Object VolatileRead(ref Object address)
{
    Object ret = address;
    //呼叫組語load 禁止指令重排  從Memory拿到最新資料
    MemoryBarrier(); // Call MemoryBarrier to ensure the proper semantic in a portable way.
    return ret;
}

public static void VolatileWrite(ref Object address, Object value)
{
    //呼叫組語store 禁止指令重排
    MemoryBarrier(); // Call MemoryBarrier to ensure the proper semantic in a portable way.
    address = value;
}
```

## 小結

在多執行緒系統中我建議常異動的變數要使用`volatile`來保證每個Thread讀,寫資料是正確

![](https://i.imgur.com/lMx2FJI.png)

發現在我們常用的Console類別,運用許多`volatile`來達到Thread互相資料可見性.

但也要注意`volatile`**不保證Atomic**，所以如果有Atomic需求記得要使用CAS或Lock來處理.

另外`volatile`也不是萬靈丹,既然可以提高可見性想必對於系統會有多一些負擔,所以還是要看情況來使用.
