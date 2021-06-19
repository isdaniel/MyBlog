---
title: RabbitMQ (二) 概念
date: 2019-06-03 22:30:11
tags: [C#,RabbitMQ,MQ]
categories: [C#]
---

## 介紹RabbitMQ 

RabbitMQ是個訊息仲介（broker），主要是利用消息把生產者跟消費者解耦合

在RabbitMQ主要有以下角色

1.  產生者（producer）
2.  接收者（consumer）
3.  佇列（Queue）
4.  交換器(Exchange)
5.  訊息(Message)

上面太抽象?  讓我來舉一個簡單點的例子

我們要寄信會把信投進郵筒，信件統一送到郵局，由分配至各個區域郵差去寄送信件

在此可把上面的角色對應在RabbitMQ上

1.  產生者（producer）= 寄信人
2.  接收者（consumer） = 收件人
3.  佇列（Queue）= 郵差
4.  交換器(Exchange) = 郵筒
5.  訊息(Message)  = 信件

下面是我畫RabbitMq運作流程圖

![](https://i.imgur.com/uvXHTmW.png)

* * *

### RabbitMQ 腳色簡圖

*   產生者(P)
*   接收者(C)
*   佇列（Queue）
*   交換器(E)

### ![](https://dotblogsfile.blob.core.windows.net/user/九桃/09cafcb7-aeab-46e6-a73d-7d2cc8e089ac/1548173424_68039.png)

[中間黑框]是RabbitMQ (Broker) 幫助 (P)和(C) 解耦合

### Exchange 概念

生產者發送訊息時會經由Exchange來決定要給哪個Queue.

Exchange分發訊息根據類型的不同分發策略有區別

目前共四種類型：

1.  Direct
2.  Fanout
3.  Topic
4.  Headers 

### Direct 

生產者傳送訊息中 RouteKey 必須跟 Queue binding key **一致** Exchange才會把資料送到Queue中.

如果一個Queue binding 到 Exchange 要求路由鍵為 "Daniel"，只接收 Routing key 是 “Daniel”的訊息，不會轉發“Daniel1”，RouteKey需完全匹配．

使用 Direct 交換器 可當作寄信需要  RouteKey (標註) 要由哪個 Queue (郵差)接收轉送此訊息,Queue (郵差)會藉由此 RouteKey (標註) 找到相對應消費者

![](https://dotblogsfile.blob.core.windows.net/user/九桃/04e4a734-32c7-4c11-97e6-9d7a194dcbc0/1554261004_68269.png)

## Fanout

fanout 交換器不處理Route Key,簡單來說就是輪流把消息放進每個Queue中.

使用 fanout 交換器 把 信件(Message) 給 所有 郵差(Queue) 每個消費者都會收到此 信件(Message) 

在現實生活中有點類似經由  fanout交換器 (郵筒) 將傳單夾入所有信件中讓郵差發給所有人

![](https://dotblogsfile.blob.core.windows.net/user/九桃/04e4a734-32c7-4c11-97e6-9d7a194dcbc0/1554261165_39274.jpg)

## Topic

Topic交換器和 Direct 交換器都需要查看 來分配訊息(RouteKey)和Binding中的binding key是否一致,但Topic交換器使用部分匹配比Direct 交換器多了更多彈性。

Topic交換器提供兩種方式

1.  ** #** 匹配0個或多個單字
2.  ** *** 匹配不多不少一個單字

例如 有兩個Queue (binding key)分別是 App.# 和 App.*

經由Topic交換器分配一個訊息RouteKey是 App.Daniel 則都會將資料塞入兩個 Queue (binding key) 為 App.# 和 App.* 

但如果另一個訊息RouteKey是 App .Daniel.Test 只會塞入 Queue (binding key) 為 App.# ,另一個  Queue (binding key) 是 App.*  不被匹配

在現實生活中有點類似 發送 信件(Message) 經由  Topic交換器 (郵筒) 會依照上面的區域 (例如台北縣,宜蘭縣)​​ 來分配相對應的區域信件轉交給 Queue (郵差) 給消費者

![](https://dotblogsfile.blob.core.windows.net/user/九桃/04e4a734-32c7-4c11-97e6-9d7a194dcbc0/1554261121_78429.png)

參考來源：

https://www.jianshu.com/p/79ca08116d57

