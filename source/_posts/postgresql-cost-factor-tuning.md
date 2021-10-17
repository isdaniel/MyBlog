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
* random_page_cost : 4   -- Index Scan Block 成本因子
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

* search blocks from disk：154640
* seq_page_cost:6662 ns = 0.006662 ms
* search rows:15000000
* 實際執行時間 : 14004.456 - 0.736 = 14003.72
* cpu_tuple_cost = 0.0008649005546666667

`14003.72= 154640 * 0.006662 + 15000000 * cpu_tuple_cost`

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

前面我們調教兩個成本因子，接下來要接續計算　random_page_cost 以及 cpu_index_tuple_cost , cpu_operator_cost

* cpu_tuple_cost = 0.0008649005546666667;
* seq_page_cost = 0.006662;

本次要利用 Index Scan 公式還計算剩下因子

`最終執行時間成本 = (search index block) * random_page_cost + cpu_tuple_cost * (tuple search row) + cpu_index_tuple_cost * (tuple search row) + cpu_operator_cost * x`

我們利用設定把讓執行計畫查詢 force 成 Index Scan，利用得到 stap & 執行計畫資料進行優化

```sql=
set random_page_cost=1;   
set cpu_tuple_cost=1;  
set cpu_index_tuple_cost=1;  
set cpu_operator_cost=1;   

set enable_seqscan=off; set enable_bitmapscan=off; explain (analyze,verbose,costs,buffers,timing) select * from tbl where id > 1998760000;
```

psql 執行如下

```sql
postgres=# select pg_backend_pid();
 pg_backend_pid 
----------------
          63285
(1 row)

postgres=# set random_page_cost=1;   
SET
postgres=# set cpu_tuple_cost=1;  
SET
postgres=# set cpu_index_tuple_cost=1;  
SET
postgres=# set cpu_operator_cost=1;   
SET
postgres=# 
postgres=# set enable_seqscan=off; set enable_bitmapscan=off; explain (analyze,verbose,costs,buffers,timing) select * from tbl where id > 1998760000;
SET
SET
                                                            QUERY PLAN                                                             
-----------------------------------------------------------------------------------------------------------------------------------
 Index Scan using ix_tbl on public.tbl  (cost=174.00..34131.99 rows=8539 width=49) (actual time=1.305..3948.019 rows=9406 loops=1)
   Output: id, val, info, create_time
   Index Cond: (tbl.id > 1998760000)
   Buffers: shared hit=286 read=9161
 Query Identifier: -1014555039272331675
 Planning:
   Buffers: shared hit=69 read=28
 Planning Time: 13.757 ms
 Execution Time: 3961.950 ms
(9 rows)
```

stap 結果如下

```bash=
Pass 4: using cached /root/.systemtap/cache/66/stap_66dcbdbebf362f424bfd78405d2e262b_16109.ko
Pass 5: starting run.
query__start set random_page_cost=1;pid:63285
query__done set random_page_cost=1;pid:63285
query__start set cpu_tuple_cost=1;pid:63285
query__done set cpu_tuple_cost=1;pid:63285
query__start set cpu_index_tuple_cost=1;pid:63285
query__done set cpu_index_tuple_cost=1;pid:63285
query__start set cpu_operator_cost=1;pid:63285
query__done set cpu_operator_cost=1;pid:63285
query__start set enable_seqscan=off;pid:63285
query__done set enable_seqscan=off;pid:63285
query__start set enable_bitmapscan=off;pid:63285
query__done set enable_bitmapscan=off;pid:63285
query__start explain (analyze,verbose,costs,buffers,timing) select * from tbl where id > 1998760000;pid:63285
63285**9207**420006
query__done explain (analyze,verbose,costs,buffers,timing) select * from tbl where id > 1998760000;pid:63285
   value |-------------------------------------------------- count
    1024 |                                                      0
    2048 |                                                      0
    4096 |                                                      4
    8192 |                                                      0
   16384 |                                                      4
   32768 |                                                      1
   65536 |                                                      0
  131072 |                                                      1
  262144 |@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@  8428
  524288 |@@@@                                                696
 1048576 |                                                     56
 2097152 |                                                     10
 4194304 |                                                      7
 8388608 |                                                      0
16777216 |                                                      0
```

再來就是把資訊套入公式中

`最終執行時間成本 = (search index block) * random_page_cost + cpu_tuple_cost * (tuple search row) + cpu_index_tuple_cost * (tuple search row) + cpu_operator_cost * x`

* 最終執行時間成本 = 3948.019
* cpu_tuple_cost = 0.0008649005546666667
* tuple search row = 9406
* 執行平均 IO 420006 ns = 0.420006 ms (random_page_cost)  

