---
title: (SQL Server)Dynamic pivot 動態樞紐分析
date: 2019-06-02 22:30:11
tags: [SQL,Dynamic-Pivot,Pivot]
categories: [SQL]
---

## 前言：

之前有和大家分享使用[CASE WHEN 搭配聚合函數](https://dotblogs.com.tw/daniel/2018/05/09/172804)實現樞紐分析

但今天如果我們要轉換成行的列希望是動態依照目前資料庫的欄位要處理呢?

我們可以使用`Dynamic pivot`

``Dynamic pivot` 核心概念其實是把我們要使用的`pivot SQL`語法動態產生出來

### 程式碼

    CREATE TABLE T(
        userName VARCHAR(100),
        Price int,
        Dt DATE
    );

    INSERT INTO T VALUES ('Tom',100,'2017-01-01');
    INSERT INTO T VALUES ('Amy',200,'2017-01-02');
    INSERT INTO T VALUES ('Tom',1311,'2017-01-03');
    INSERT INTO T VALUES ('Tom',122,'2017-03-01');
    INSERT INTO T VALUES ('Tom',111,'2017-04-01');
    INSERT INTO T VALUES ('Amy',232,'2017-05-01');
    INSERT INTO T VALUES ('Tom',2312,'2017-05-02');
    INSERT INTO T VALUES ('Tom',23,'2017-05-03');

    DECLARE @cols AS NVARCHAR(MAX),
            @query  AS NVARCHAR(MAX);

    SET @SQL = STUFF((SELECT distinct ',SUM(CASE WHEN Dt = '''+ CAST(Dt AS VARCHAR(10)) +''' THEN Price ELSE 0 END) AS ' + QUOTENAME(Dt)  
                FROM T 
                FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)') 
            ,1,1,'');

    SET @query = 'SELECT userName,'+@cols+' FROM T GROUP BY userName' ;

    EXECUTE sp_executesql @query

因為範例我們使用 `SQL SERVER`

所以使用[ FOR XML PATH](https://docs.microsoft.com/zh-tw/sql/relational-databases/xml/for-xml-sql-server?view=sql-server-2017) 語法將我們<span style="color:#FFA500;">** CASE WHEN pivot SQL **</span>語法產生並把他附值給 `@cols ` 變數

    SET @cols = STUFF((SELECT distinct ',SUM(CASE WHEN Dt = '''+ CAST(Dt AS VARCHAR(10)) +''' THEN Price ELSE 0 END) AS ' + QUOTENAME(Dt)  
                FROM T 
                FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)') 
            ,1,1,'')

因為`Dt`行會有重複的值,所以 `distinct` 來過濾

會產生如下的`SQL`語法

       ,SUM(CASE WHEN Dt = '2017-01-01' THEN Price ELSE 0 END) AS [2017-01-01],SUM(CASE WHEN Dt = '2017-01-02' THEN Price ELSE 0 END) AS [2017-01-02],SUM(CASE WHEN Dt = '2017-01-03' THEN Price ELSE 0 END) AS [2017-01-03],SUM(CASE WHEN Dt = '2017-03-01' THEN Price ELSE 0 END) AS [2017-03-01],SUM(CASE WHEN Dt = '2017-04-01' THEN Price ELSE 0 END) AS [2017-04-01],SUM(CASE WHEN Dt = '2017-05-01' THEN Price ELSE 0 END) AS [2017-05-01],SUM(CASE WHEN Dt = '2017-05-02' THEN Price ELSE 0 END) AS [2017-05-02],SUM(CASE WHEN Dt = '2017-05-03' THEN Price ELSE 0 END) AS [2017-05-03]

在使用 [STUFF](https://docs.microsoft.com/zh-tw/sql/t-sql/functions/stuff-transact-sql?view=sql-server-2017) 將第一個 , 給移除掉

[sqlfiddle](https://dbfiddle.uk/?rdbms=sqlserver_2017&fiddle=9c8da950aced16de49c591624a7d532b)

最後在把要使用的表和前面組的Pivot query串起來.

    SET @cols = STUFF((SELECT distinct ',SUM(CASE WHEN Dt = '''+ CAST(Dt AS VARCHAR(10)) +''' THEN Price ELSE 0 END) AS ' + QUOTENAME(Dt)  
                FROM T 
                FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)') 
            ,1,1,'');
                
    SET @query = 'SELECT userName,'+@cols+' FROM T GROUP BY userName' ;
    SELECT @query;

最後產生：

    SELECT userName,
        SUM(CASE WHEN Dt = '2017-01-01' THEN Price ELSE 0 END) AS [2017-01-01],
        SUM(CASE WHEN Dt = '2017-01-02' THEN Price ELSE 0 END) AS [2017-01-02],
        SUM(CASE WHEN Dt = '2017-01-03' THEN Price ELSE 0 END) AS [2017-01-03],
        SUM(CASE WHEN Dt = '2017-03-01' THEN Price ELSE 0 END) AS [2017-03-01],
        SUM(CASE WHEN Dt = '2017-04-01' THEN Price ELSE 0 END) AS [2017-04-01],
        SUM(CASE WHEN Dt = '2017-05-01' THEN Price ELSE 0 END) AS [2017-05-01],
        SUM(CASE WHEN Dt = '2017-05-02' THEN Price ELSE 0 END) AS [2017-05-02],
        SUM(CASE WHEN Dt = '2017-05-03' THEN Price ELSE 0 END) AS [2017-05-03]
    FROM T 
    GROUP BY userName

有了上面`CASE WHEN pivot SQL` 語法,最後只需把剩下要用到Table sql語句給組出來在使用 `EXECUTE sp_executesql` 動態呼叫SQL語法


[sqlfiddle](https://dbfiddle.uk/?rdbms=sqlserver_2017&fiddle=402d4d13a6f695404d595526b645714d)

       