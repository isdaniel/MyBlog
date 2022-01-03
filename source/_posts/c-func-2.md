---
title: (C#)委託delegate,Func<>,Action 解說系列(二)
date: 2019-06-02 11:06:40
tags: [C#,Func,Delegate]
categories: [C#,Delegate]
---

## 前文：

這個文章和大家分享解說 Func<>和Action<>

最後帶著大家來實現自己的`Linq Where`

先來看 `Func<> ，Action<>`原始定義

我們發現`Func<> ，Action<>` 其實本質就是委託 ，雖然有十幾個重載 但大同小異

    public delegate TResult Func<out TResult>();

    public delegate void Action<in T>(T obj);
 
`Func`固定最後一個泛型參數為方法回傳值，其餘是傳入參數

    public delegate TResult Func<in T, out TResult>(T arg);

### 解說Func：

宣告一個`Func<Person,string>`委託 `_thunkCheckAge`
`_thunkCheckAge`委託指向`CheckAge`方法
執行`_thunkCheckAge`委託 (執行`CheckAge`方法)

    public class Person
    {
        public int Age { get; set; }
        public string Name { get; set; }
    }

    /// <summary>
    /// 年紀超過10歲算老人
    /// </summary>
    /// <param name="person"></param>
    /// <returns></returns>
    public static string CheckAge(Person person)
    {
        string result = "年紀剛剛好";
        if (person.Age >= 10)
        {
            result = "老人";
        }
        return result;
    }
    static void Main(string[] args)
    {
        //Init一個Person物件
        Person p = new Person()
        {
            Age = 10,
            Name = "tom"
        };

        #region Func
        //宣告一個Func<Person,string>委託 _thunkCheckAge
        Func<Person, string> _thunkCheckAge;

        //_thunkCheckAge委託指向CheckAge方法
        _thunkCheckAge = new Func<Person, string>(CheckAge);

        //執行_thunkCheckAge委託 (執行CheckAge方法)
        string result = _thunkCheckAge(p);

        //最後將結果顯示出來
        Console.WriteLine(result); 
        #endregion
        Console.ReadKey();
    }

### 解說 Action：

`Action`這個委託是`Void`，傳入參數型態是由泛型來決定

    public delegate void Action<in T>(T obj);
    
宣告一個`Action<Person>`委託的 `_thunkPerson`物件
將`CallPersonInfo`方法 賦予給`_thunkPerson`
執行`_thunkPerson` (就是執行`CallPersonInfo`方法)

    public class Person
    {
        public int Age { get; set; }
        public string Name { get; set; }
    }
    static void Main(string[] args)
    {
        //宣告_thunkPerson為Action<Person>委託
        //此Action傳入參數是Person由泛型來決定
        Action<Person> _thunkPerson;
        //Init一個Person物件
        Person p = new Person()
        {
            Age = 10,
            Name = "tom"
        };
        //將CallPersonInfo方法 賦予給_thunkPerson
        _thunkPerson = new Action<Person>(CallPersonInfo);

        //執行_thunkPerson (就是執行CallPersonInfo方法)
        _thunkPerson(p);
        Console.ReadKey();
    }

    public static void CallPersonInfo(Person person)
    {
        Console.WriteLine($"Age:{person.Age} Name:{person.Name}");
    }

### 小總結：

Action``和`Func`差別是

* `Action`是`void`不回傳值得委託
* `Func`是有回傳值得委託

有了以上的基礎，我們就來實現我們自己的`Linq Where` 和 `Linq Select`

先來分析 `Where` 方法簽章

    public static IEnumerable<TSource> Where<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate)

### 分析：

如果我要找一個大於10歲的人,撰寫一般Linq Where 如下在where中塞選此集合的條件，那我要怎麼自己實現呢？

重點在於**[執行塞選條件]**這個動作

    List<Person> pList = new List<Person>()
    {
        new Person() { Age=100,Name="daniel"},
        new Person() { Age=20,Name="Tom" },
        new Person() { Age = 10,Name = "Amy"},
        new Person() { Age=5,Name = "rjo"}
    };
    pList.Where(per => per.Age > 10);

以下是實現自己的`Where`語法 有沒有很簡單!

重點在`if(where(item))` 判斷物件是否符合條件，如符合就回傳此物件

    public static class LinqExtension
    {
        /// <summary>
        /// 自訂一個Where 
        /// </summary>
        /// <typeparam name="TSource"></typeparam>
        /// <param name="source"></param>
        /// <param name="where"></param>
        /// <returns></returns>
        public static IEnumerable<TSource> MyWhere<TSource>(this IEnumerable<TSource> source
            ,Func<TSource, bool> where)
        {
            foreach (var item in source)
            {
                if (where(item))
                {
                    yield return item;
                }
            }
        }
    }

-----

## 總結：

委託把不確定的動作，轉移給呼叫端來撰寫。  

而不是寫死在程式中

上面的`MyWhere`挖了一個洞，關於判斷是否符合條件，給呼叫端實現

雖然在裡面一樣是一個一個判斷是否符合條件，符合再返回，但利用委託和泛型就可以對於任何條件和任何型別來做比較　大大提升了程式效率

[原始碼範例](https://github.com/isdaniel/DelegateSimple)