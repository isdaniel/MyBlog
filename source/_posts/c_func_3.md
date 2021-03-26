---
title: (C#)委託delegate,Func<>,Action 解說系列(三)
date: 2019-06-02 11:12:43
tags: [C#,Func,Delegate]
categories: [C#,Delegate]
---

## 前文：

在Func和Action泛型委託中 有 In , Out 兩個關鍵字

那到底是神麼意思呢?  

讓我們一起看下去....

    //Action delegate
    public delegate void Action<in T>(T obj);

    //fun delegate
    public delegate TResult Func<in T, out TResult>(T arg);

上面程式碼我列出`Action`和`Func` 委派方法各其中一個重載

我們可以發現到泛型中有關鍵字 `in` 和 `out` 這是代表神麼意思呢?

讓我們繼續看下去.....

### 解說：

分享前先探討一個問題 泛型是否可以父類別指向子類別

    public interface IGeneric<T> { }
    public class Base<T> : IGeneric<T> { }

    public class A { }

    class Program
    {

        static void Main(string[] args)
        {
            IGeneric<object> b = new Base<object>();
            IGeneric<A> a = new Base<A>();
            //無法執行父類只向子類別 因為泛型預設是Invariance
            b = a;
            Console.ReadKey();
        }
    }

上面範例程式很清楚知道無法編譯，那我要怎麼處理和解決的？

第一種解法 使用 `AS` :

    public interface IGeneric<T> { }
    public class Base<T> : IGeneric<T> { }

    public class A { }

    class Program
    {

        static void Main(string[] args)
        {
            IGeneric<object> b = new Base<object>();
            IGeneric<A> a = new Base<A>();
            //使用AS來轉型
            b = a as IGeneric<object>;
            Console.ReadKey();
        }
    }

第二種解法 在`interface`的泛型中使用 `Out` (今天要介紹的主角)

    //這裡使用out將T 解釋為Covariance
    public interface IGeneric<out T> { }
    public class Base<T> : IGeneric<T> { }

    public class A { }

    class Program
    {

        static void Main(string[] args)
        {
            IGeneric<object> b = new Base<object>();
            IGeneric<A> a = new Base<A>();
            //在上面的泛型用out
            b = a;
            Console.ReadKey();
        }
    }

### 三個重要名詞 `Covariance，Contravariance，Invariance`

MSDN中有解釋 此關鍵字 泛型中的共變數和反變數

`Covariance`(共變數) ：

> MSDN說明：可讓您使用比原本指定更多衍生的類型。您可以將 IEnumerable<Derived> (在 Visual Basic 中為 IEnumerable(Of Derived)) 的執行個體指派給 IEnumerable<Base> 類型的變數
簡單說明：泛型支援父類指向子類別  [泛型中使用out ]  (支援泛型介面或泛型委派)
如下面的範例:

因`IGeneric<out T>`所以下面a付值給b就不需轉型

    //這裡使用out將T 解釋為Covariance
    public interface IGeneric<out T> { }
    public class Base<T> : IGeneric<T> { }

    public class A { }

    class Program
    {

        static void Main(string[] args)
        {
            IGeneric<object> b = new Base<object>();
            IGeneric<A> a = new Base<A>();
            //在上面的泛型用out
            b = a;
            Console.ReadKey();
        }
    }

`Contravariance`(反變數)

> MSDN說明：可讓您使用比原本所指定更泛型 (較少衍生) 的類型。您可以將 IEnumerable<Base> (在 Visual Basic 中為 IEnumerable(Of Base)) 的執行個體指派給IEnumerable<Derived> 類型的變數。

簡單說明：可將父類物件引用賦予給子類別 **[泛型中有in]** 
如下範例：

因`IComparer<in T>` 所以子類可以取得父類的引用

    //這裡使用in將T 解釋為Contravariance
    public interface IGeneric<in T> { }

    public class Base<T> : IGeneric<T> { }

    public abstract class Shape
    {
        public virtual double Area { get { return 0; } }
    }

    public class Square : Shape
    {
        private double r;
        public Square(double radius) { r = radius; }
        public double Radius { get { return r; } }
        public override double Area { get { return r * r; } }
    }

    public class Circle : Shape
    {
        private double r;
        public Circle(double radius) { r = radius; }
        public double Radius { get { return r; } }
        public override double Area { get { return Math.PI * r * r; } }
    }

    public class ShapeAreaComparer : IComparer<Shape>
    {
        int IComparer<Shape>.Compare(Shape a, Shape b)
        {
            if (a == null) return b == null ? 0 : -1;
            return b == null ? 1 : a.Area.CompareTo(b.Area);
        }
    }

    class Program
    {

        static void Main(string[] args)
        {
            //泛型[形狀類別(基類)]
            IGeneric<Shape> b = new Base<Shape>();
            //泛型[圓形類別(子類)]
            IGeneric<Circle> a = new Base<Circle>();
            //子類可以取得父類引用
            a = b;
            Console.ReadKey();
        }
    }
 
`Invariance` 只能該類別指向該類別
一般泛型預設就是這個

-----

## 總結：

`Func` 泛型委派的最後一個泛型類型參數會指定委派簽章中的傳回值類型

`Covariance` (共變數) (`out` 關鍵字) 泛型支援父類指向子類別

`Contravariant` (反變數) (`in` 關鍵字)  泛型子類可以取得父類的引用

`Invariance` 一般泛型預設就是這個

[泛型中的共變數和反變數](https://msdn.microsoft.com/zh-tw/library/dd799517(v=vs.110).aspx)

[out (generic modifier) (C# Reference)](https://docs.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/out-generic-modifier)