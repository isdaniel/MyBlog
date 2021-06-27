---
title: RabbitMQ (三) 簡單實作一個MQ
date: 2019-06-02 22:30:11
tags: [C#,RabbitMQ,MQ]
categories: [C#]
---

## 前言

本篇利用RabbitMQ client來簡單實現MQ功能.

在RabbitMQ中有很重要兩個角色，`Producer`和`Consumer`，下面這個範例使用`c# console`來實現.

我個人覺得APMQ協議和Http協議有點類似，一樣有Header(Properties)，body...等等概念.

## Producer Code

一開始我們宣告一個 ConnectionFactory 並設置RabbitMQ Server連接參數

* UserName:使用者帳號
* Password:使用者密碼
* HostName:連接FQDN或IP

RabbitMQ預設密碼是 `guest`

    //建立連接工廠
    ConnectionFactory factory = new ConnectionFactory
    {
        UserName = "guest",
        Password = "guest",
        HostName = "localhost"
    };

呼叫`factory.CreateConnection` 建立連接RabbitMQ連接物件，並呼叫 `CreateModel`方法建立一個`channel` Model

> 在之前有說過RabbitMq會利用同一個Connection來建立不同的channel來執行MQ連接.

    using (var connection = factory.CreateConnection())
    using (var channel = connection.CreateModel())
    {
        #region 如果在RabbitMq手動建立可以忽略這段程式
        //建立一個Queue
        channel.QueueDeclare(queueName, false, false, false, null);
        //建立一個Exchange
        channel.ExchangeDeclare(exchangeName, ExchangeType.Direct, false, false, null);
        //把Queue跟Exchange
        channel.QueueBind(queueName, exchangeName, routeKey); 
        #endregion

        Console.WriteLine("\nRabbitMQ連接成功,如需離開請按下Escape鍵");

        string input = string.Empty;
        do
        {
            input = Console.ReadLine();
            var sendBytes = Encoding.UTF8.GetBytes(input);
            //發布訊息到RabbitMQ Server
            channel.BasicPublish(exchangeName, routeKey, null, sendBytes);

        } while (Console.ReadKey().Key != ConsoleKey.Escape);
    }

最後在使用 `channel.BasicPublish `方法 將訊息推送給指定交換器，因為是走tcp所以將訊息轉換成二進制流

-----

## Consumer Code

前面建立連接都大同小異都是利用`ConnectionFactory`來建立連接物件

    ConnectionFactory factory = new ConnectionFactory
    {
        UserName = "guest",
        Password = "guest",
        HostName = "localhost"
    };

    string exchangeName = "exchangeFanout";
    string queueName = "FanoutQueue";
    string routeKey = string.Empty;

    using (var connection = factory.CreateConnection())
    using (var channel = connection.CreateModel())
    {
        //channel.QueueBind
        EventingBasicConsumer consumer = new EventingBasicConsumer(channel);
        channel.BasicQos(0, 1, false);
        //接收到消息事件 consumer.IsRunning
        consumer.Received += (ch, ea) =>
        {
            var message = Encoding.UTF8.GetString(ea.Body);

            Console.WriteLine($"Queue:{queueName}收到資料： {message}");
            channel.BasicAck(ea.DeliveryTag, false);
        };

        channel.BasicConsume(queueName, false, consumer); 
        Console.WriteLine("接收訊息");
        Console.ReadKey();
    }

值得一提的是 `EventingBasicConsumer` 這個類別有一個建構子函數，把 `channel` 物件傳入產生一個消費者

    EventingBasicConsumer consumer = new EventingBasicConsumer(channel);

在呼叫 `EventingBasicConsumer.Received`綁定接收訊息事件，

1. 第一個參數是`channel`物件本身
2. 第二個參數是 `Message `(訊息) 資訊

裡面有一個`Body`欄位可取得 傳送的二進制流資料

-----

## Demo

為了簡單演示範例 我讓使用者輸入一個數字來跑迴圈，Producer 會把數字傳給Exchange並平均分配給所有consumer

本次有兩個 consumer 等待接收資訊，我們可以看到Fanout交換器不用指定RouteKey且把訊息平均分配到consumer上

![](https://dotblogsfile.blob.core.windows.net/user/%E4%B9%9D%E6%A1%83/338bdb11-eefe-41ac-a329-188b11796447/1548690458_72118.gif)

