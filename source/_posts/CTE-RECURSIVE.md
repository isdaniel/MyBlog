---
title: [SQL Server] CTE RECURSIVE (遞迴)製作月曆
date: 2019-05-29 22:28:05
tags: [SQL,Tsql,MSSql,CTE,UNION ALL]
---

![](http://)如果要製作月報...但只有給起訖日

![pic](https://az787680.vo.msecnd.net/user/%E4%B9%9D%E6%A1%83/5cb059bd-5868-490a-a5fc-3b8f69aec405/1521377514_65506.PNG)

要產生出如下的列表 要怎麼辦...

![pic](https://az787680.vo.msecnd.net/user/九桃/5cb059bd-5868-490a-a5fc-3b8f69aec405/1521377621_11696.PNG)

第一個想到的解法 會使用 `WHILE  +  [暫存表] `迴圈遍歷 把每個月新增入暫存表中

程式碼如下:

```SQL
DECLARE  @t TABLE
(
    StartDate DATETIME,
	EndDate DATETIME
);

INSERT INTO @t
        ( StartDate, EndDate )
VALUES  ( '2017/01/01', -- StartDate - datetime
          '2018/01/01'  -- EndDate - datetime
          );

--宣告一個起始時間變數
DECLARE @TempStartDate DATETIME
DECLARE @TempEndDate DATETIME

--設置變數 最小時間(起始時間)  和 最大時間
SELECT @TempStartDate = StartDate,@TempEndDate=EndDate 
FROM @t

CREATE TABLE #TEMP(Dates DATETIME)

WHILE(@TempStartDate < @TempEndDate)
BEGIN
     --將資料新增入暫存表
     INSERT INTO #TEMP (Dates) VALUES (@TempStartDate)
     --每跑一次迴圈就加一個月
	 SELECT @TempStartDate = DATEADD(MONTH,1,@TempStartDate)
END 

SELECT * FROM #TEMP

DROP TABLE #TEMP
```

但這個解法雖然簡單..但程式碼又臭又長..

**Q: 有沒有更好看的解法又可達成目的呢?**

**ANS: 有!! 就是本次主角 CTE 遞迴**
 
 
話不多說先貼上程式碼

```SQL
DECLARE  @t TABLE
(
    StartDate DATETIME,
	EndDate DATETIME
);

INSERT  INTO  @t
        ( StartDate, EndDate )
VALUES  ( '2017/01/01', -- StartDate - datetime
          '2018/01/01'  -- EndDate - datetime
          );

;WITH CTE (Dates,EndDate) AS
(
	SELECT StartDate AS Dates,EndDate AS EndDate
	FROM @t
	UNION ALL --注意這邊使用 UNION ALL
	SELECT DATEADD(MONTH,1,Dates),EndDate
	FROM CTE 
	WHERE DATEADD(MONTH,1,Dates) < EndDate --判斷是否目前遞迴月份小於結束日期
)

SELECT CTE.Dates
FROM CTE
```

接下來解說 CTE遞迴原理 :

![PIC](https://az787680.vo.msecnd.net/user/九桃/5cb059bd-5868-490a-a5fc-3b8f69aec405/1521379674_85716.PNG)

可看到CTE中最主要執行四個步驟

1. 取得初始結果集並(錨點結果集) T(0)
2. 將T(0)結果集進行判斷是否滿足 DATEADD(MONTH,1,Dates) < EndDate 不滿足繼續走,並產生T(1)結果集,依照此結果集繼續往下執行
3. 在執行上面的2步驟 直到滿足條件 T(0),T(1).....T(n)
4. 傳回結果集。將之前所有產生結果集 UNION ALL。

**`使用CTE遞迴必須使用UNION ALL`**
 

最後CTE結果集就會呈現如下^^ 
![https://az787680.vo.msecnd.net/user/九桃/5cb059bd-5868-490a-a5fc-3b8f69aec405/1521377621_11696.PNG](https://az787680.vo.msecnd.net/user/九桃/5cb059bd-5868-490a-a5fc-3b8f69aec405/1521377621_11696.PNG)

此文同步發布在 : https://dotblogs.com.tw/daniel/2018/03/18/213231

**補充 oracle解法**

同場加映!! 

如果使用 *oracle* 可使用 **`connect by`** 很簡便取得日曆


```SQL
CREATE TABLE T
(
    StartDate DATE,
	EndDate DATE
);

INSERT INTO T( StartDate, EndDate ) VALUES  (date '2017-01-01',date '2018-01-01');

select add_months(trunc(StartDate,'mm'),level - 1 ) "Date"
   from T 
connect by trunc(EndDate,'mm') >= add_months(trunc(StartDate,'mm'),level)
  order by 1
```

> http://sqlfiddle.com/#!4/75cd9/14
