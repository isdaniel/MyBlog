---
title: postgresql 執行計畫重要因子 (成本因子調教)
date: 2021-10-17 20:30:11
tags: [DataBase,Turning,postgresql,cost]
categories: [Turning,postgresql]
keywords: DataBase,Turning,postgresql,cost
photos: 
    - "https://i.imgur.com/ZAs54l8.png"
---

## 前言

執行計畫代表此次查詢要怎麼樣的演算法查詢我們的資料，而**成本**是決定使用哪個執行計畫的重要因素

在 postgreSQL DB query optimizer 會選擇成本最低的執行計劃，當作查詢資料使用算法

在 Sql-sevrer 成本計算封裝在程式內部，我們無法透過一些因子來調整，但 postgreSQL 可以

我認為 query optimizer 判斷成本概念有點類似 google map 在找尋最佳路徑

> 我對於資料庫有定義一個，**地圖理論**來說明 RDBMS 執行計畫相關的事情

本篇成本因子效能調教會涉 Linux kernel systemtap ，國中數學，postgreSQL 運作模型，篇幅可能會有點多且複雜

但我認為本篇學會可以對於　query optimizer 有更進一步了解

## 預設成本因子潛在問題

下面我使用一個例子來

我們利用一樣的查詢 explain (analyze,verbose,costs,buffers,timing) select id from tbl where id > 70000;

查看使用 `table scan` & `index scan only` 執行計畫預估值跟實際查詢差異.

```bash
postgres=# explain (analyze,verbose,costs,buffers,timing) select info from tbl where info ='girl';
                                                    QUERY PLAN                                                     
-------------------------------------------------------------------------------------------------------------------
 Seq Scan on public.tbl  (cost=0.00..5456.48 rows=300016 width=4) (actual time=0.013..216.970 rows=299999 loops=1)
   Output: info
   Filter: (tbl.info = 'girl'::text)
   Rows Removed by Filter: 4999
   Buffers: shared hit=1644
 Planning Time: 0.067 ms
 Execution Time: 404.836 ms
(7 rows)

postgres=# 
SET
postgres=# set enable_seqscan=off; explain (analyze,verbose,costs,buffers,timing) select info from tbl where info ='girl';
                                                              QUERY PLAN                                                               
---------------------------------------------------------------------------------------------------------------------------------------
 Index Only Scan using tbl_ix on public.tbl  (cost=0.30..6202.58 rows=300016 width=4) (actual time=0.025..196.965 rows=299999 loops=1)
   Output: info
   Index Cond: (tbl.info = 'girl'::text)
   Heap Fetches: 0
   Buffers: shared hit=237
 Planning Time: 0.067 ms
 Execution Time: 377.856 ms
(7 rows)
```

發現明明查詢語法都一樣，只是透過 Setting 發現明明是 `Index Only Scan` 執行實際時間成本比較低，但 query optimizer 卻選擇 table scan，會造成上面問題是因為成本因子沒有調教所造成

> 這也是我一開始說成本因子的重要性

另外上面 cost 代表含意也不明，只是一個數字，首先我們要先知道成本是一個概念，重點我們是要看哪種成本?

> 像成本有分 時間成本，金錢成本.....都是不同維度的成本

我們的做法會把成本校準成 **時間成本** 也就是實際執行時間和預估執行成本校準

## 調教成本因子前置作業

### 下載 systemtap

我是在 AWS EC2 建立一個 ubuntu Linux server．所以目前我操作步驟是針對　ubuntu Linux 說明

