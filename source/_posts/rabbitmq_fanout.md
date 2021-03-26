---
title: RabbitMQ (三) Fanout 交換器
date: 2019-06-02 22:30:11
tags: [C#,RabbitMQ,MQ]
categories: [C#]
---

## 前言：

本篇範例使用Fanout 交換器 實現RabbitMQ

在RabbitMQ中有很重要兩個角色，`Produce`r和`Consumer`，下面這個範例使用`c# console`來實現

## Producer

一開始我們宣告一個 ConnectionFactory 並設置RabbitMQ Server連接參數

*   UserName 使用者帳號
*   Password 使用者密碼
*   HostName 連接FQDN或IP

RabbitMQ預設密碼是 `guest`

    //建立連接工廠
    ConnectionFactory factory = new ConnectionFactory
    {
        UserName = "guest",
        Password = "guest",
        HostName = "localhost"
    };

呼叫`factory.CreateConnection` 建立連接RabbitMQ連接物件，並呼叫 `CreateModel `方法建立一個`channel` Model

    using (var connection = factory.CreateConnection())
    using (var channel = connection.CreateModel())
    {
        //建立一個Queue
        channel.QueueDeclare(queueName, false, false, false, null);
        //建立一個Exchange
        channel.ExchangeDeclare(exchangeName, ExchangeType.Fanout, false, false, null);

        channel.QueueBind(queueName,exchangeName,routeKey);

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

## Consumer

前面建立連接都大同小異

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

        channel.QueueBind(queueName, exchangeName, routeKey); //綁定一個消費者

        EventingBasicConsumer consumer = new EventingBasicConsumer(channel);

        //接收到消息事件
        consumer.Received += (ch, ea) =>
        {
            var message = Encoding.UTF8.GetString(ea.Body);

            Console.WriteLine($"Queue:{queueName}收到資料： {message}");
            channel.BasicAck(ea.DeliveryTag, false);
        };

        channel.BasicConsume(queueName, true, consumer);

        Console.ReadKey();
    }

值得一提的是  `EventingBasicConsumer `這個類別有一個建構子函數，把 `channel` 物件傳入產生一個消費者

    EventingBasicConsumer consumer = new EventingBasicConsumer(channel);

在呼叫 `EventingBasicConsumer.Received  `綁定接收訊息事件，

1.  第一個參數是`channel`物件本身
2.  第二個參數是 `Message `(訊息) 資訊

裡面有一個`Body`欄位可取得 傳送的二進制流資料

-----

## Demo

為了簡單演示範例 我讓使用者輸入一個數字來跑迴圈，Producer 會把數字傳給Exchange並平均分配給所有consumer

本次有兩個 consumer 等待接收資訊，我們可以看到Fanout交換器不用指定RouteKey且把訊息平均分配到consumer上

![](https://az787680.vo.msecnd.net/user/九桃/338bdb11-eefe-41ac-a329-188b11796447/1548690458_72118.gif)

程式碼:

        using (var connection = factory.CreateConnection())
        using (var channel = connection.CreateModel())
        {
            //建立一個Queue
            channel.QueueDeclare(queueName, false, false, false, null);
            //建立一個Exchange
            channel.ExchangeDeclare(exchangeName, ExchangeType.Fanout, false, false, null);
            channel.QueueBind(queueName,exchangeName,routeKey);
            Console.WriteLine("\nRabbitMQ連接成功,如需離開請按下Escape鍵");
            Console.WriteLine("請輸入要傳輸的次數");
            string input = Console.ReadLine();
            int times = 0;
            int.TryParse(input, out times);
            for (int i = 1; i <= times; i++)
            {
                var sendBytes = Encoding.UTF8.GetBytes(i.ToString());
                //發布訊息到RabbitMQ Server
                channel.BasicPublish(exchangeName, routeKey, null, sendBytes);
            }
            Console.WriteLine();
        }