套用進公式時會發現還是有許多未知數

`3948.019 = (search index block) * 0.420006  +  0.0008649005546666667 * 9406 + cpu_index_tuple_cost * 9406 + cpu_operator_cost * x`

> search index block 有兩種方式可以查看第一個是利用 `bt_page_items` 了解範圍查詢有多少 block，另一種是利用基準點來估算出數值　（二元一次聯立方程式）

#### 取得 search index block

我們先退出來 清除 cache & restart postgreSQL，執行下面語法

> 其中有一個地方不一樣 `set random_page_cost=2;` ，因為我們要利用　（二元一次聯立方程式） 求出我們的數值

```sql=
set random_page_cost=2;   
set cpu_tuple_cost=1;  
set cpu_index_tuple_cost=1;  
set cpu_operator_cost=1;   

set enable_seqscan=off; set enable_bitmapscan=off; explain (analyze,verbose,costs,buffers,timing) select * from tbl where id > 1998760000;
```

利用上面查詢資訊如下

```bash=
postgres=# set random_page_cost=2;   
SET
postgres=# set cpu_tuple_cost=1;  
SET
postgres=# set cpu_index_tuple_cost=1;  
SET
postgres=# set cpu_operator_cost=1;   
SET
postgres=# 
postgres=# set enable_seqscan=off; set enable_bitmapscan=off; explain (analyze,verbose,costs,buffers,timing) select * from tbl where id > 1998760000;
SET
SET
                                                            QUERY PLAN                                                             
-----------------------------------------------------------------------------------------------------------------------------------
 Index Scan using ix_tbl on public.tbl  (cost=174.00..42472.99 rows=8539 width=49) (actual time=1.447..3887.553 rows=9406 loops=1)
   Output: id, val, info, create_time
   Index Cond: (tbl.id > 1998760000)
   Buffers: shared hit=286 read=9161
 Query Identifier: -1014555039272331675
 Planning:
   Buffers: shared hit=72 read=28
 Planning Time: 15.066 ms
 Execution Time: 3898.528 ms
(9 rows)
```

這邊左邊的成本利用 估算時間 因為估算時間公式都一樣是上面我寫的那個 這次唯一有變動的部分只有

```bash=
34131.99 = (search index block) *  1 +  9406 + cpu_index_tuple_cost * 9406 + cpu_operator_cost * x`

42472.99 = 2 * (search index block) * 1  + 9406 + cpu_index_tuple_cost * 9406 + cpu_operator_cost * x
====================================================================================================================================
42472.99 - 34131.99 = (search index block)

(search index block) = 8341
```

這樣我們就可以取得 `(search index block)` 資訊，同理我們可以利用上面手法接著得到公式中 `x`

```sql
set random_page_cost=1;   
set cpu_tuple_cost=1;  
set cpu_index_tuple_cost=1;  
set cpu_operator_cost=2;   

set enable_seqscan=off; set enable_bitmapscan=off; explain (analyze,verbose,costs,buffers,timing) select * from tbl where id > 1998760000;
```

我們把 `set cpu_operator_cost=2;` 其他一樣設定成1，下去做比較

```sql
postgres=# set random_page_cost=1;   
SET
postgres=# set cpu_tuple_cost=1;  
SET
postgres=# set cpu_index_tuple_cost=1;  
SET
postgres=# set cpu_operator_cost=2;   
SET
postgres=# 
postgres=# set enable_seqscan=off; set enable_bitmapscan=off; explain (analyze,verbose,costs,buffers,timing) select * from tbl where id > 1998760000;
SET
SET
                                                            QUERY PLAN                                                             
-----------------------------------------------------------------------------------------------------------------------------------
 Index Scan using ix_tbl on public.tbl  (cost=348.00..42844.99 rows=8539 width=49) (actual time=1.158..3981.194 rows=9406 loops=1)
   Output: id, val, info, create_time
   Index Cond: (tbl.id > 1998760000)
   Buffers: shared hit=286 read=9161
 Query Identifier: -1014555039272331675
 Planning:
   Buffers: shared hit=72 read=28
 Planning Time: 15.108 ms
 Execution Time: 3992.758 ms
