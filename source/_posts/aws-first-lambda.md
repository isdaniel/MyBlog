---
title: AWS Lambda 初體驗 by .net core
date: 2021-10-10 10:30:11
tags: [AWS,Lambda,.netcore]
categories: [AWS,Lambda]
---

## 前言

AWS 在有眾多服務，其中我對於 Lambda 最有興趣 (因為 .net 有一個 Lambda 表達式 )

最近申辦帳號可以使用 12 個月部分免費服務(有條件限制)，看我還不玩爆 AWS XD

經過了解得知 Lambda 是一個 EDA 架構並幫我們解決開發時需要煩惱硬體上配置(記憶體要多少，CPU，是否需要 load balance scale out...)，做一個 serverless 服務

讓我們可以專心開發程式，本篇會針對 .net core 建立一個 sample 專案到上傳到 AWS Lambda 服務上說明

## 安裝aws cli & 設定 profile

首先我們需要先安裝 `aws cli`，如果是 windows 我們可以透過 powershell，來完成 

```powershell
C:\> msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi
```

```powershell
$ aws --version
aws-cli/2.2.44 Python/3.8.8 Windows/10 exe/AMD64 prompt/off
```

確定安裝完後我們可以執行 `aws configure` 設定我們 AWS 服務相關 [IAM](https://docs.aws.amazon.com/zh_tw/IAM/latest/UserGuide/introduction.html) 資訊

設定完成後 `%userprofile%\.aws` 上會有兩個檔案

* credentials
* config

裡面就是你剛剛設定的檔案

## AWS .net core Lambda

我們在開啟 powershell 並執行安裝　`Amazon.Lambda.Tools`

```powershell
dotnet tool install -g Amazon.Lambda.Tools

$ dotnet new --install  Amazon.Lambda::5.2.0
範本名稱                                                  簡短名稱                                          語言          標記
----------------------------------------------------  --------------------------------------------  ----------  ----------------------
Order Flowers Chatbot Tutorial                        lambda.OrderFlowersChatbot                    [C#]        AWS/Lambda/Function
Lambda Custom Runtime Function (.NET 5)               lambda.CustomRuntimeFunction                  [C#],F#     AWS/Lambda/Function
Lambda Detect Image Labels                            lambda.DetectImageLabels                      [C#],F#     AWS/Lambda/Function
Lambda Empty Function                                 lambda.EmptyFunction                          [C#],F#     AWS/Lambda/Function
Lambda Empty Function (.NET 5 Container Image)        lambda.image.EmptyFunction                    [C#],F#     AWS/Lambda/Function
Lex Book Trip Sample                                  lambda.LexBookTripSample                      [C#]        AWS/Lambda/Function
Lambda Simple Application Load Balancer Function      lambda.SimpleApplicationLoadBalancerFunction  [C#]        AWS/Lambda/Function
Lambda Simple DynamoDB Function                       lambda.DynamoDB                               [C#],F#     AWS/Lambda/Function
Lambda Simple Kinesis Firehose Function               lambda.KinesisFirehose                        [C#]        AWS/Lambda/Function
Lambda Simple Kinesis Function                        lambda.Kinesis                                [C#],F#     AWS/Lambda/Function
Lambda Simple S3 Function                             lambda.S3                                     [C#],F#     AWS/Lambda/Function
Lambda Simple SNS Function                            lambda.SNS                                    [C#]        AWS/Lambda/Function
Lambda Simple SQS Function                            lambda.SQS                                    [C#]        AWS/Lambda/Function
Lambda ASP.NET Core Web API                           serverless.AspNetCoreWebAPI                   [C#],F#     AWS/Lambda/Serverless
Lambda ASP.NET Core Web API (.NET 5 Container Image)  serverless.image.AspNetCoreWebAPI             [C#],F#     AWS/Lambda/Serverless
Lambda ASP.NET Core Web Application with Razor Pages  serverless.AspNetCoreWebApp                   [C#]        AWS/Lambda/Serverless
Serverless Detect Image Labels                        serverless.DetectImageLabels                  [C#],F#     AWS/Lambda/Serverless
Lambda DynamoDB Blog API                              serverless.DynamoDBBlogAPI                    [C#]        AWS/Lambda/Serverless
Lambda Empty Serverless                               serverless.EmptyServerless                    [C#],F#     AWS/Lambda/Serverless
Lambda Empty Serverless (.NET 5 Container Image)      serverless.image.EmptyServerless              [C#],F#     AWS/Lambda/Serverless
Lambda Giraffe Web App                                serverless.Giraffe                            F#          AWS/Lambda/Serverless
Serverless Simple S3 Function                         serverless.S3                                 [C#],F#     AWS/Lambda/Serverless
Step Functions Hello World                            serverless.StepFunctionsHelloWorld            [C#],F#     AWS/Lambda/Serverless
Serverless WebSocket API                              serverless.WebSocketAPI                       [C#]        AWS/Lambda/Serverless

.....
Examples:
    dotnet new mvc --auth Individual
    dotnet new console
    dotnet new --help
    dotnet new serverless.AspNetCoreWebAPI --help
```

我們可以看到 AWS Lambda 有許多專案可以使用

接著我們新增一個 `lambda.EmptyFunction` 專案

```powershell
dotnet new lambda.EmptyFunction --name LambdaDemo
```

資料夾結構如下

![](https://i.imgur.com/RbSLAin.png)

`aws-lambda-tools-defaults.json` 檔案掌管我們 deploy AWS Lambda 相關資訊

```json
{
    "profile": "default",
    "region": "ap-northeast-1",
    "configuration": "Release",
    "framework": "netcoreapp3.1",
    "function-runtime": "dotnetcore3.1",
    "function-memory-size": 256,
    "function-timeout": 30,
    "function-handler": "LambdaDemo::LambdaDemo.Function::FunctionHandler"
}
```

* profile:使用設定 IAM 哪組帳號
* region:上傳到哪個 region
* function-handler:執行 Lambda方法名稱 (因為 Lambda 使用 EDA 架構，所以核心概念在事件方法)

### 建立第一個 Lambda 程式

在專案中有一個 `Function` 類別裡面有一個 `FunctionHandler`

可以對應到 config 中 `function-handler:LambdaDemo::LambdaDemo.Function::FunctionHandler`

其中方法有兩個參數

1. `string input`:呼叫 Lambda 實傳入參數
2. `ILambdaContext context`:Lambda 當前相關資訊上下文

```c#
[assembly: LambdaSerializer(typeof(Amazon.Lambda.Serialization.SystemTextJson.DefaultLambdaJsonSerializer))]

namespace LambdaDemo
{
    public class Function
    {
        
        /// <summary>
        /// A simple function that takes a string and does a ToUpper
        /// </summary>
        /// <param name="input"></param>
        /// <param name="context"></param>
        /// <returns></returns>
        public string FunctionHandler(string input, ILambdaContext context)
        {
            context.Logger.Log($"AwsRequestId {context.AwsRequestId}");
            context.Logger.Log($"FunctionName {context.FunctionName}");
            context.Logger.Log($"LogStreamName {context.LogStreamName}");
            context.Logger.Log($"MemoryLimitInMB {context.MemoryLimitInMB}");
            return input?.ToUpper();
        }
    }
}
```

改完專案後我們就可以把程式碼上傳到 AWS 上面搂

## 上傳第一個 Lambda 程式

我們在專案跟目錄呼叫 `dotnet lambda deploy-function mylambda` 就會開始執行打包上傳到 Lambda 上

後面我們登入 AWS Lambda 服務可以看到我們第一個 Lambda 服務會自己建立起來

![](https://i.imgur.com/T45ARB5.png)

透過打測試，我們可以看到服務正常運作

![](https://i.imgur.com/rO8jWni.png)

查看日誌詳細內容可以看到輸出會把我們傳入參數全部轉成大寫（如程式碼邏輯運作）

![](https://i.imgur.com/cFjiaLS.png)

## 小結

Lambda 除了上面我說的功能外它還可以跟其他 AWS 服務做串接連動，做到類似 pipeline 效果，有了 Lambda 我們開發人員可以更關注在邏輯開發，對於硬體上的考慮可以少很多交由 AWS 幫我們處理.