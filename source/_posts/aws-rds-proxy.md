---
title: AWS Postgres RDS Prox
date: 2021-11-22 22:30:11
tags: [AWS,RDS,Proxy]
categories: [AWS,RDS]
---

## 前言

在 Postgresql 世界裡每建立一個 Connection，都會有一個 process 來服務該請求，Postgresql 沒有 ThreadPool 概念所以在 Connection 使用量大時會發生一些問題

* 資源浪費
* 超過同時間超過 max_connection 後面連接會無法連接

一個 open source 插件 [PgBouncer](https://www.pgbouncer.org/) 就是幫我們解決上面問題，不過如果你是使用 AWS RDS 來當作 DB 就很適合使用 RDS Proxy

本次使用免費帳號範圍提供的機器 `db.t2.micro`

![](https://i.imgur.com/HClZcwd.png)

另外因為 RDS Proxy 在 EC2 內網才能連接，所以我也利用免費帳號準備一台 EC2 並安裝 `pgbench` 進行壓力測試

## 壓測前準備 & 說明

我把 `max_connections` 最大連接數量調整成 550

![](https://i.imgur.com/2snNDZo.png)

在進行壓力測試，我分別會針對 100,200,300,400,500,**600** 這幾個 connection 數量

針對有使用 RDS Proxy 跟沒有使用 Proxy 來比較效能

這邊我使用 `pgbench` 來進行壓力測試

這邊我選用 [xridge/pgbench](https://hub.docker.com/r/xridge/pgbench) pgbench 來方便我們壓力測試

一開始我們先建立 pgbench 初始資料

```cmd
docker run xridge/pgbench -i -s 4 --unlogged-tables --foreign-keys postgresql://{{postgres info}}
```

> `-s` 可以依照 RDS 規格來改變 (代表有幾個用戶資料)

準備完後就進入 EC2 虛擬機準備進行壓力測試

### 沒有 ThreadPool 測試資料

```cmd
docker run  xridge/pgbench -S -c 100 -j 20 -t 10 postgresql://{{postgres info}}
```

> `-c` 代表測試併發 client 數量

使用 100,200,300,400,500,**600** 測試結果如下

```cmd
pgbench (14.1 (Ubuntu 14.1-1.pgdg20.04+1), server 11.10)
starting vacuum...end.
transaction type: <builtin: select only>
scaling factor: 4
query mode: simple
number of clients: 100
number of threads: 20
number of transactions per client: 10
number of transactions actually processed: 1000/1000
latency average = 32.723 ms
initial connection time = 667.011 ms
tps = 3056.001222 (without initial connection time)

pgbench (14.1 (Ubuntu 14.1-1.pgdg20.04+1), server 11.10)
starting vacuum...end.
transaction type: <builtin: select only>
scaling factor: 4
query mode: simple
number of clients: 200
number of threads: 20
number of transactions per client: 10
number of transactions actually processed: 2000/2000
latency average = 164.399 ms
initial connection time = 1441.067 ms
tps = 1216.553152 (without initial connection time)

pgbench (14.1 (Ubuntu 14.1-1.pgdg20.04+1), server 11.10)
starting vacuum...end.
transaction type: <builtin: select only>
scaling factor: 4
query mode: simple
number of clients: 300
number of threads: 20
number of transactions per client: 10
number of transactions actually processed: 3000/3000
latency average = 261.908 ms
initial connection time = 2369.158 ms
tps = 1145.441258 (without initial connection time)

pgbench (14.1 (Ubuntu 14.1-1.pgdg20.04+1), server 11.10)
starting vacuum...end.
transaction type: <builtin: select only>
scaling factor: 4
query mode: simple
number of clients: 400
number of threads: 20
number of transactions per client: 10
number of transactions actually processed: 4000/4000
latency average = 647.347 ms
initial connection time = 3203.360 ms
tps = 617.906720 (without initial connection time)

pgbench (14.1 (Ubuntu 14.1-1.pgdg20.04+1), server 11.10)
starting vacuum...end.
transaction type: <builtin: select only>
scaling factor: 4
query mode: simple
number of clients: 500
number of threads: 20
number of transactions per client: 10
number of transactions actually processed: 5000/5000
latency average = 1396.268 ms
initial connection time = 5780.255 ms
tps = 358.097443 (without initial connection time)

pgbench (14.1 (Ubuntu 14.1-1.pgdg20.04+1), server 11.10)
starting vacuum...end.
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
pgbench: error: connection to server at xxxxDB (172.31.28.185), port 5432 failed: FATAL:  remaining connection slots are reserved for non-replication superuser connections
transaction type: <builtin: select only>
scaling factor: 4
query mode: simple
number of clients: 600
number of threads: 20
number of transactions per client: 10
number of transactions actually processed: 0/6000
pgbench: fatal: Run was aborted; the above results are incomplete.
```

沒有使用 ThreadPool 情況超過 max_connection 就會出現異常導致無法完成請求

### 有 ThreadPool 測試資料 (RDS-Proxy)

我個人覺得 [RDS-proxy](https://docs.aws.amazon.com/zh_tw/AmazonRDS/latest/UserGuide/rds-proxy-setup.html) 官網使用簡介蠻詳細的可以參考就可以建立這邊就不多贅述

```cmd
pgbench (14.1 (Ubuntu 14.1-1.pgdg20.04+1), server 11.10)
starting vacuum...end.
transaction type: <builtin: select only>
scaling factor: 4
query mode: simple
number of clients: 100
number of threads: 20
number of transactions per client: 10
number of transactions actually processed: 1000/1000
latency average = 97.921 ms
initial connection time = 562.785 ms
tps = 1021.229315 (without initial connection time)

pgbench (14.1 (Ubuntu 14.1-1.pgdg20.04+1), server 11.10)
starting vacuum...end.
transaction type: <builtin: select only>
scaling factor: 4
query mode: simple
number of clients: 200
number of threads: 20
number of transactions per client: 10
number of transactions actually processed: 2000/2000
latency average = 110.732 ms
initial connection time = 1095.188 ms
tps = 1806.162627 (without initial connection time)

pgbench (14.1 (Ubuntu 14.1-1.pgdg20.04+1), server 11.10)
starting vacuum...end.
transaction type: <builtin: select only>
scaling factor: 4
query mode: simple
number of clients: 300
number of threads: 20
number of transactions per client: 10
number of transactions actually processed: 3000/3000
latency average = 205.738 ms
initial connection time = 1474.857 ms
tps = 1458.164531 (without initial connection time)

pgbench (14.1 (Ubuntu 14.1-1.pgdg20.04+1), server 11.10)
starting vacuum...end.
transaction type: <builtin: select only>
scaling factor: 4
query mode: simple
number of clients: 400
number of threads: 20
number of transactions per client: 10
number of transactions actually processed: 4000/4000
latency average = 288.763 ms
initial connection time = 1798.422 ms
tps = 1385.217102 (without initial connection time)


pgbench (14.1 (Ubuntu 14.1-1.pgdg20.04+1), server 11.10)
starting vacuum...end.
transaction type: <builtin: select only>
scaling factor: 4
query mode: simple
number of clients: 400
number of threads: 20
number of transactions per client: 10
number of transactions actually processed: 5000/5000
latency average = 288.763 ms
initial connection time = 1798.422 ms
tps = 1342.151131 (without initial connection time)

pgbench (14.1 (Ubuntu 14.1-1.pgdg20.04+1), server 11.10)
starting vacuum...end.
transaction type: <builtin: select only>
scaling factor: 4
query mode: simple
number of clients: 600
number of threads: 20
number of transactions per client: 10
number of transactions actually processed: 6000/6000
latency average = 525.494 ms
initial connection time = 2539.418 ms
tps = 1141.782562 (without initial connection time)

pgbench (14.1 (Ubuntu 14.1-1.pgdg20.04+1), server 11.10)
starting vacuum...end.
transaction type: <builtin: select only>
scaling factor: 4
query mode: simple
number of clients: 700
number of threads: 20
number of transactions per client: 10
number of transactions actually processed: 7000/7000
latency average = 452.461 ms
initial connection time = 3174.766 ms
tps = 1547.095351 (without initial connection time)
```

## RDS Proxy 使用前後比較

在 `max_Connection = 550` 壓力測試結果如下

發現在 `connection = 100` 時沒有 proxy 效率比有proxy好，但併發 coonnection 上升後效率就急速下降,反而 Proxy 就很穩定 rps 一直在 1000 以上

![](https://i.imgur.com/PsnxBAZ.png)

![](https://i.imgur.com/1uZjGgU.png)

> 另外一般情況如果 connection 數量大於 `max_Connection` 就會噴出錯誤，這時有使用 ThreadPool 就是一個很好的保護機制，會進入 queue 消化請求

## 小結

在 SqlServer 預設有 ConnectionPool 但在 Postgresql 就要自己注意，我個人是建議要在 postgresql DB 前面使用 ThreadPool 一來更有穩定效率，二來在大量請求來時不會出 error.

