---
title: RabbitMQ (一) 安裝介紹
date: 2019-06-03 22:30:11
tags: [C#,RabbitMQ,MQ]
categories: [C#]
---

## RabbitMQ是什麼?

RabbitMQ是一個訊息中介軟體 (broker), 他實作​[AMQP標準](https://zh.wikipedia.org/zh-tw/%E9%AB%98%E7%BA%A7%E6%B6%88%E6%81%AF%E9%98%9F%E5%88%97%E5%8D%8F%E8%AE%AE), 特點是消息轉發是非同步並且可靠.

主要用來處理應用程序之間消息的儲存與轉發可讓消費者和生產者解耦合, 消息是基於二進制

因為RabbitMQ Server是用[Erlang](https://zh.wikipedia.org/wiki/Erlang "Erlang")語言編寫，所以在安裝RabbitMQ Server前須先安裝[Erlang](https://zh.wikipedia.org/wiki/Erlang "Erlang")[環境](https://www.erlang.org/downloads)

安裝完後可到[RabbitMq](https://www.rabbitmq.com/download.html)官網下載安裝Server .

以下是常用在CMD使用的使令

* 開啟RabbitMq Server. 

    rabbitmq-server -detached

* 查看RabbitMq狀態 

    rabbitmqctl status

* 查看Queue列表狀態

    rabbitmqctl list_queues

* 查看交換器(Exchange)

    rabbitmqctl list_exchanges

* 查看綁定狀態

    rabbitmqctl list_bindings

## RabbitMQ Server UI

RabbitMq Server 很貼心也有UI版的控制面板,只需在CMD中輸入這個指令 啟用Server UI套件

### rabbitmq-plugins enable rabbitmq_management

![](https://dotblogsfile.blob.core.windows.net/user/九桃/9f6dc914-dd2d-44b0-b8e4-7a3f93d200d2/1547823390_90475.png)

再訪問 [http://localhost:15672/ ](http://localhost:15672/)URL,就可進入這個頁面

![](https://dotblogsfile.blob.core.windows.net/user/九桃/9f6dc914-dd2d-44b0-b8e4-7a3f93d200d2/1547823535_62339.png)

預設帳號密碼都是guest.

#### Rabbitmq run in Docker

使用Docker可以方便建立我們的[Rabbitmq](https://hub.docker.com/_/rabbitmq)

在你電腦安裝完Docker後,只需使用下面指令

```
docker run -d --hostname myrabbit --name RabbitMQ -p 8080:15672 rabbitmq:3-management
```

再訪問 [http://localhost:15672/](http://localhost:15672/)URL,就可進入這個頁面

**Web UI**和Server都會幫我們運行起來

## 小結:

安裝RabbitMQ步驟就這幾步而已 ^^,之後會跟大家分享如何在.Net使用RabbitMQ.
