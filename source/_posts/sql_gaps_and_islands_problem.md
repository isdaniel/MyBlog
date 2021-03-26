---
title: Gaps and Islands problem (SQL) 連續範圍
date: 2019-06-10 22:30:11
tags: [SQL,MSSQL,MySQL,Postgresql,SQL-Gaps-and-Islands-problem]
categories: [SQL]
---

## 前言：

SO 發現蠻多人有遇到 `Gaps and Islands problem`

[count of last continuous inserted records based on date](https://stackoverflow.com/questions/52059682/count-of-last-continuous-inserted-records-based-on-date) 

之前有跟大家分享過 解決連續範圍的思路  [[SQL連續範圍] 數字，日期連續範圍](https://dotblogs.com.tw/daniel/2018/03/27/180710)

今天針對發問者實際例子來一步步 解決問題...

提問出處:[count of last continuous inserted records based on date](https://stackoverflow.com/questions/52059682/count-of-last-continuous-inserted-records-based-on-date) 

-----

## 問題說明:

提問者希望可以獲得最近一次連續日期的次數

例如:

        user_id | point |   DateTime
        1       |   10  |   18-08-2018 17:15
        2       |   10  |   01-08-2018 17:15
        1       |   10  |   21-08-2018 17:15
        1       |   10  |   22-08-2018 17:15
        2       |   10  |   26-08-2018 17:15
        1       |   10  |   25-08-2018 17:15
        2       |   10  |   27-08-2018 17:15
        1       |   10  |   26-08-2018 17:15
        1       |   10  |   27-08-2018 17:15

有6筆資料是`user_id = 1`

希望取得`user_id = 1`最後一次連續日期數量是3

因為 這三筆是最近連續日期

    27-08-2018
    26-08-2018
    25-08-2018

-----

## 解決思路整理:

<div class="note note--important">連續資料有個特性就是一組(<span style="color:#FF0000;">連續範圍數值) - (基於某個條件順序產稱的數值)</span>  結果是一樣的</div>

1.  `user_id` 分群 並加上編號
2.  因為要基於日期找尋連續日期,所以使用一個小技巧 先找尋每個 `user_id `最小天數 (最大天數也可) ,之後使用`datediff `函數取得差一天數來當數值

我會使用sql-server來解說(因為支援window function) XD

-----

## 範例說明:

<span style="color:#FF0000;">基於某個條件順序產稱的數值  :</span><span style="color:#FF0000;"></span>先在子查詢中取得每個`user_id`最小日期,以便後面使用datediff函數取得間隔天數(產生編號)

```SQL
MIN(DateTime) over(partition by user_id order by DateTime )
```

<span style="color:#FF0000;">連續範圍數值 : </span>我使用 Row_number 和 Window function 依照每個使用者給編號.

```SQL
Row_number() over(partition by user_id order by DateTime)
```

之後使用diffdate函數 並將兩值相減取得

```SQL
SELECT DateTime,datediff(day, MIN(DateTime) over(partition by user_id order by DateTime ),DateTime) - Row_number() over(partition by user_id order by DateTime)rn
FROM  Table1
Where user_id = 1 
|             DateTime | rn |
|----------------------|----|
| 2018-08-18T17:15:00Z | -1 |
| 2018-08-21T17:15:00Z |  1 |
| 2018-08-22T17:15:00Z |  1 |
| 2018-08-25T17:15:00Z |  3 |
| 2018-08-26T17:15:00Z |  3 |
| 2018-08-27T17:15:00Z |  3 |
```

我們可以看到連續日期的分組已經出來了

有了這個連續編號 我們就可以直接取得我們要的結果了

```SQL
;with cte as (
    SELECT DateTime,datediff(day, MIN(DateTime) over(partition by user_id order by DateTime ),DateTime) - Row_number() over(partition by user_id order by DateTime)rn
    FROM  Table1
    Where user_id = 1 
)
SELECT TOP 1 count(*) cnt
FROM cte
group by rn
ORDER BY MAX(DateTime) desc
```

因為只要取得最近一筆連續日期資料 我們可以 `ORDER BY MAX(DateTime) `且使用`TOP 1`來取得最新一筆的連續數量

[SQLFiddle](http://sqlfiddle.com/#!18/8e977/20)

-----

## 小結:

使用window function後, 語法整個變得很簡單.(有興趣可以進SO連結看沒有使用window function的解法 露露長)

                