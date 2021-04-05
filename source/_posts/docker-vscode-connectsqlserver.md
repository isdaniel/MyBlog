---
title: 快速建立連接 MSSQL By Docker + VSCode
date: 2021-03-13 22:30:11
tags: [Docker,SSMS,VSCode]
categories: [Docker]
---

## 前言

如果我們在Local或測試環境需要建立一個連接MSSQL環境，傳統需要安裝MSSQL和SSMS

但現在有一個更快速輕便方法，就是使用Docker建立MSSQL環境 + VSCode Extension充當SSMS.

安裝時間不僅更快且需要花的空間更小,且可以在`Linux`使用

## Docker建立MSSQL

相信大家都有聽過[Docker](https://www.docker.com/)因為這篇是介紹如何運用Docker建立SSMS,這裡就不介紹太多Docker相關指令意思,有興趣可以自行google.

> Window 10才支援docker,因為docker daemon需要在`Linux`上運作,window需要透過[Hyper-V](https://docs.microsoft.com/zh-tw/virtualization/hyper-v-on-windows/about/)來虛擬化`Linux`.

如果你是使用Window我推薦下在[Docker Desktop](https://www.docker.com/products/docker-desktop),使用UI呈現目前Container有的一些資訊.

如果下載並安裝完Docker可透過`docker info`命令可以查看,目前`Docker`使用資訊

![](https://i.imgur.com/fyz6U56.png)

確認安裝好Docker後,我們就去Docker Hub 下載[microsoft-mssql-server](https://hub.docker.com/_/microsoft-mssql-server) image.

```docker
docker pull mcr.microsoft.com/mssql/server
```

```docker
docker run -d --name dev-sqlserver -it -v D:/SO_DB:/var/opt/mssql/data -e 'ACCEPT_EULA=Y' -e 'SA_PASSWORD=test.123'  -e 'MSSQL_PID=Enterprise'  -p 1466:1433 mcr.microsoft.com/mssql/server:latest
```

* name:(定義Container顯示名稱)
* v：[volume](https://docs.docker.com/storage/volumes/)Docker映射Local路徑 (-v Host path:Container path  volume設定資料夾對應資訊) 這邊很重要,因為`/var/opt/mssql/data`對應SQLServer資料存放路徑,我們可以把要RestoreDB放到`D:/SO_DB`Docker會幫我們做映射(當然`D:/SO_DB`只是我sample放置位置你可以自行更改)
* e:環境變數
  * SA_PASSWORD：sa密碼
  * MSSQL_PID:SQL Server版本
* p：Container跟Local對外對應port(-p Host port:Container port)

執行完上面command後,可以看到你的docker虛擬機已經跑起來了

![](https://i.imgur.com/1DOeOHP.png)

## VsCode SQL Server (mssql)

我們在VsCode安裝 SQL Server (mssql) Extesion

![](https://i.imgur.com/RfAUNTT.png)


安裝完成後會在左邊部分看到一個新Sheet.

![](https://i.imgur.com/agilh0R.png)

我們就可以添加新連接到Docker SQLServer Container中.

下圖是我查詢StackOverFlow sample資料庫結果

![](https://i.imgur.com/rTVD1is.png)

## 小結

透過Docker + VsCode我們可以快速做出簡化版SSMS連結DB,比起安裝一大堆東西來的方便.