(9 rows)
```

計算步驟跟上面差不多，我就直接帶到核心計算公式

```bash
42844.99 - 34131.99 = x
x = 8713
```

自此我們就把所有資訊都取得了

### 調教最終數值

* 最終執行時間成本 = 3948.019
* cpu_tuple_cost = 0.0008649005546666667
* tuple search row = 9406
* 執行平均 IO 420006 ns = 0.420006 ms (random_page_cost)
* x = 8713
* search index block = 8341

`3948.019 = 8341 * 0.420006  +  0.0008649005546666667 * 9406 + cpu_index_tuple_cost * 9406 + cpu_operator_cost * 8713`

把數值套用在上面公式，有人會說還有兩個變數怎麼解這個公式?

因為在建議設定值 cpu_operator_cost : cpu_index_tuple_cost = 1 : 2

所以我們可以把公式變成

```calc
3948.019 = 8341 * 0.420006  +  0.0008649005546666667 * 9406 + cpu_index_tuple_cost * 9406 + cpu_index_tuple_cost * 2 * 8713

436.6136993828054 = 26832 * cpu_index_tuple_cost
cpu_index_tuple_cost = 0.016272126542292986
```

## 最終調教因子結果

* cpu_index_tuple_cost : 0.016272126542292986
* cpu_operator_cost：0.03254425308458597
* cpu_tuple_cost = 0.0008649005546666667
* seq_page_cost = 0.006662;
* random_page_cost = 0.420006

最後我們可以利用調教完的因子進行查詢

```sql
--index scan test
set cpu_index_tuple_cost = 0.016272126542292986;
set cpu_operator_cost= 0.03254425308458597;
set cpu_tuple_cost = 0.0008649005546666667;
set seq_page_cost = 0.006662;
set random_page_cost = 0.420006;

set enable_seqscan=off; set enable_bitmapscan=off; explain (analyze,verbose,costs,buffers,timing) select * from tbl where id > 1998760000;


--table scan tests
set cpu_index_tuple_cost = 0.016272126542292986;
set cpu_operator_cost= 0.03254425308458597;
set cpu_tuple_cost = 0.0008649005546666667;
set seq_page_cost = 0.006662;
set random_page_cost = 0.420006;

explain (analyze,verbose,costs,buffers,timing) select * from tbl;
```

發現預估成本時間和實際成本時間已經貼近許多了 (因為在使用 stap 時 cpu 會有額外消耗)，所以建議在調教效能要找一台同規格且完全沒事情的機器來處理不然數值會有偏差

table scan & index scan 已經貼近真實時間很多了

```sql
postgres=# set enable_seqscan=off; set enable_bitmapscan=off; explain (analyze,verbose,costs,buffers,timing) select * from tbl where id > 1998760000;
SET
SET
                                                           QUERY PLAN                                                           
--------------------------------------------------------------------------------------------------------------------------------
 Index Scan using ix_tbl on public.tbl  (cost=0.43..3575.13 rows=8539 width=49) (actual time=1.402..3933.451 rows=9406 loops=1)
   Output: id, val, info, create_time
   Index Cond: (tbl.id > 1998760000)
   Buffers: shared hit=286 read=9161
 Query Identifier: -1014555039272331675
 Planning:
   Buffers: shared hit=72 read=28
 Planning Time: 14.948 ms
 Execution Time: 3944.197 ms
(9 rows)

postgres=# set cpu_operator_cost= 0.03254425308458597;
SET
postgres=# set cpu_tuple_cost = 0.0008649005546666667;
SET
postgres=# set seq_page_cost = 0.006662;
SET
postgres=# set random_page_cost = 0.420006;
SET
postgres=# 
postgres=# set enable_seqscan=off; set enable_bitmapscan=off; explain (analyze,verbose,costs,buffers,timing) select * from tbl where id > 1998760000;
SET
SET
                                                           QUERY PLAN                                                           
--------------------------------------------------------------------------------------------------------------------------------
 Index Scan using ix_tbl on public.tbl  (cost=5.66..3933.16 rows=8539 width=49) (actual time=1.092..3360.230 rows=9406 loops=1)
   Output: id, val, info, create_time
   Index Cond: (tbl.id > 1998760000)
   Buffers: shared hit=286 read=9161
 Query Identifier: -1014555039272331675
 Planning:
   Buffers: shared hit=72 read=28
 Planning Time: 15.869 ms
 Execution Time: 3369.814 ms
(9 rows)
```

## 小結

終於寫完這篇文章了，耗時許多且來來回回很多步驟要處理

假如對於上面說的覺得太複雜，可以參考網路上別人較為通用的設定值

[Tuning RelStorage and parameters of PostgreSQL on Plone site](https://stackoverflow.com/questions/33885986/tuning-relstorage-and-parameters-of-postgresql-on-plone-site)

```bash
set cpu_tuple_cost = 0.0030;
set cpu_index_tuple_cost = 0.0001;
set cpu_operator_cost = 0.0005;
set random_page_cost = 1.5;
```

> 建議如果有能力還是自己 tuning，因為這樣會更準確