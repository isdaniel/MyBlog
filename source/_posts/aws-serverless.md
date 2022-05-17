---
title: Serverless + CloudFormation 撰寫 lambda
date: 2022-05-16 22:30:11
tags: [AWS,Lambda,.netcore]
categories: [AWS,Lambda]
---

## 前言

AWS lambda 作為 serverless 服務，之前有介紹過 [AWS Lambda 初體驗 by .net core](aws-first-lambda.md)，本次要介紹 [serverless](https://www.serverless.com/framework/docs) 框架搭配 AWS `CloudFormation` (IaC)

Serverless 預設使用 provider 是 AWS

> AWS is the default cloud provider used by Serverless Framework.

## 建立第一個 serverless

本次案例我們利用 [serverless cli](https://github.com/serverless/serverless#install-via-npm) 建立 dotnet template，利用 nqm 安裝 

```cmd
npm install -g serverless
```

安裝完後建立一個 dotnet core serverless project

```cmd
serverless create -t aws-csharp -n dotnetServerless
```

本次使用參數說明

* --template / -t ：Template for the service
* --name / -n： Name for the service. Overwrites the default name of the created service

跑完命令後會出現下圖專案結構

* Build script： template 產生 build 專案腳本
  * build.cmd：window 使用
  * build.sh：linux 使用
* Handler.cs：template 預設 lambda 呼叫點
* serverless.yml：
  * provider：[Serverless Infrastructure Providers](https://www.serverless.com/framework/docs/providers) AWS,Azure,GCP...
  * service：部署上 serverless 名稱(本次使用 lambda)
  * frameworkVersion：使用 Serverless 版本(建議使用)
  * runtime：運行環境
  * functions：
    * handler：運行執行 serverless entry point

長出來的 `serverless.yml` 會如下

```yaml
service: dotnetServerless

frameworkVersion: '3'

provider:
  name: aws
  runtime: dotnet6

package:
  individually: true

functions:
  hello:
    handler: CsharpHandlers::AwsDotnetCsharp.Handler::Hello

    package:
      artifact: bin/Release/net6.0/hello.zip
  
```

![](https://i.imgur.com/TRP3aX4.png)

### Deploy serverless package

執行 `serverless deploy` 命令我們會將

> 預設 Deploy Region : `us-east-1` 或是使用參數 `--region / -r` 指定上傳 Region

```
Deploying dotnetServerless to stage dev (us-east-1)

✔ Service deployed to stack dotnetServerless-dev (113s)
```

上傳完畢後在 `CloudFormation` 應該可以看到我們建立資源如下

* AWS::Lambda::Function
* AWS::Lambda::Version
* AWS::Logs::LogGroup
* AWS::IAM::Role
* AWS::S3::Bucket
* AWS::S3::BucketPolicy

在 lambda 會自動建立 `dotnetServerless-dev-hello`

我們利用 UI 測試 lambda 會得到如下資訊

```json
{
  "Message": "Go Serverless v1.0! Your function executed successfully!",
  "Request": {
    "Key1": "value1",
    "Key2": "value2",
    "Key3": "value3"
  }
}
```

### lambda ReDeploy

我們稍微更新 lambda 回應資訊

```c#
public Response Hello(Request request)
{
    return new Response("Lambda Upgrade !!", request);
}
```

再次執行 `.\build.cmd & serverless deploy` 後並測試 lambda 會得到更新後資訊，讓我們更新 lambda 變得很簡單，是不是很猛

```json
{
  "Message": "Lambda Upgrade !!",
  "Request": {
    "Key1": "value1",
    "Key2": "value2",
    "Key3": "value3"
  }
}
```

## 小結

Serverless 框架搭配 `CloudFormation` 幫助我們把許多自動化細節封裝起來讓我們只需要關注開發，利用 Serverless cli 我們可以快速把一個 CI/CD lambda 流程建立起來

本次 Sample code 連結 [DotNetServerless](https://github.com/isdaniel/BlogSample/tree/master/src/AWS_Sample/DotNetServerless)