[systemtap](https://en.wikipedia.org/wiki/SystemTap) 這個工具可以監測 Linux 核心底層 本次我會藉由他來幫我們了解實際查詢平均 IO 讀取時間

透過 uname 命令查看 kernel 版本

```bash
root:# uname -r
5.4.0-1045-aws
```

> 下載 systemtap 需要特別注意使用 Linux kernel 版本還有平台
> 因為 systemtap dbgsym 對於 kernel 版本需要對應一致，像我機器版本是 `5.4.0-1045-aws` 所以會需要下載 `5.4.0-1045-aws` 版本

我們需要在 update list 新增含有 dbgsym 下載路徑，所以可以跑下面語法

```bash
codename=$(lsb_release -c | awk  '{print $2}')
sudo tee /etc/apt/sources.list.d/ddebs.list << EOF
  deb http://ddebs.ubuntu.com/ ${codename}      main restricted universe multiverse
  deb http://ddebs.ubuntu.com/ ${codename}-security main restricted universe multiverse
  deb http://ddebs.ubuntu.com/ ${codename}-updates  main restricted universe multiverse
  deb http://ddebs.ubuntu.com/ ${codename}-proposed main restricted universe multiverse
EOF
sudo apt-get update
sudo apt-get install systemtap -y
sudo apt-get install gcc -y
sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-keys C8CAB6595FDFF622
sudo apt-get install linux-image-$(uname -r)-dbgsym -y
sudo apt-get install linux-headers-$(uname -r) -y
```

如果下載完畢會顯示下載完畢的資訊如下

```bash
root/pg_log# sudo apt-get install linux-image-$(uname -r)-dbgsym -y
Reading package lists... Done
Building dependency tree       
Reading state information... Done
linux-image-5.4.0-1045-aws-dbgsym is already the newest version (5.4.0-1045.47).
0 upgraded, 0 newly installed, 0 to remove and 64 not upgraded.
root/pg_log# sudo apt-get install linux-headers-$(uname -r) -y
Reading package lists... Done
Building dependency tree       
Reading state information... Done
linux-headers-5.4.0-1045-aws is already the newest version (5.4.0-1045.47).
0 upgraded, 0 newly installed, 0 to remove and 64 not upgraded.
```

安裝完後使用 `stap` 應該可以看到類似下面提示

```bash=
root:/pg_log# stap
A script must be specified.
Try '-i' for building a script interactively.
Try '--help' for more information.
```

## 調教成本因子

首先我們要先知道成本是一個概念，重點我們是要看哪種成本?

> 像成本有分 時間成本，金錢成本.....都是不同維度的成本

我們的做法會把成本校準成 **時間成本** 也就是實際執行時間和預估執行成本校準

在執行計畫中 QO 會利用 成本 (cost) 來判斷使用哪個執行計畫，而成本 (cost)是透過公式來計算出來 [costsize.c](https://github.com/postgres/postgres/blob/master/src/backend/optimizer/path/costsize.c)

在公式中有幾個變數可以讓我們來調整**執行計畫成本估算**，就是所謂的成本因子

postgreSQL 預設給的成本因子並不能符合所有機器算法．不同的硬體環境CPU性能，IO性能各不相同，預設的成本因子可能不適合當前硬體.

> EX: 同樣硬體設備，但 CPU 2 core 和 32 core 跑起來查詢時間就會有差異
> 我們在 `SET ENABLE_SEQSACN = OFF;` 在計算成本時 SEQSACN 起始成本會是 `1.0e10`

本次我們要調教的成本因子有下面五個，關於每個成本的意涵我都有說明

* seq_page_cost : 1 -- Table Scan 每個 Block 成本因子
*   : 4   -- Index Scan Block 成本因子
* cpu_tuple_cost : 0.01   -- CPU 處理每個 tuple 成本因子
* cpu_index_tuple_cost : 0.005   -- Index scan tuple 成本因子
* cpu_operator_cost : 0.0025   -- 操作符或函数成本因子

下面這張表是調教成本因子 sample data

```sql
create table tbl (id int,val int, info text, create_time timestamp);  
create index ix_tbl on tbl (id);

insert into tbl 
select (random()*2000000000)::int, (random()*2000000000)::int,md5(random()::text),  clock_timestamp() from generate_series(1,15000000);  
analyze tbl;  
vacuum  tbl;
```

### 成本因子說明

校準方法我們利用一元一次方程式 + 基準點校準每個因子

seq_page_cost和cpu_tuple_cost的校準
seq_page_cost通過stap測試得到.
cpu_tuple_cost通過公式得到.

### 使用 stap 監聽 process

我們後面就可以利用 `stap` 來監聽我們 postgreSQL Client 連接的 porcess，這邊有兩個參數我們需要替換

```bash=
stap -e ' 
global a  
probe process("{{postgreSQL Bin Path}}").mark("query__start") {  
  delete a  
  println("query__start ", user_string($arg1), "pid:", pid())  
}  
probe vfs.read.return {  
  t = gettimeofday_ns() - @entry(gettimeofday_ns())  
  # if (execname() == "postgres" && devname != "N/A")  
    a[pid()] <<< t  
}  
probe process("{{postgreSQL Bin Path}}").mark("query__done") {  
  if (@count(a[pid()]))   
    printdln("**", pid(), @count(a[pid()]), @avg(a[pid()]))  
  println("query__done ", user_string($arg1), "pid:", pid())  
  if (@count(a[pid()])) {  
    println(@hist_log(a[pid()]))  
    #println(@hist_linear(a[pid()],1024,4096,100))  
  }  
  delete a  
}' -x {{postgreSQL pid}} -v
```

* postgreSQL Bin Path：利用此指令 `ps auxw |  grep postgres | grep -- -` 查看 postgres DB process 啟動路徑 & postgres.conf 位置
* postgreSQL pid： 透過 `select pg_backend_pid();` 可以查詢到資訊

透過 `ps auxw |  grep postgres | grep -- -` 命令可以查找到 `/usr/lib/postgresql/14/bin/postgres` 執行程式路徑

```bash
root@:/pg_log# ps auxw |  grep postgres | grep -- -
postgres   57842  0.0  1.8 219248 18332 ?        Ss   12:55   0:00 /usr/lib/postgresql/14/bin/postgres -D /var/lib/postgresql/14/main -c config_file=/etc/postgresql/14/main/postgresql.conf
```

```sql
postgres=# select pg_backend_pid();
pg_backend_pid 
----------------
        57865
(1 row)
```

依照上面參數我們替換後的樣板變成

```bash=
stap -e ' 
global a  
probe process("/usr/lib/postgresql/14/bin/postgres").mark("query__start") {  
  delete a  
  println("query__start ", user_string($arg1), "pid:", pid())  
}  
probe vfs.read.return {  
  t = gettimeofday_ns() - @entry(gettimeofday_ns())  
  # if (execname() == "postgres" && devname != "N/A")  
    a[pid()] <<< t  
}  
probe process("/usr/lib/postgresql/14/bin/postgres").mark("query__done") {  
  if (@count(a[pid()]))   
    printdln("**", pid(), @count(a[pid()]), @avg(a[pid()]))  
  println("query__done ", user_string($arg1), "pid:", pid())  
  if (@count(a[pid()])) {  
    println(@hist_log(a[pid()]))  
    #println(@hist_linear(a[pid()],1024,4096,100))  
  }  
  delete a  
}' -x 57865 -v
```

替換完畢後我們可以嘗試使用 root 執行上面命令，執行成功應該會出現類似下面訊息，代表我們已經成功監聽了

```bash
Pass 1: parsed user script and 476 library scripts using 103952virt/90464res/7496shr/82980data kb, in 240usr/60sys/485real ms.
Pass 2: analyzed script: 4 probes, 11 functions, 9 embeds, 19 globals using 346192virt/331912res/6960shr/325220data kb, in 2510usr/730sys/8867real ms.
Pass 3: using cached /root/.systemtap/cache/66/stap_66dcbdbebf362f424bfd78405d2e262b_16109.c
Pass 4: using cached /root/.systemtap/cache/66/stap_66dcbdbebf362f424bfd78405d2e262b_16109.ko
Pass 5: starting run.
```

> 後面會需要重複幾次上面操作，為了怕篇幅太長我只會貼上替換後的樣版

### 校準 seq_page_cost && cpu_tuple_cost

因為上面有說我們要校準**時間成本**

公式：`實際執行時間 = (search blocks from disk) * (seq_page_cost) + (search rows) * (cpu_tuple_cost)`

seq_page_cost = stap 監聽平均執行 IO 來當作成本因子，所以得到　seq_page_cost 後我們就可以求出 `cpu_tuple_cost`.

> `實際執行時間`、`search blocks from disk`、`search rows` 都可以透過執行計畫取得，所以上面公式變成一元一次方程式

在一個視窗開啟 stap 後，我們就可以進行查詢下面語法取得執行計畫，會發現 cost 跟實際執行時間差異很大（沒關係我們要調教）

```sql
postgres=#  explain (analyze,verbose,costs,buffers,timing) select * from tbl; 
                                                         QUERY PLAN                                                         
----------------------------------------------------------------------------------------------------------------------------
 Seq Scan on public.tbl  (cost=0.00..304640.80 rows=15000080 width=49) (actual time=0.736..14004.456 rows=15000000 loops=1)
   Output: id, val, info, create_time
   Buffers: shared read=154640
 Query Identifier: -2758408114362091780
 Planning:
   Buffers: shared hit=65 read=16
 Planning Time: 8.525 ms
 Execution Time: 26056.658 ms
(8 rows)
```

後面在 stap 那個視窗會出現下面資訊

```bash
query__start explain (analyze,verbose,costs,buffers,timing) select * from tbl;pid:58916
58916**154665**6662
query__done explain (analyze,verbose,costs,buffers,timing) select * from tbl;pid:58916
   value |-------------------------------------------------- count
     256 |                                                       0
     512 |                                                       0
    1024 |@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@  80687
    2048 |@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@            63125
    4096 |                                                     498
    8192 |                                                     643
   16384 |                                                      20
   32768 |@@@@@                                               8767
   65536 |                                                     832
  131072 |                                                       6
  262144 |                                                      18
  524288 |                                                       8
 1048576 |                                                       2
 2097152 |                                                      57
 4194304 |                                                       2
 8388608 |                                                       0
16777216 |                                                       0
```

有了執行計畫跟平均執行 IO 就可以套入我們的公式了

> 6662 是奈秒（ns）我們需要轉換成毫秒（ms）

公式：`實際執行時間 = (search blocks from disk) * (seq_page_cost) + (search rows) * (cpu_tuple_cost)`

* Buffers: shared read=154640
* seq_page_cost:6662 ns = 0.006662 ms
* search rows:15000000
* 實際執行時間 : 14004.456 - 0.736 = 14003.72

14003.72= 154640 * 0.006662 + 15000000 * cpu_tuple_cost
cpu_tuple_cost = 0.0008649005546666667

所以我們可以得到

* cpu_tuple_cost = 0.0008649005546666667;
* seq_page_cost = 0.006662;

每次執行完為了精準度，我們需要清除cache並重新啟動 postgreSQL 清除 shared buffer 資料，讓每次資料都可以從 disk 撈取，所以都會執行下面兩個語法

```bash
root:/pg_log# sync; echo 3 > /proc/sys/vm/drop_caches
root:/pg_log# service postgresql restart
```

清除 cache & postgresql restart 後我們利用校準後的因子來查詢是否有效

```bash
postgres=# SET cpu_tuple_cost = 0.0008649005546666667;
SET
postgres=# SET seq_page_cost = 0.006662;
SET
postgres=#  explain (analyze,verbose,costs,buffers,timing) select * from tbl; 
                                                        QUERY PLAN                                                         
---------------------------------------------------------------------------------------------------------------------------
 Seq Scan on public.tbl  (cost=0.00..14003.79 rows=15000080 width=49) (actual time=0.905..10640.263 rows=15000000 loops=1)
   Output: id, val, info, create_time
   Buffers: shared read=154640
 Query Identifier: -2758408114362091780
 Planning:
   Buffers: shared hit=65 read=16
 Planning Time: 11.077 ms
 Execution Time: 19876.149 ms
(8 rows)
```

能看到預估時間成本跟實際時間成本已經很接近了

> 因為使用 stap 會有一些時間消耗，可以多取幾次找到平均值這裡就不多說了

### 取得 random_page_cost 以及 cpu_index_tuple_cost , cpu_operator_cost

--todo

## 小結

假如對於上面說的覺得太複雜，可以參考網路上別人較為通用的設定值

[Tuning RelStorage and parameters of PostgreSQL on Plone site](https://stackoverflow.com/questions/33885986/tuning-relstorage-and-parameters-of-postgresql-on-plone-site)

```bash
set cpu_tuple_cost = 0.0030;
set cpu_index_tuple_cost = 0.0001;
set cpu_operator_cost = 0.0005;
set random_page_cost = 1.5;
```

> 建議如果有能力還是自己 tuning，因為這樣會更準確