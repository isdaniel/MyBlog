---
title: Appveyor搭配Github自動化上傳Nuget
date: 2020-01-27 23:10:43
tags: [CICD,Appveyor,C#,netcore]
categories: [CICD]
---

## 前文

現在CICD越來越普遍,如要提高開發效率和自動化部屬跟Deploy系統有密不可分關係.

今天跟大家分享我開源專案[ElectronicInvoice_TW](https://www.nuget.org/packages/ElectronicInvoice_TW/)如何利用
Github + Appveyor 來完成自動Deploy Package至Nuget上.

## 關於Appveyor

[Appveyor](https://www.appveyor.com/docs/)是一個CI平台,可以透過Github Webhock來觸發一列動作來完成自動化部屬和建置

> 甚至Appveyor也有提供Nuget平台提供給開發人員.

使用GitHub帳號登入後,我們透過`NEW PROJECT`建立一個CI Job.

![](https://i.imgur.com/YPKBuFQ.png)

選擇我們要建立CICD專案.

![](https://i.imgur.com/FW4Pd0j.png)

最後會在Project頁看到你剛剛新建立Project.

![](https://i.imgur.com/vA6DIjh.png)

## 建立Appveyor pipline

在Appveyor有兩種方式可以來產生建置專案的pipline

* 透過UI來操作設定
* 透過appveyor.yml設定(專案root目錄)

本文章我會介紹如何**透過appveyor.yml設定**

我使用我的開源專案[ElectronicInvoice_TW](https://github.com/isdaniel/ElectronicInvoice_TW)來當作這次範例.

### appveyor.yml

這裡介紹幾個yml重要的屬性

* image：指定Build的IDE VS版本.
* before_build：建置專案前要執行步驟
* build_script：建置專案時要執行步驟
* after_build：建置專案完成執行步驟
* deploy：將你建置完artifact deploy到某個地方
* artifacts：存放artifact位置
* environment：設定環境變數

```yml
image: Visual Studio 2019
version: build '{build}'
configuration: Release
platform: Any CPU
before_build:
- cmd: nuget restore src\ElectronicInvoice.sln

environment:
  my_variable:
    secure: GWztiV993airUIgYQa/8Yp0jZuZ9IWVjAJDxwBRTOvN2C5pBqlArgsUY4uqrGujp
  
build:
  publish_nuget: true
  
build_script:
  - dotnet build src\ElectronicInvoice.sln
  - dotnet test  src\ElectronicInvoiceTests
after_build:
  - dotnet pack src\ElectronicInvoice.Produce

deploy:
  - provider: NuGet
    api_key:
      secure: GWztiV993airUIgYQa/8Yp0jZuZ9IWVjAJDxwBRTOvN2C5pBqlArgsUY4uqrGujp
    on:
        branch: master
    artifact: /.*(\.|\.s)nupkg/

nuget:
  project_feed: true
        
artifacts:
  - path: '**\*.nupkg'
  - path: '**\*.snupkg'
```

`deploy` Propert決定建置完成後要如何發布artifacts
對於Nuget中有幾個重要成員屬性

* provider：NuGet(Bj4)
* api_key：
  * `secure`是Deploy Nuget使用API Key(需要透過appveyor加密稍後會跟大家說如何完成)
* branch：只有哪個Branch觸發Job才需要上傳檔案.
* artifact：查找需要上傳檔案資訊

這個YML設定檔有下面流程

1. nuget restore.
2. build .net core專案
3. 執行unit test
4. 發布package到Nuget(只限於master)

> 有沒有發現除了寫code和commit code剩下都是由自動化幫我們處理(目前merge request也可以跑自動化,但不會上傳nuget)

### api_key的secure

在Appveyor設定頁面有個Encrypt YAML頁面,這個頁面很重要可以幫你把重要資料加密起來,所以在Github上看到api_key的secure是我們加密過的.

![](https://i.imgur.com/VRbUO5i.png)

最後就把我們寫好的YML檔案放到專案根目錄,Appveyor預設會在根目錄查找YML檔案並執行腳本.

這是之前跑ElectronicInvoice_TW專案[紀錄](https://ci.appveyor.com/project/isdaniel/electronicinvoice-tw/builds/37118985)歷程

## 小結

透過Appveyor我們可以建立一套完整CICD開發上板流程,只要Commit Code並Merge進master就可以自動化發布程式碼跟Nuget.

參考連結：https://www.appveyor.com/docs/nuget/
