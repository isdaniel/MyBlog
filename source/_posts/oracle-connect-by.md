---
title: Oracle [CONNECT BY]
date: 2019-06-02 22:30:11
tags: [SQL,Oracle]
categories: [SQL,Oracle]
---

之前有介紹 {% post_link cte-recursive %} 在`Oracle` 有提供一個精簡的語法產生階層資料 `CONNECT BY`

 CONNECT BY 有幾個常用Key Word.

1.  `LEVEL `目前在樹節點第幾階層
2.  `START WITH` 設定哪筆做為起始點開始樹
3.  `PRIOR `用於指定父資料欄位

製造出的階層樹，概念如下

![](https://docs.oracle.com/cd/B19306_01/server.102/b14200/img/sqlrf002.gif)[圖來自Oracle]

## 範例一

<div class="note note--normal">建立連續數字 1~10</div>

    <code class="language-sql">SELECT X + LEVEL
    FROM (
      SELECT 0 X
      FROM DUAL
     )
    CONNECT BY LEVEL <= 10

此範例使用 `LEVEL ` 在 `CONNECT BY` 上當條件 建立列值到`LEVEL` 大於等於 10

[sqlfiddle](https://rextester.com/WLJA28068)

## 範例二

建立日曆表

    <code class="language-sql">SELECT startDt + LEVEL - 1
    FROM (
      SELECT sysdate endDt,  (sysdate -10) startDt
      FROM DUAL
    )t1
    CONNECT BY startDt - endDt + LEVEL <= 0


一開始有兩個欄位 

1.  StartDt 起始時間(10天前)
2.  EndDt  最後時間(現在時間)

期望建立一個結果集從10天前日期到現在，一樣是使用`LEVEL`在當Offset的時間

## 範例三

`CONNECT BY` 最強大的地方是在於建立階層表

樣本資料：

    CREATE TABLE HierarchyDemo (
           PartNo INT,
           NAME VARCHAR2(16),
           ParentPartNo INT
    );

    INSERT INTO HierarchyDemo VALUES(1,'Boss',0);
    INSERT INTO HierarchyDemo VALUES(2,'Jack',1);
    INSERT INTO HierarchyDemo VALUES(3,'TOM',2);
    INSERT INTO HierarchyDemo VALUES(4,'AMY',3);
    INSERT INTO HierarchyDemo VALUES(5,'Daniel',2);


SQL腳本：

    SELECT t1.*,LEVEL
    FROM HierarchyDemo t1
    START WITH ParentPartNo = 0
    CONNECT BY PRIOR PartNo = ParentPartNo

`START WITH ParentPartNo = 0` 設置為起始點，開始找尋建立子階級

`PRIOR PartNo` 代表下一次由`PartNo `當作根結點 找尋 `PartNo = ParentPartNo` 的列

最後變成下圖

        | PARTNO |   NAME | PARENTPARTNO | LEVEL |
        |--------|--------|--------------|-------|
        |      1 |   Boss |            0 |     1 |
        |      2 |   Jack |            1 |     2 |
        |      3 |    TOM |            2 |     3 |
        |      4 |    AMY |            3 |     4 |
        |      5 | Daniel |            2 |     3 |

參考資料：[Oracle Hierarchical Queries](https://docs.oracle.com/cd/B19306_01/server.102/b14200/queries003.htm)

