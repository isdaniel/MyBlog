---
title: MessageWorkerPool framework introduction
date: 2025-02-01 16:00:00
tags: [C#,OOP,Process,workerpool,message-queue,open-source]
categories: [C#,OOP,framework]
---

## 簡介

最近我開發了 `MessageWorkerPool` 專案。其主要概念是提供一個平台框架，使使用者能夠快速且輕鬆地在 `Worker` 內實作邏輯。該設計高度靈活，允許基於我創建的 Worker 通訊協議，以多種程式語言實作 `Worker`。目前，我已提供使用 C#、Rust 和 Python 編寫的 Worker 範例。

這個函式庫在多進程環境中處理任務表現優異。此外，它還支援優雅關閉 (graceful shutdown)，確保在隨時 consumer worker 能順利終止處理程序。

[MessageWorkerPool GitHub](https://github.com/isdaniel/MessageWorkerPool)

## 為什麼選擇 ProcessPool 而非 ThreadPool ？

當你需要強大的隔離性，以防止某個任務影響其他任務時，應該選擇 ProcessPool，特別是針對關鍵操作或容易崩潰的任務。雖然 ThreadPool 較為輕量（因為執行緒共用記憶體並且具有較低的上下文切換開銷），但 ProcessPool 能夠提供更靈活的解決方案，允許使用不同的程式語言來實作 Worker。

## 安裝

要安裝 `MessageWorkerPool` 套件，請使用以下 NuGet 指令：

```sh
PM > Install-Package MessageWorkerPool
```

若要手動安裝此函式庫，可克隆儲存庫並建置專案：


```sh
git clone https://github.com/isdaniel/MessageWorkerPool.git
cd MessageWorkerPool
dotnet build
```

## 架構概覽

![](https://raw.githubusercontent.com/isdaniel/MessageWorkerPool/refs/heads/main/images/arhc-overview.png)

## 快速開始

這是部署 RabbitMQ 和相關服務的快速開始指南，使用提供的 docker-compose.yml 檔案和 .env 中的環境變數。

```
docker-compose --env-file .\env\.env up --build -d
```

1. 檢查 RabbitMQ 健康狀態：在瀏覽器中開啟 http://localhost:8888 以訪問 RabbitMQ 管理面板。
  * 使用者名稱: guest
  * 密碼: guest
2. 檢查 OrleansDashboard http://localhost:8899
  * 使用者名稱: admin
  * 密碼: test.123

## 程式結構

以下是創建並配置與 RabbitMQ 互動的 workerpool 的範例程式碼。以下是其功能的解析：workerpool 將根據您的 RabbitMqSetting 設定從 RabbitMQ 伺服器獲取訊息，並通過 Process.StandardInput 將訊息傳遞給用戶創建的真實 worker node

```c#
public class Program
{
    public static async Task Main(string[] args)
    {
        CreateHostBuilder(args).Build().Run();
    }

    public static IHostBuilder CreateHostBuilder(string[] args) =>
        Host.CreateDefaultBuilder(args)
            .ConfigureLogging(logging =>
            {
                logging.ClearProviders();
                logging.AddConsole(options => {
                    options.FormatterName = ConsoleFormatterNames.Simple;
                });
                logging.Services.Configure<SimpleConsoleFormatterOptions>(options => {
                    options.IncludeScopes = true;
                    options.TimestampFormat = " yyyy-MM-dd HH:mm:ss ";
                });
            }).AddRabbitMqWorkerPool(new RabbitMqSetting
            {
                UserName = Environment.GetEnvironmentVariable("USERNAME") ?? "guest",
                Password = Environment.GetEnvironmentVariable("PASSWORD") ?? "guest",
                HostName = Environment.GetEnvironmentVariable("RABBITMQ_HOSTNAME"),
                Port = ushort.TryParse(Environment.GetEnvironmentVariable("RABBITMQ_PORT"), out ushort p) ? p : (ushort) 5672,
                PrefetchTaskCount = 3
            }, new WorkerPoolSetting() { WorkerUnitCount = 9, CommandLine = "dotnet", Arguments = @"./ProcessBin/WorkerProcessSample.dll", QueueName = Environment.GetEnvironmentVariable("QUEUENAME"), }
            );

}
```


## worker process 與 workerPool 之間的協議

worker node 與任務進程之間的協議使用 MessagePack 二進制格式來進行更快且更小的資料傳輸，標準輸入將發送信號來控制 worker process。

一開始 workerPool 將通過標準輸入傳遞 NamedPipe 名稱，因此 worker node 需要接收該名稱並建立 worker process 和 workerPool 之間的 NamedPipe。

### workerPool 發送的操作指令

目前，workerPool將通過標準輸入向 worker process 發送操作信號或指令。

* CLOSED_SIGNAL (`__quit__`): 代表 workerPool 發送關閉或關機信號給 worker node，worker process 應盡快執行優雅關機。
通過 (Data Named Pipe Stream) 進行資料傳輸
命名管道是一種強大的進程間通信 (IPC) 機制，它允許兩個或更多的進程之間進行通信，即使它們運行在不同的機器上（例如 Windows 等支持的平台）。我們的 worker 使用此方式在 worker node 與 workerPool 之間傳輸資料。

msgpack 協議支持的資料類型如下類別與 byte[] 格式。

對應的 byte[] 資料是：

```
[132,161,48,179,78,101,119,32,79,117,116,80,117,116,32,77,101,115,115,97,103,101,33,161,49,204,200,161,50,129,164,116,101,115,116,167,116,101,115,116,118,97,108,161,51,169,116,101,115,116,81,117,101,117,101]

```

要將提供的偽 JSON 結構表示為 `MsgPack` 格式（byte[]），我們可以分解過程如下：

```json
Edit
{
    "0": "New OutPut Message!",
    "1": 200,
    "2": {
        "test": "testval"
    },
    "3": "testQueue"
}
```

更多資訊，您可以使用 [msgpack-converter](https://ref45638.github.io/msgpack-converter/) 來解碼和編碼。

```c#
 /// <summary>
/// 封裝來自 MQ 服務的訊息
/// </summary>
[MessagePackObject]
public class MessageOutputTask
{
   /// <summary>
   /// 來自進程的輸出訊息
   /// </summary>
   [Key("0")]
   public string Message { get; set; }
   [Key("1")]
   public MessageStatus Status { get; set; }
   /// <summary>
   /// 我們希望儲存的回應資訊以便繼續執行訊息。
   /// </summary>
   [Key("2")]
   [MessagePackFormatter(typeof(PrimitiveObjectResolver))]
   public IDictionary<string, object> Headers { get; set; }
   /// <summary>
   /// 預設使用 BasicProperties.Reply To 隊列名稱，任務處理器可以覆寫回應隊列名稱。
   /// </summary>
   /// <value>預設使用 BasicProperties.Reply</value>
   [Key("3")]
   public string ReplyQueueName { get; set; }
}
```


我將在此介紹 MessageStatus 的含義。

* IGNORE_MESSAGE (-1) : 將訊息附加到資料流管道中，而不進行進一步處理。
    * Status = -1: 任務處理告訴 worker process 這不是回應或確認訊息，只是回饋到資料流管道。
* MESSAGE_DONE (200) : 通知 worker process 該案件可以由訊息隊列服務進行確認。
    * Status = 200 任務處理告訴 worker process 該任務已完成並且可以確認。
* MESSAGE_DONE_WITH_REPLY (201) : 請確保我們滿足以下步驟以支援 RPC。
    * 客戶端代碼必須提供 ReplyTo 資訊。
    * 任務處理將使用 JSON 負載中的 Message 欄位來回應隊列資訊。
    * 例如：當 Status = 201 透過資料流管道發送時，任務處理指示 worker process 輸出，例如 1010，該數據必須然後發送到回應隊列。

我們可以通過不同的程式語言來編寫自己的 worker node （我已經在此 github 提供了 Python, .NET, rust example code）。

## 如何處理長時間運行的任務或涉及處理大量數據行的任務？

類似於操作系統中的進程，發生上下文切換（中斷等）。

客戶端可以通過 Header 發送一個 `TimeoutMilliseconds` 值：在取消之前等待的時間（毫秒）。如果任務執行超過該值，worker process 可以使用該值來設置中斷，例如 CancellationToken。

例如，`MessageOutputTask` 的 JSON 可以如下所示，`status=201` 代表此訊息將重新入隊以便下次處理，並且訊息將攜帶 `Headers` 資訊再次重新入隊。


```json
{
  "Message": "This is Mock Json Data",
  "Status": 201,
  "Headers": {
    "CreateTimestamp": "2025-01-01T14:35:00Z",
    "PreviousProcessingTimestamp": "2025-01-01T14:40:00Z",
	"Source": "OrderProcessingService",
    "PreviousExecutedRows": "123",
    "RequeueTimes": "3"
  }
}
```

此專案還包括 integration、unit test 和 github action pipeline。雖然 API 文件（專案仍在 beta 階段），但我計劃在未來逐步添加。如果您對此專案有任何想法或建議，請隨時創建問題或發送 PR。