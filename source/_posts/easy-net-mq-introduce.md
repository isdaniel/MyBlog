---
title: 
date: 2021-06-25 22:30:52
tags: [javascript,vue.js,Restcountries]
categories: [javascript,vue.js]
top:
photos: 
    - "https://i.imgur.com/YEzuPKY.png"
---

## 前文

現今越來越多系統使用MQ來達成非同步並來提升系統吞吐量，我今天想要介紹的是[EasyNetQ](https://easynetq.com/)一個封裝RabbitMq Client .net框架

* 小型DI容器
* 對於RabbitMq封裝
* 對於連接使用lazy connection連接RabbitMq

> If the server disconnects for any reason (maybe a network fault, maybe the RabbitMQ server itself has been bounced), EasyNetQ will revert to polling the endpoint until it can reconnect.

使用EasyNetQ來操作RabbitMq簡單很多，但在使用上有些地方需要注意

本篇會再跟大家分享

## RabbitMq Client vs EasyNetQ程式碼比較

我會使用之前使用RabbitMq Client寫的範例利用EasyNetQ來改寫一次.

程式原始碼 [Sample Code](https://github.com/isdaniel/BlogSample/tree/master/src/Samples)

### Publisher程式碼

這是使用RabbitMq Client寫的版本

```c#
//建立連接工廠
ConnectionFactory factory = new ConnectionFactory
{
    UserName = "guest",
    Password = "guest",
    HostName = "localhost"
};

string exchangeName = "my.Exchange";
string routeKey = "my.routing";
string queueName = "my.queue";

using (var connection = factory.CreateConnection())//创建通道
using (var channel = connection.CreateModel())
{
    #region 如果在RabbitMq手動建立可以忽略這段程式
    //建立一個Queue
    channel.QueueDeclare(queueName, true, false, false, null);
    //建立一個Exchange
    channel.ExchangeDeclare(exchangeName, ExchangeType.Direct, true, false, null);
    //把Queue跟Exchange
    channel.QueueBind(queueName, exchangeName, routeKey); 
    #endregion

    Console.WriteLine("\nRabbitMQ連接成功,如需離開請按下Escape鍵");

    string input = string.Empty;
    do
    {
        input = Console.ReadLine();

        var messageBytes = Encoding.UTF8.GetBytes(input);
        channel.BasicPublish(exchange: exchangeName,
                              routingKey: routeKey,
                              body: messageBytes);

    } while (Console.ReadKey().Key != ConsoleKey.Escape);
}
```

我在利用EasyNetQ改寫後變的如下，是不是簡潔很多?

> 因為EasyNetQ幫我們把一些程式封裝起來讓我們關注發送訊息

```c#
string exchangeName = "my.Exchange";
string routeKey = "my.routing";
string queueName = "my.queue";


using (var bus = RabbitHutch.CreateBus("host=127.0.0.1;port=5672;username=guest;password=guest").Advanced)
{
    var exchange = bus.ExchangeDeclare(exchangeName, ExchangeType.Direct);
    var queue = bus.QueueDeclare(queueName);
    bus.Bind(exchange, queue, routeKey);

    Console.WriteLine("請輸入訊息!");

    do
    {
        string input = Console.ReadLine();

        bus.Publish(exchange, "my.routing", false, new Message<string>(input));

    } while (Console.ReadKey().Key != ConsoleKey.Escape);
}
```

如果你是用RabbitMQ Client可以正常收訊息EasyNetQ發送訊息，但如果使用EasyNetQ收RabbitMQ Client發送的訊息就會有問題是為什麼呢？

稍後會跟大家揭密.

### RabbitMQ Consumer 程式碼

```c#
ConnectionFactory factory = new ConnectionFactory
{
    UserName = "guest",
    Password = "guest",
    HostName = "127.0.0.1",
    Port = 5672
};

string queueName = "DirectQueue";

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
```

我在利用EasyNetQ改寫後變如下

```c#
string queueName = "my.queue";

using (var bus = RabbitHutch.CreateBus("host=127.0.0.1;port=5672;username=guest;password=guest"))
{
    Task.Run(() =>
    {
        while (true)
        {
            bus.SendReceive.Receive<string>(queueName, (m) =>
            {
                Console.WriteLine(m);
            });
        }
    });
    Console.WriteLine("開始接收訊息");
    Console.ReadKey();
}
```

可以看到EasyNetQ在API資料封裝幫我們做了些事情(原本RabbitMQ Client使用`byte[]`來傳輸資料，而EasyNetQ幫我們提供可以使用泛型或物件的方式傳遞)

> 但EasyNetQ部分功能也不會平白產生，在MQ Header那邊有做些手腳.還記得我前面說的那個問題嗎?
> 如果你是用RabbitMQ Client可以正常收訊息EasyNetQ發送訊息，但如果使用EasyNetQ收RabbitMQ Client發送的訊息就會有問題是為什麼呢？

## EasyNetQ小秘密

上面我有留一個問題

> 如果你是用RabbitMQ Client可以正常收訊息EasyNetQ發送訊息，但如果使用EasyNetQ收RabbitMQ Client發送的訊息就會有問題是為什麼呢？

如果你用EasyNetQ收RabbitMQ Client發送的訊息會發現Queue中會多出`EasyNetQ_Default_Error_Queue`(這個是收集`EasyNetQ`錯誤的Queue).

錯誤訊息如下圖

![](https://i.imgur.com/FCB5JZp.png)

如果知道的小夥伴可以忽略此節，但如果不知道的人我推薦你要來了解一下

我們先利用EasyNetQ Publisher送一些訊息，再RabbitMq瀏覽畫面點選Queue

![](https://i.imgur.com/aVgYaQg.png)

點選**Get messages**並按下Get Message按鈕，能看到`Properties`中有`type:System.String, System.Private.CoreLib`.

![https://i.imgur.com/5xoyQ0E.png](https://i.imgur.com/5xoyQ0E.png)

聰明如你應該可以猜到原來EasyNetQ之所以可以在Publisher和Comsumer之間使用泛型是因為EasyNetQ在Property使用type來傳輸使用Type資訊.

在Comsumer可以利用這些資訊來組裝物件.

> 這邊有點要注意，因為她是傳送Type資訊，假如你兩個lib都有一個`Person`類別且裡面`Property`名稱,類型都一樣，但Publisher和Comsumer之間利用泛型轉換會報錯
> 因為兩個lib的`Person`類別Type的metadata資訊不一樣

## 小結

有了EasyNetQ操作RabbitMq就簡單許多，但我個人覺得目前API還可以再加強多封裝些不一樣的情境，目前提供API有點少.

> 目前如果要用特別一點的需求可以利用`IAdvancedBus`來完成

另外EasyNetQ也有DI Container只是我還沒研究，等之後研究在跟大家分享