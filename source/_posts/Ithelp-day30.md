---
title:　鐵人賽完賽＆總結　(第30天)
date: 2019-10-11 10:00:00
tags: [C#,Asp.net,Asp.net-MVC,SourceCode,11th鐵人賽]
categories: [11th鐵人賽]
---

# Agenda<!-- omit in toc -->
- [完賽感想](#%e5%ae%8c%e8%b3%bd%e6%84%9f%e6%83%b3)
- [感謝這次的夥伴 [IT成長團]](#%e6%84%9f%e8%ac%9d%e9%80%99%e6%ac%a1%e7%9a%84%e5%a4%a5%e4%bc%b4-it%e6%88%90%e9%95%b7%e5%9c%98)
- [學習到新知識 (Expression表達式)](#%e5%ad%b8%e7%bf%92%e5%88%b0%e6%96%b0%e7%9f%a5%e8%ad%98-expression%e8%a1%a8%e9%81%94%e5%bc%8f)
- [設計模式運用在實戰中](#%e8%a8%ad%e8%a8%88%e6%a8%a1%e5%bc%8f%e9%81%8b%e7%94%a8%e5%9c%a8%e5%af%a6%e6%88%b0%e4%b8%ad)
- [透過**MVC**某區塊概念,引發建立開源專案想法](#%e9%80%8f%e9%81%8emvc%e6%9f%90%e5%8d%80%e5%a1%8a%e6%a6%82%e5%bf%b5%e5%bc%95%e7%99%bc%e5%bb%ba%e7%ab%8b%e9%96%8b%e6%ba%90%e5%b0%88%e6%a1%88%e6%83%b3%e6%b3%95)
- [文章目錄](#%e6%96%87%e7%ab%a0%e7%9b%ae%e9%8c%84)
  - [01 ~ 08 Day 介紹Http請求到MVC前Asp.net做了些什麼事情](#01--08-day-%e4%bb%8b%e7%b4%b9http%e8%ab%8b%e6%b1%82%e5%88%b0mvc%e5%89%8daspnet%e5%81%9a%e4%ba%86%e4%ba%9b%e4%bb%80%e9%ba%bc%e4%ba%8b%e6%83%85)
  - [09 ~ 25 Day 介紹MVC原始碼](#09--25-day-%e4%bb%8b%e7%b4%b9mvc%e5%8e%9f%e5%a7%8b%e7%a2%bc)
  - [26 ~ 29 Day 對於MVC進行擴充改造](#26--29-day-%e5%b0%8d%e6%96%bcmvc%e9%80%b2%e8%a1%8c%e6%93%b4%e5%85%85%e6%94%b9%e9%80%a0)

## 完賽感想

這三十天無法對於**MVC**全部原始碼做詳細介紹,我盡量在這三十篇講述**MVC**執行過程中重要知識點,閱讀**MVC**原始碼真不是很簡單事情.

但閱讀完後我對於OOP和**如何合理**撰寫程式碼一個系統有更深入了解(因為**MVC**很多地方很好運用OOP概念原則)

希望大家經過閱讀這三十篇文章可以對於**IIS**託管和**Asp.net MVC**原理有更深入了解.

1. `Http`對於`IIS Server`請求如何導向`Asp.net MVC`執行
2. `Asp.net MVC`原始碼有基本了解和知道哪幾個重要類別,了解後能依照系統需要替換改寫.
3. `Asp.net MVC`用到很多設計技巧,希望大家能更了解設計模式如何運用在實戰中
4. 可以嘗試閱讀其他知名的開源框架(`Dapper`,`AutoMapper`,`Autofac`,`Json.net`.....)

> 如果想要了解`Dapper`原理讀者我推薦去閱讀,我隊友`暐翰`系列文章[進階學習 ADO.NET、Dapper、Entity Framework 系列](https://ithelp.ithome.com.tw/articles/10215127)寫得很詳細且有影片教學大推!!

## 感謝這次的夥伴 [IT成長團]

感謝這次可以跟**IT成長團**的大家一起參與並完成**It邦幫忙**鐵人活動.

這三十天大家一起鼓勵,互相叮嚀鼓勵.這種感覺真的很棒 :)

下面是隊友們寫的優質系列文章,推薦大家一同去閱讀.

* 小魚 :[Laravel從入門到放棄…………原生PHP (疑?](https://ithelp.ithome.com.tw/users/20105694/ironman/2139)

* 暐翰 :[進階學習 ADO.NET、Dapper、Entity Framework ](https://ithelp.ithome.com.tw/users/20105988/ironman/2161)

* Peter學程式 :[超緊繃!30天Vue.js學習日記](https://ithelp.ithome.com.tw/users/20110850/ironman/2171)

* 神Q超人 :[在 React 生態圈內打滾的一年 feat. TypeScript](https://ithelp.ithome.com.tw/users/20106935/ironman/2188)

* Victor :[使用 Laravel 打造 RESTful API](https://ithelp.ithome.com.tw/users/20105865/ironman/2466)

希望明年還有機會可以跟大家一起在參加鐵人賽衝一波,寫文章.

## 學習到新知識 (Expression表達式)

以前碰到動態建立物件或動作,我都是使用反射技巧來完成,透過了解`ActionMethodDispatcher`類別原始碼探討為何**MVC**不使用反射卻,而使用`Expression`表達式完成動態呼叫需求.

查了資料進而了解到`Expression`表達式用法且他想解決的問題,對於未來有多了一項武器可以運用.

## 設計模式運用在實戰中

設計模式不是紙上談兵,某些問題會使用某些方法來解決.

> 筆者對於設計模式也略有研究,對於[DesignPattern](https://github.com/isdaniel/DesignPattern)有一個`Repository`做介紹,陸陸續續會補上我對於`Design Pattern`在現實生活上理解

**MVC**使用的許多設計模式和技巧,使用這些模式為了可讓程式變得好理解有意義

> 商業邏輯讓程式變複雜是必然,我們能做的是讓程式碼變得不會太難理解可以更好擴充

每個設計模式都有適合使用場景.

* `工廠模式`: 將使用動作和產生物件做一個區隔(依賴一個抽象).
* `代理模式`: 提供一個代理人不用對於原有程式碼進行修改(`AOP`就是利用此模式概念)
* `裝飾者模式`: 適合在需要一直改變物件狀態的情境
* `建立者模式`: 提供一個建立管道讓使用的提供要建立物件,最後可透過此模式來方便替換

還有許多模式就不一一介紹

像我很久之前就學過組合模式,只是對於此模式運用場景一直找不到.

直到看到[複雜模型和簡單模型綁定](https://ithelp.ithome.com.tw/articles/10222831#response-311747)如何將**組合模式**運用在實戰中.

## 透過**MVC**某區塊概念,引發建立開源專案想法

筆者看完`Filter`機制後就有感而發,這麼好用的方式可否運用在`Service`或其他地方(非`Asp.net MVC`,`Web API`區域).

我就依照上面標籤概念建立一個[AwesomeProxy.Net](https://github.com/isdaniel/AwesomeProxy.Net)AOP框架基於`RealProxy`這個物件.

想知道詳細資訊的讀者可自行查閱`AwesomeProxy.Net`的`Readme.md`.

看完三十篇分享文後,希望台灣會有越來越多大大投入開源社群,我個人感觸是投入社群後我觸碰,接觸事物比我想想遠遠多很多.

## 文章目錄

此系列文分成三大部分

### 01 ~ 08 Day 介紹Http請求到MVC前Asp.net做了些什麼事情

[[Day01] (開賽)Http 請求 Asp.net IIS伺服器架構](https://ithelp.ithome.com.tw/articles/10214877)

[[Day02] Asp.Net支柱 IHttpMoudle & IHttphandler](https://ithelp.ithome.com.tw/articles/10214999)

[[Day03] 啟動吧!Asp.Net IsapiRunTime & HttpRuntime](https://ithelp.ithome.com.tw/articles/10215221)

[[Day04] 掌控HttpApplication物件建立 - HttpApplicationFactory](https://ithelp.ithome.com.tw/articles/10215400)

[[Day05] Asp.Net重要物件HttpApplication(一) 初始化建立IHttpMoudule](https://ithelp.ithome.com.tw/articles/10215676)

[[Day06] Asp.Net重要物件HttpApplication(二) 建置執行管道](https://ithelp.ithome.com.tw/articles/10216299)

[[Day07] Asp.Net重要物件HttpApplication(三) 取得執行的IHttpHandler](https://ithelp.ithome.com.tw/articles/10216960)

[[Day08] 揭密Mvc使用IHttpHandler by UrlRoutingModule-4.0](https://ithelp.ithome.com.tw/articles/10217375)

### 09 ~ 25 Day 介紹MVC原始碼

[[Day09] 進入MVC原始碼世界 Route & RouteTable 原始碼解析](https://ithelp.ithome.com.tw/articles/10217973)

[[Day10] 透過MvcRouteHandler取得呼叫IHttphandler](https://ithelp.ithome.com.tw/articles/10218521)

[[Day11] Asp.net MVC Controller是怎麼被建立(原始碼揭密)](https://ithelp.ithome.com.tw/articles/10219020)

[[Day12] 談談Controller幾個重要成員](https://ithelp.ithome.com.tw/articles/10219477)

[[Day13] Asp.net MVC如何實現IOC解析器](https://ithelp.ithome.com.tw/articles/10219981)

[[Day14] 反轉起來~透過IOC解析來執行依賴反轉](https://ithelp.ithome.com.tw/articles/10220510)

[[Day15] Action方法如何被執行InvokeAction(一)](https://ithelp.ithome.com.tw/articles/10220964)

[[Day16] MVC Filter 機制解密](https://ithelp.ithome.com.tw/articles/10221403)

[[Day17] Action方法如何被執行InvokeAction(二)](https://ithelp.ithome.com.tw/articles/10221908)

[[Day18] 提供ModelBing幾個重要功臣(Model)](https://ithelp.ithome.com.tw/articles/10222341)

[[Day19] Http參數如何綁定到Action參數上(簡單和複雜模型綁定探討)](https://ithelp.ithome.com.tw/articles/10222831)

[[Day20] 探討Model上客製化標籤如何被解析使用](https://ithelp.ithome.com.tw/articles/10223247)

[[Day21] Model 探討驗證標籤(ValidationAttribute)](https://ithelp.ithome.com.tw/articles/10223704)

[[Day22] View是如何被建立(一)](https://ithelp.ithome.com.tw/articles/10224092)

[[Day23] 6個基本(ActionResult) View是如何被建立(二)](https://ithelp.ithome.com.tw/articles/10224542)

[[Day24] 探討ViewEngine機制 View是如何被建立(三)](https://ithelp.ithome.com.tw/articles/10224865)

[[Day25] 動態產生程式碼(WebViewPage) View是如何被建立(四)](https://ithelp.ithome.com.tw/articles/10225229)

### 26 ~ 29 Day 對於MVC進行擴充改造

[[Day26] 動手DIY改造 Asp.net MVC- Route解析機制](https://ithelp.ithome.com.tw/articles/10225616)

[[Day27] 動手DIY改造 Asp.net MVC- 自己動作建立一個DependencyResolver解析器(Autofac)](https://ithelp.ithome.com.tw/articles/10225993)

[[Day28] 動手DIY改造 Asp.net MVC- 建立自己ActionInvoker和Model綁定機制](https://ithelp.ithome.com.tw/articles/10226285)

[[Day29] 動手DIY改造 Asp.net MVC- 擴充在擴充,強化WebViewPage製作多國貨幣機制](https://ithelp.ithome.com.tw/articles/10226680)
