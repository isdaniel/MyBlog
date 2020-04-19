---
title: 影響Query Optimizer產生執行計畫的關鍵(統計值)
date: 2020-02-26 23:10:43
tags: [DataBase,Turning,Sql-server]
categories: [DataBase,Turning]
---

## 什麼是統計值

SQL Server的QO(Query Optimizer)透過`cost-based model`來選擇一個最合適計畫(估算成本最低)來執行查詢

>　注意每個執行計畫是使用CPU來做估算，使用過的執行計畫一般會Cache起來已便下次使用

QO會依照基數估計(Cardinality estimation)來產生執行計畫，基數估計扮演一個很重要的角色

SQL Server統計值是對於每個Index或欄位資料分布做紀錄，任何型態都支援統計值資料.

過期的統計值資料導致QO誤判產生不良執行計畫

在我們建立`Index`時，統計值會自動創建。此外當欄位在查詢裡被使用(作為WHERE條件的一部分,group by子句,join條件)統計值會被自動建立

### 何時建立統計值?

每個索引都會有自己個統計資訊，在`UI`查看統計資訊如下圖.

![](https://i.imgur.com/7TiCaUh.png)

如果查詢條件欄位沒有統計值，`Query Optimizer`會在編譯前將**統計值建立或有門檻條件性的更新**。

如下圖我們使用`C3`沒有建立索引欄位來查詢，SQL-Server就會幫我們自動產生`_WA_Sys_00000003_6EF57B66`這個統計資訊來讓`QO`產生執行計畫時有個依據.

![](https://i.imgur.com/WYcY8VW.png)

## 查詢資料表統計值 & 了解統計值欄位含意

想要查詢資料表索引的統計值可以輸入`DBCC SHOW_STATISTICS`，第一個參數是查詢資料表，第二個參數是查詢的索引或統計值.

```sql
DBCC SHOW_STATISTICS('dbo.posts','PK_Posts')
```

使用上語法查詢會出現三個結果集

![](https://i.imgur.com/0IKcsNG.png)

第一個結果集

顯示出此統計值的基本資訊其中有幾個重要的欄位

* 最後更新時間
* 密度
* 統計值Key的欄位大小

第二個結果集

密度分布,使用常數查詢,直接使用子方圖進行資料筆數估計

第三個結果集

`RANGE_HI_KEY`:每個區域資料的分佈。
`RANGE_ROWS`:上圖列出(120 + 1) ~(126)區間的Row是57.175筆資料
`EQ_ROWS`:代表這個區間值。
`DISTINCT_RANGE_ROWS`:代表這個區間裏面有幾個特殊/單一(Unique)值。
`AVG_RANGE_ROWS`:代表這個區間每個特殊值平均有幾筆

### 觸發統計值更新

假如有設定自動更新統計值，異動資料筆數超過 (500 + 20%)資料，會觸發統計值更新

> 如果是大資料表容易造成統計值不準確，因為要達到自動更新門檻有點困難

在SQL2017之前版本建議啟用TF2371，可以讓自動更新統計值的門檻數量變平滑點

```sql
DBCC TRACEON (2371,-1)
```

啟動後大資料就不會只使用(500 + 20%)條件來更新統計值，會依照資料表筆數來判斷(如下圖)

![image alt](https://www.virtual-dba.com/media/sql-server-chart.jpg)

> 假如使用執行計畫(估計值)很不準確可以查看，當前的統計值是否是正確

如果要更新統計值可以使用下面語法.

```sql
UPDATE STATISTICS dbo.T1;  --更新統計值
DBCC SHOW_STATISTICS ('dbo.T1', idx1) --顯示統計值
```

### 刪除重複統計值資料

我們在建立索引，在下次查詢時`SQL-Server`會幫我們建立索引的統計值資料,這時候之前建立資料變得是多餘的就可以利用下面`Script`找尋是否有**同個欄位擁有重複統計值**，可建立刪除`Script`

```sql
WITH    autostats(object_id, stats_id, name, column_id)
AS (
SELECT  sys.stats.object_id ,
        sys.stats.stats_id ,
        sys.stats.name ,
        sys.stats_columns.column_id
FROM    sys.stats
        INNER JOIN sys.stats_columns ON sys.stats.object_id = sys.stats_columns.object_id
                                        AND sys.stats.stats_id = sys.stats_columns.stats_id
WHERE   sys.stats.auto_created = 1
        AND sys.stats_columns.stats_column_id = 1
)
SELECT  OBJECT_NAME(sys.stats.object_id) AS [Table] ,
		sys.columns.name AS [Column] ,
		sys.stats.name AS [Overlapped] ,
		autostats.name AS [Overlapping] ,
		'DROP STATISTICS [' + OBJECT_SCHEMA_NAME(sys.stats.object_id) + '].[' + OBJECT_NAME(sys.stats.object_id) + '].[' + autostats.name + ']'
FROM    sys.stats
		INNER JOIN sys.stats_columns ON sys.stats.object_id = sys.stats_columns.object_id
										AND sys.stats.stats_id = sys.stats_columns.stats_id
		INNER JOIN autostats ON sys.stats_columns.object_id = autostats.object_id
								AND sys.stats_columns.column_id = autostats.column_id
		INNER JOIN sys.columns ON sys.stats.object_id = sys.columns.object_id
									AND sys.stats_columns.column_id = sys.columns.column_id
WHERE   sys.stats.auto_created = 0
		AND sys.stats_columns.stats_column_id = 1
		AND sys.stats_columns.stats_id != autostats.stats_id
		AND OBJECTPROPERTY(sys.stats.object_id, 'IsMsShipped') = 0;
```

### 統計值和查詢記憶體分配

SQL-Server查詢不同操作有不同的記憶體分配方式,例如`Index Scan`不用把資料存在記憶體中(因為一筆一筆取出就可以),但如果是使用`Sort`相關的操作,需要在執行前訪問rowset

`SQL-Server`會依照統計值來分配合適的記憶體大小,假如統計值不准會導致記憶體分配不對,就會把資料存在TempDb造成查詢效能低落.

下面這個範例來演示上面所說的

```sql
create table dbo.MemoryGrantDemo 
( 
    ID int not null, 
    Col int not null, 
    Placeholder char(8000) 
); 
 
create unique clustered index IDX_MemoryGrantDemo_ID 
 on dbo.MemoryGrantDemo(ID); 

 ;with N1(C) as (select 0 union all select 0) -- 2 rows 
 ,N2(C) as (select 0 from N1 as T1 cross join N1 as T2) -- 4 rows 
 ,N3(C) as (select 0 from N2 as T1 cross join N2 as T2) -- 16 rows 
 ,N4(C) as (select 0 from N3 as T1 cross join N3 as T2) -- 256 rows 
 ,N5(C) as (select 0 from N4 as T1 cross join N4 as T2) -- 65,536 rows 
 ,IDs(ID) as (select row_number() over (order by (select null)) from N5) 
 insert into dbo.MemoryGrantDemo(ID,Col,Placeholder) 
     select ID, ID % 100, convert(char(100),ID) from IDs; 
 
 
create nonclustered index IDX_MemoryGrantDemo_Col 
 on dbo.MemoryGrantDemo(Col); 
```

建立一張表`MemoryGrantDemo`並建立`Clustered Index`跟新增65,536筆資料`Col`介於1~100之間,最後在建立一個`NonClustered Index`

> `Col`介於1~100之間會有統計值


```sql
 ;with N1(C) as (select 0 union all select 0) -- 2 rows 
 ,N2(C) as (select 0 from N1 as T1 cross join N1 as T2) -- 4 rows 
 ,N3(C) as (select 0 from N2 as T1 cross join N2 as T2) -- 16 rows 
 ,N4(C) as (select 0 from N3 as T1 cross join N3 as T2) -- 256 rows 
 ,N5(C) as (select 0 from N4 as T1 cross join N2 as T2) -- 1,024 rows 
 ,IDs(ID) as (select row_number() over (order by (select null)) from N5) 
 insert into dbo.MemoryGrantDemo(ID,Col,Placeholder) 
     select 100000 + ID, 1000, convert(char(100),ID) 
     from IDs 
     where ID <= 656;
```

最後在新增`Col = 1000`的`656`筆資料

> 因為只有新增`656`只有原本的1%所以不會觸法更新統計值


如下圖能看到`IDX_MemoryGrantDemo_Col`並沒有`Col=1000`的資訊

![](https://i.imgur.com/FTykGu7.png)


建立好資料後我們使用`statistics`和打開執行計畫來看看兩者差別

```sql
 declare 
     @Dummy int 
 
set statistics time on 
 select @Dummy = ID from dbo.MemoryGrantDemo where Col = 1 order by Placeholder; 
 select @Dummy = ID from dbo.MemoryGrantDemo where Col = 1000 order by Placeholder; 
 set statistics time off 
```

在執行計畫中看到第二個查詢有個驚嘆號,移過去看可以發現查詢出來的資料寫入TempDb中

![](https://i.imgur.com/fTAZq1T.png)

[訊息]中能看到第二個查詢語法使用時間比較長

![](https://i.imgur.com/Pjk1vTs.png)

> 因為SQL-Server依照統計值分配記憶體大小,所以會把統計值預估外資料搬到tempdb資料庫