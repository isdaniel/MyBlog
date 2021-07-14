---
title: 高併發系統系列-使用lock & Interlocked CAS(compare and swap)
date: 2021-07-14 22:30:11
tags: [C#,atomic]
categories: [C#,atomic]
---

## 前言

在之前我有寫一篇關於資料庫的[ACID](https://isdaniel.github.io/acid/)分享RDBMS資料庫基本原則

假如我們系統是一個多執行續高併發系統也要注意Atomic不然會造成資料會有Data Racing導致bug產生..

## 沒有注意Atomic會導致的問題

我是我們公司擔任技術面試官之一，假如面試者說他實作過**高併發系統**。

我就會先問以下問題來辨別是否要更深入面試**高併發系統**相關問題.

下面Sample Code是這樣.

我用`Task`假裝高併發，下面有一個`Member`類別預設給100000元的Balance

有一個`UpdateBalance`每呼叫一次就扣10元，我透過`For`跑10000次

理論上我預期在跑完下面顯示Balance會員餘額是0 (因為 10000*10 = 100000).

```c#
class Program
{
	static void Main(string[] args)
	{
		Member member = new Member() { Balance = 100000 };
		List<Task> tasks = new List<Task>();
		for (int i = 0; i < 10000; i++)
		{
			tasks.Add(Task.Run(() => member.UpdateBalance()));
		}

		Task.WaitAll(tasks.ToArray());

		Console.WriteLine($"member remaining balance is {member.Balance}");
		Console.ReadKey();
	}
}

public class Member {
	public decimal Balance { get; set; }

	public void UpdateBalance()
	{
		Balance -= 10;
	}
}
```

![](https://i.imgur.com/44M2Jr7.png)

但執行後蠻常會是不等於0!!

這時我會問面試者兩個問題

* 為什麼會不等於0
* 如果要解決你會怎麼解決這個問題?

如果知道的人可以跳到CAS部分，如果不知原因我下面會跟大家分享

### 為什麼會不等於0

這個問題牽扯到Thread是如何對於變數操作的，Thread在操作變數之前會把資料複製一份進Thread Context中在操作我們要步驟

所以在`Balance -= 10;`這段程式碼會拆成下面動作

1. 將執行個體變數中的值載入至register。
2. 將載入值減10
3. 將異動後值放回原本值的Memory。

因為以上步驟，假如同一時間有兩個不同的Thread取到的Balance都是1000，並個別對於Balance減10元，我們原本預期這是兩個操作（預期資料為980）

但因為取的瞬間都是1000-10=990把數值放回變數中就導致少扣一個10元...

概念如下圖.

![](https://i.imgur.com/zXprOIe.png)

知道原因了要解決就簡單了.

### 使用Lock解決

因為這段程式碼遇到Data Raceing在同一個時間有兩個不同的Thread對於資料競爭

如果要避免競爭lock是一個比較方便的方式，他可以保證一瞬間只有一個Thread(Session)來執行某段程式碼(通常會放在異動資料那部分)來保證Isolation.

下面是使用lock版本的程式碼，能看到我在`Balance -= 10;`這一段使用lock來確保每一個瞬間只有一個Thread可以異動資料，其他的Thread需要blocking等他完成

```c#
class Program
{
	static object _lock = new object();
	static void Main(string[] args)
	{
		Member member = new Member() { Balance = 100000 };
		List<Task> tasks = new List<Task>();
		for (int i = 0; i < 10000; i++)
		{
			tasks.Add(Task.Run(() => member.UpdateBalance()));
		}

		Task.WaitAll(tasks.ToArray());

		Console.WriteLine($"member remaining balance is {member.Balance}");
		Console.ReadKey();
	}
}

public class Member {
	//here
	object _lock = new object();

	public decimal Balance { get; set; }

	public void UpdateBalance()
	{
		lock (_lock)
		{
			Balance -= 10;
		}
	}
}
```

使用lock之後能發現不管執行幾次資料都會如我們預期顯示.

使用lock執行概念圖如下.

在同一時間我們會把要執行程式 利用一個類似保護網的方式，確保同一時間只有一個Thread來做操作.

Thread2取得lock在操作Thread1就必須等待Thread2執行完,在取值=>改值..等等動作

![](https://i.imgur.com/BUCajHn.png)

> 只是使用lock會降低些許吞吐量(但資料正確性是最重要的)，所以要注意使用lock範圍大小

## CAS(compare and swap)提高效率

[CAS](https://zh.wikipedia.org/zh-tw/%E6%AF%94%E8%BE%83%E5%B9%B6%E4%BA%A4%E6%8D%A2)是利用compare and swap來確保資料Atomic.

在不同的語言

### 使用Interlocked提高效率

在C#中我們可以使用 [Interlocked](https://docs.microsoft.com/zh-tw/dotnet/api/system.threading.interlocked?view=net-5.0)這個類別

對於`Int`,`Long`相關操作都有封裝成method.

* `Exchange`:把值改成另一個數值 具有Atomic
* `Decrement`:把數值-- 具有Atomic
* `Increment`:把數值++ 具有Atomic

除了上面我們還可以針對Reference Type做Atomic有興趣的人在自行了解

```c#
class Program
{
	static object _lock = new object();
	static void Main(string[] args)
	{
		Stopwatch sw = new Stopwatch();
		int balanceValue = 10000000;
		Member member = new Member() { Balance = balanceValue };
		List<Task> tasks = new List<Task>();
		sw.Start();
		for (int i = 0; i < 1000000; i++)
		{
			tasks.Add(Task.Run(() => member.UpdateBalance()));
		}
		Task.WaitAll(tasks.ToArray());
		sw.Stop();
		Console.WriteLine("Lock Version");
		Console.WriteLine($"member remaining balance is {member.Balance}");
		Console.WriteLine($"Exec Time Cost : {sw.ElapsedMilliseconds}");

		tasks.Clear();
		member.Balance = balanceValue;
		sw.Restart();
		for (int i = 0; i < 1000000; i++)
		{
			tasks.Add(Task.Run(() => member.UpdateBalanceByInterlock()));
		}
		Task.WaitAll(tasks.ToArray());
		sw.Stop();
		Console.WriteLine("InterLocked Version:");
		Console.WriteLine($"member remaining balance is {member.Balance}");
		Console.WriteLine($"Exec Time Cost : {sw.ElapsedMilliseconds}");

		Console.ReadKey();
	}
}

public class Member {
	object _lock = new object();

	public int Balance { get; set; }

	public void UpdateBalance()
	{
		lock (_lock)
		{
			Balance -= 10;
		}
	}

	public void UpdateBalanceByInterlock()
	{
		int val = 0;
		Balance = Interlocked.Exchange(ref val, Balance -= 10);
	}
}
```

Interlocked效率會比較高是因為block會造成Thread的blocking等待浪費,但Interlocked核心概念是在這段話Atomic**取得資料跟原職比較(如果資料還沒改就把值修改進Memory中)**

所以效率就會比lock好很多

## 小結

在有些情境適合使用Lock(例如許多操作需要有一致的Atomic)就比較適合.

Interlocked適合用在對於數值的Atomic.

在多執行緒的世界中要顧慮的點真的很多，稍有不甚就會造成很多錯誤.

因為多執行緒有許多地方需要注意,不然執行效率會不如單執行緒.

我慢慢可以理解為什麼Redis,Node.js一開始要使用sigel Thread來運作了...