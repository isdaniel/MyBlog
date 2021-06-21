---
title: Docker深入淺出(一)
date: 2021-03-26 05:30:11
tags: [Docker,Container]
categories: [Docker]
top:
photos: 
    - "https://gblobscdn.gitbook.com/assets%2F-LvLdlWILWa_WXgBI_eY%2F-LvLdmMmmDnQXr_Axo0l%2F-LvLdnbuSZ5KOT0JxN9C%2Fcmd_logic.png?alt=media"
---

## 前言:

docker透過指令能快速建立相同執行環境並比起VM減少電腦資源消耗.

依照上面優點這就是為什麼docker可以在短時間內快速串紅.

> 上圖來源[《Docker —— 從入門到實踐­》正體中文版](https://philipzheng.gitbook.io/docker_practice/appendix_command/)

我在網路上找到很棒一個Docker操作流程圖,概括Docker操作時會用到的指令和動作關係.

因為外面有很多blog有對於Docker指令介紹本篇不著重在介紹指令,想要跟大家分享Docker其他細節.

## 關於Window中的Docker

如果我們需要在Prod運行一個系統可能需要許多不同的程式架構和語言才能完成(甚至有OS限制),在傳統我們選擇使用VM來幫建立不同環境來承載不同程式架構，但VM會模擬OS導致非常肥大,安裝使用資源較大,而Container的Image可以依照我們需求來客製我們需要核心並且Container可以宿主核心達到效能較佳的利用

在Window10 我們可以利用HyperV來跑Docker,原因是HyperV類似一個虛擬機幫我們模擬Linux並且運行Docker Daemon來控管docker container.

> Docker需要在Linux中執行,Docker Daemon幫助Client透過命令來操作Docker,如果沒有Docker Daemon我們就無法執行Docker搂.

## Image && Container

Image有點類似程式語言中的類別,Docker透過Image建立Container物件

Container類似程式語言中物件,透過Image(類別)建立出許多不同物件.

> 可以透過`docker inspect {Container Id or name}`查看Container資訊

* -f:此參數可以透過go template查看設定值
* --link:此參數會在/etc/hosts 下加入網路資訊

## UnionFS

Docker有一個[UnionFS](https://en.wikipedia.org/wiki/UnionFS)概念共享Host Linux核心資源,不在建立新的OS層,docker會使用到bootfs和rootfs

* bootfs:包含了bootloader和Linux core。使用者是不能對這層作任何修改。
* rootfs:包含了一般系统上的常見目錄結構，類似/dev, /proc, /bin等等以及一些基本的文件和命令。

Image就像一個雞蛋核心是蛋黃，蛋白包覆蛋黃，最外層是蛋殼，雖然我們`docker pull redis`，但這個redis Image可能包含其他Image資訊(因為這樣才可以正常運行)

`UnionFS`設計可以很好的讓我們來重複利用不同Image往上搭建出我們想要的環境.

![](https://i.imgur.com/J8wyEQV.png)

> 上圖來自網路上

### scratch Image

[scratch](https://docs.docker.com/glossary/#base_image)是所有Image的Base(有點像是C# object class),所有Image基於scratch往上搭建.

> scratch Image只會包含最基本資訊可以跑起Container

## Dockerfile

Dockerfile用來建置描述，我們要建立Image資訊

下面是Dockerfile我認為比較重要幾個關鍵字.

* FROM:此Image是基於哪個Image
* MAINTANER:維護作者
* RUN:Container執行要跑的命令
* EXPOSE:暴露port.
* WORKDIR:Docker跑起來時,預設使用目錄
* ENV:建立環境變數(環境變數可以當作後續命令參數使用)
* ADD:Host主機目錄下複製檔案進Image且**自動處理解壓tar壓縮包**.
* COPY:複製檔案從Host主機目錄到Image中.
* VOLUME:保存Container數據資料持久化
* CMD:指定容器Run時要使用的命令(只有最後一個CMD命令才會被執行,會被run最後執行命令覆蓋)
* ENTRYPOINT:指定容器Run時要使用命令(不會被docker run覆蓋命令,他會追加執行命令)
> 如果 Dockerfile 中如果存在多個ENTRYPOINT，只有最後一個才會生效

這裡有一點要注意Dockerfile使用關鍵字**必須是大寫**.

另外Dockerfile指令每執行一次都會在docker上新建一層。所以多過無意義層數，會造成Image膨脹過大。

### Dockerfile Demo

這是我的一個[SqlServer](https://github.com/isdaniel/DockerDemo/blob/master/SqlServer/Dockerfile) Demo Image

```dockerfile
#this image create from mssql-server-linux:latest
FROM microsoft/mssql-server-linux:latest
#who maintance this file.
MAINTANER dog830228@gmail.com
#execute command in Linux
RUN apt-get update  \
	&& apt-get install -y curl \
	apt-transport-https
#set environment variable.
ENV BakDir="/var/opt/mssql/backup"
ENV PATH="/opt/mssql-tools/bin:${PATH}"

RUN curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add - \
    && curl https://packages.microsoft.com/config/ubuntu/16.04/prod.list > /etc/apt/sources.list.d/mssql-release.list

RUN apt-get install -y locales \
    && echo "en_US.UTF-8 UTF-8" > /etc/locale.gen \
    && locale-gen \
	&& apt-get -y install vim

## copy host file ./script/ to image /var/opt/mssql/backup
COPY ./script/ $BakDir
## set default path /var/opt/mssql/backup when client into container
WORKDIR $BakDir

## downland bak file from internet.
RUN mkdir -p $BakDir \
	&& curl -L -o AdventureWorksDW2017.bak https://github.com/Microsoft/sql-server-samples/releases/download/adventureworks/AdventureWorksDW2017.bak

## execute command after running.
CMD /bin/bash "$BakDir/EntryPoint.sh"
```

Dockerfile寫下註解，我們能了解到Dockerfile就一個描述Image的檔案.
