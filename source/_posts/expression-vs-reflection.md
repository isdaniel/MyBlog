---
title: Reflection在進化-淺談Expression表達式
date: 2021-04-06 22:30:11
tags: [C#,OOP,Reflection,Expression]
categories: [C#]
---

## 前言

稍微有經驗的.net工程師一定聽過或使用過Reflection,Reflection雖然好用(能動態處理很多事情)但對於效能會有些影響.

我能否擁有Reflection的動態彈性且兼顧效能呢?

有:就是我們這次要介紹的Expression.

## Expression vs Reflection performace

我會準備一個範例來比較`Expression`和`Reflection`效能差異

* `Expression`
* `Activator.CreateInstance`

### Activator.CreateInstance Code

`Activator.CreateInstance`沒甚麼好說就是一個靜態方法傳入`Type`動態產生一個物件

### Expression code

Expression程式碼如下,能發現只是為了建立一個物件需要寫一大堆程式碼(但這些程式碼對於追求效能的你是必須的)

```c#
delegate T Func<T>(params object[] args);

class Program
{
    //get a lambda method to create new object.
	public static Func<T> ExpressionCreator<T>()
	{
		ConstructorInfo ctor = typeof(T).GetConstructors().FirstOrDefault();
		Type type = ctor.DeclaringType;

		ParameterInfo[] paramsInfo = ctor.GetParameters();

		ParameterExpression param =
			Expression.Parameter(typeof(object[]), "args");

		Expression[] argsExp =
			new Expression[paramsInfo.Length];

		for (int i = 0; i < paramsInfo.Length; i++)
		{
			Expression index = Expression.Constant(i);
			Type paramType = paramsInfo[i].ParameterType;

			Expression paramAccessorExp =
				Expression.ArrayIndex(param, index);

			Expression paramCastExp =
				Expression.Convert(paramAccessorExp, paramType);

			argsExp[i] = paramCastExp;
		}

		NewExpression newExp = Expression.New(ctor, argsExp);

		LambdaExpression lambda = Expression.Lambda(typeof(Func<T>), newExp, param);

		return (Func<T>)lambda.Compile();
	}
}
```

產生出來Lambda程式碼如下,之後我們就可以透過此lambda來產生我們要物件摟

```c#
.Lambda #Lambda1<ConsoleWeb.Func`1[ConsoleWeb.A]>(System.Object[] $args) {
    .New ConsoleWeb.A()
}
```

## BenchmarkDotNet分析

Sample Project放在[GitHub ExpressionVsReflection](https://github.com/isdaniel/BlogSample/tree/master/src/Samples/ExpressionVsReflection)

```c#
public delegate T Func<T>(params object[] args);
public class ObjectProvider
{

	private static ConcurrentDictionary<string,Delegate> _mapFunc = new ConcurrentDictionary<string, Delegate>();

	public static T ReflectionCreator<T>(params object[] args)
		where T : class
	{
		return Activator.CreateInstance(typeof(T), args) as T;
	}

	public static Func<T> ExpressionCreator<T>()
	{
		var key = typeof(T).Name;

		if (!_mapFunc.TryGetValue(key, out Delegate result))
		{
			ConstructorInfo ctor = typeof(T).GetConstructors().FirstOrDefault();

			ParameterInfo[] paramsInfo = ctor.GetParameters();

			ParameterExpression param =
				Expression.Parameter(typeof(object[]), "args");

			Expression[] argsExp =
				new Expression[paramsInfo.Length];

			for (int i = 0; i < paramsInfo.Length; i++)
			{
				Expression index = Expression.Constant(i);
				Type paramType = paramsInfo[i].ParameterType;

				Expression paramAccessorExp =
					Expression.ArrayIndex(param, index);

				Expression paramCastExp =
					Expression.Convert(paramAccessorExp, paramType);

				argsExp[i] = paramCastExp;
			}

			NewExpression newExp = Expression.New(ctor, argsExp);

			LambdaExpression lambda = Expression.Lambda(typeof(Func<T>), newExp, param);

			result = lambda.Compile();

			_mapFunc.GetOrAdd(key, result);
		}


		return (Func<T>)result;
	}
}
```

``` ini

BenchmarkDotNet=v0.12.1, OS=Windows 10.0.18363.1440 (1909/November2018Update/19H2)
Intel Core i7-9700 CPU 3.00GHz, 1 CPU, 8 logical and 8 physical cores
  [Host]     : .NET Framework 4.8 (4.8.4250.0), X86 LegacyJIT DEBUG  [AttachedDebugger]
  ShortRun   : .NET Framework 4.8 (4.8.4250.0), X86 LegacyJIT
  Job-ZMUHMP : .NET Framework 4.8 (4.8.4250.0), X86 LegacyJIT

|                            Method |         Mean |    StdDev |      Error |  Gen 0 | Gen 1 | Gen 2 | Allocated |
|---------------------------------- |-------------:|----------:|-----------:|-------:|------:|------:|----------:|
|  &#39;ExpressionCreator no parameter&#39; |     54.87 ns |  0.111 ns |   2.021 ns |      - |     - |     - |         - |
| &#39;ExpressionCreator had parameter&#39; |     77.08 ns |  0.511 ns |   9.314 ns | 0.0076 |     - |     - |      40 B |
|  &#39;ReflectionCreator no parameter&#39; |    463.32 ns |  2.229 ns |  40.667 ns | 0.0318 |     - |     - |     168 B |
| &#39;ReflectionCreator had parameter&#39; |    604.89 ns | 13.413 ns | 244.710 ns | 0.0426 |     - |     - |     224 B |
```

上面顯示使用Expression效能比起使用Reflection有明顯提升.

### Expression小提醒

> 如果使用Expression或Emit技術時,產生的程式碼(委派)記得使用Cache存放起來,因為如果每次執行都運算Compile效能反而會比Reflection還要更差.

如果沒有使用Cache來執行Expression效率就大大降低甚至比Reflection還要差.

```
|                            Method |         Mean |    StdDev |       Error |  Gen 0 |  Gen 1 | Gen 2 | Allocated |
|---------------------------------- |-------------:|----------:|------------:|-------:|-------:|------:|----------:|
|  &#39;ReflectionCreator no parameter&#39; |     464.3 ns |   5.30 ns |    96.70 ns | 0.0318 |      - |     - |     168 B |
| &#39;ReflectionCreator had parameter&#39; |     586.2 ns |   0.40 ns |     7.25 ns | 0.0426 |      - |     - |     224 B |
| &#39;ReflectionCreator had parameter&#39; |  10,000.0 ns |   0.00 ns |          NA |      - |      - |     - |         - |
|  &#39;ReflectionCreator no parameter&#39; |  11,500.0 ns |   0.00 ns |          NA |      - |      - |     - |         - |
|  &#39;ExpressionCreator no parameter&#39; |  45,225.3 ns |  64.40 ns | 1,174.88 ns | 0.4883 | 0.4069 |     - |    2909 B |
| &#39;ExpressionCreator had parameter&#39; |  67,297.9 ns | 522.99 ns | 9,541.35 ns | 0.5697 | 0.4883 |     - |    3324 B |
| &#39;ExpressionCreator had parameter&#39; | 339,900.0 ns |   0.00 ns |          NA |      - |      - |     - |         - |
|  &#39;ExpressionCreator no parameter&#39; | 352,500.0 ns |   0.00 ns |          NA |      - |      - |     - |         - |
```

### 常用Expression解說

透過上面範例,能發現Expression核心概念是用來產生Delegate程式碼並呼叫使用.

> 因為動作最小單位是**方法**,委派可以視做**方法**

* Expression.Call 呼叫委派方法
  * Note:如果呼叫static方法第一個參數是null
* Expression.Assign 對於Expression給值 ex: expression1 = expression2
* Expression.Block  大括號區域 ex:`{}`
* Expression.Convert 轉型
* Expression.Multiply 乘法
* Expression.Bind 綁定物件屬性,成員
* Expression.MemberInit 建構子成員初始化
* (BinaryExpression)
  * Expression.GreaterThanOrEqual:大於等於
  * Expression.GreaterThan:大於
  * Expression.LessThanOrEqual:小於等於
  * Expression.LessThan:小於
* Expression.Lambda 封裝成方法
* Expression.New 建立New語法

#### ArrayAccess vs ArrayIndex

* ArrayIndex 是只讀Index
* ArrayAccess 可讀可寫

> https://stackoverflow.com/questions/14973813/arrayaccess-vs-arrayindex-in-expression-tree

## 小結

Expression和Emit雖然難寫,但寫的好可以讓程式碼更有彈性且比Reflection更有效能,Expression在許多知名架構都有使用(包含微軟MVC框架也是使用Reflection + Expression來優化),舉一個例子動態代理就很適合使用`Expression`或`Emit`來優化.

> 知名動態代理框架[castle](https://github.com/castleproject/Core)有使用到Emit.

Emit想要解決的問題和Expression類似,只是Emit提供更多底層API讓我們呼叫(比Expression可以控制更多細節)

> Emit可以寫類似IL程式語法

想必然Emit寫起來也更繁瑣更容易出錯.

所以了解Expression是前往.net進階工程師必經之路.