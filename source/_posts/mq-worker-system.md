---
title: 高併發系統系列-非同步 MQ-WorkerPool 架構 Poc
date: 2021-09-25 23:10:43
tags: [c#,RabbitMq,ThreadPool,SystemDesign]
categories: [C#]
---

## 前文

在處理高併發系統架構時，非同步是一個很好的手段和提升效率的方式.

我今天跟大家分享，如何利用 MQ 搭配 Worker Pool 來提高系統吞吐量且又不失彈性

原始碼連結 [MQ Woker](https://github.com/isdaniel/MQ_Poc)

本篇會包含兩個部分解說

1. 如何使用 k3d (k8s) 和 docker-compose 來 Run 起我們 MQ 服務
2. 主要核心程式解說

## 系統簡介

我們透過 MQ 來幫系統作解耦合，前台要處理事情都會先統一打到 MQ 中之後就可以先回覆，使用者結果，後續處理就交給 MQ 來幫我們派發任務到我們指定的 Worker 上處理業務邏輯，這樣可以把原本架構前台後台高偶合的問題解決提供可承受且快速響應的架構.

目前支援兩種 Worker.

* ThreadPool：使用 Thread 當作 Worker 來幫我們處理任務

![](https://i.imgur.com/7VgGyMG.png)

* ProcessPool：使用 Process 當作 Worker 來幫我們處理任務，雖然比起Thread需要多點資源，但多了資源隔離確保系統更穩定

![](https://i.imgur.com/pag9kJE.png)

> 另外在 ProcessPool Mode docker-compose 版本支援 DashBoard 方便我們查看收訊息資料統計

## How to Run

### Rrunning by docker-compose

執行前請先把CMD路徑設定到本專案根目錄

使用 `docker-compose` 執行container.

```bash
docker-compose --env-file .\env\.env up -d
```

執行完後，會啟動一個MQ Server、publisher、nodeworker

如果想要scale out 多個 publisher

```bash
docker-compose --env-file .\env\.env  up -d --scale publisher=2 --no-recreate
```

如果想要scale out nodeworker

```bash
docker-compose --env-file .\env\.env  up -d --scale nodeworker=2 --no-recreate
```

#### RabbitMQ 連接資訊

RabbitMQ站台連接資訊

* url : `http://localhost:8888/`
* user : guest
* account : guest

#### 環境參數

目前在 `.\env\.env` 有環境參數檔案可以注入 `docker-compose` 中

```env
RABBITMQ_HOSTNAME=rabbitmq-server
QUEUENAME=worker-queue
RABBITMQ_PORT=5672
```

* RABBITMQ_HOSTNAME:rabbitMq server 主機名稱
* RABBITMQ_PORT:rabbitMq server port
* QUEUENAME:使用queue名稱

> Worker 支援 Graceful shutdown所以大膽地做Scale out

#### ProcessPool docker-compose

目前支援使用 Process Pool 透過`docker-compose-process.yml`來執行 process Pool 版本

在 nodeworker 要加上以下環境變數

* `POOL_TYPE`：
  * 0 ThreadPool(default)
  * 1 ProcessPool
* `DBConnection`：來串接Dashboard

```yaml
environment:
- POOL_TYPE=1
- DBConnection=Data Source=sqlserver;Initial Catalog=orleans;User ID=sa;Password=test.123;
```

proceess Pool 支援 Dashboard 來查看請求狀態 透過可以查看`http://localhost:8899/`

> 帳密 admin/test.123

查看 DashBoard -> MQMessagePrinter 就可以看到如下圖畫面，了解我們收發Message狀態

![](https://i.imgur.com/qSWmdOT.png)

```bash
docker-compose --env-file .\env\.env -f .\docker-compose-process.yml up -d 

docker-compose --env-file .\env\.env -f .\docker-compose-process.yml  up -d --scale publisher=4 --no-recreate
```

### Running by k3d

執行前請先把 CMD 路徑設定到本專案根目錄，並且依照下面指示步驟依序往下動作

我們利用 k3d 建立一個 k8s 在 local container 中

```cmd
k3d cluster create my-k3d -p "8888:80@loadbalancer"
```

#### 設定 private registry

```cmd
kubectl create secret docker-registry app-docker-dev --docker-server=docker.io --docker-username=<user_name> --docker-password=<user_password>
```

> `<user_name>` & `<user_password>` 輸入 login `docker.io` registry 帳密

#### 設定 configmap & secret

```cmd
kubectl apply -f  ./k8s/mq-poc-secret.yaml
kubectl apply -f  ./k8s/mq-poc-configmap.yaml
```

#### 安裝 rabbitmq cluster-operator

```cmd
kubectl apply -f https://github.com/rabbitmq/cluster-operator/releases/latest/download/cluster-operator.yml
```

```cmd
kubectl apply -f  ./k8s/rabbitmq-cluster-operator.yaml
```

#### 建立 Publisher

```cmd
kubectl apply -f  ./k8s/mq-poc-publisher.yaml
```

#### 建立 Worker

```cmd
kubectl apply -f  ./k8s/mq-poc-worker.yaml
```

#### 建立 ingress

建立 ingress 對外暴露Rabbitmq

```cmd
kubectl apply -f  .\k8s\mq-poc-ingress.yaml
```

#### scale out publisher & worker

執行完以上動作後就可以看到 k8s 上跑起我們 Worker & Publisher

k8s scale publisher

```cmd
kubectl scale --replicas=8 -f .\k8s\mq-poc-publisher.yaml  
```

k8s scale worker

```cmd
kubectl scale --replicas=3 -f .\k8s\mq-poc-worker.yaml
```

## 核心組件程式解說

此次 Worker 架構核心 UML 圖如下

![](https://i.imgur.com/5jeBXWP.png)

### Woker 參數介紹

我們可以透過`RabbitMqSetting.ThreadSettings`來設定

* WorkUnitCount:此 ThreadPool 提供幾個 Thread 來處理
* Group:哪一個群組(可以處理不同種類的任務)

```c#
PoolSettings = new PoolSetting[] //which can read from setting files.
{
	new PoolSetting(){WorkUnitCount = 3,Group = "groupA" , FileName = "dotnet",Arguments = @"./Process/Group/Client.dll"},
	new PoolSetting(){WorkUnitCount = 3,Group = "groupB" , FileName = "dotnet",Arguments = @"./Process/Group/Client.dll"}
}
```

透過上面參數我們可以定義每個 Group 群組 WorkerPool 相關設定.

### RabbitMqWorkerBase

`RabbitMqWorkerBase`是MQ架構中的抽象類別，提供連線還有關機後等事情，邏輯實現交由實現子類別來處理.

能看到`RabbitMqWorkerBase`類別掌管RabbitMq連接相關資訊，這裡特別要提的是我目前版本支援`GracefulShutDown`讓子類別實現要怎麼去安全關機(目前提供一個 `Async` Task).

```c#
public abstract class RabbitMqWorkerBase 
{
	public RabbitMqSetting Setting { get; }
	protected AsyncEventHandler<BasicDeliverEventArgs> ReceiveEvent;
	private IConnection _conn;
	private IModel _channle;
	private AsyncEventingBasicConsumer _consumer;
	protected ILogger<RabbitMqWorkerBase> Logger { get; }
	public RabbitMqWorkerBase(
		RabbitMqSetting setting,
		ILogger<RabbitMqWorkerBase> logger)
	{
		this.Logger = logger;
		this.Setting = setting;

		var _connFactory = new ConnectionFactory
		{
			Uri = setting.GetUri(),
			DispatchConsumersAsync = true // async mode
		};

		_conn = _connFactory.CreateConnection();
		
	}

	/// <summary>
	/// 在 subclass 可以返回結果，來代表是否做完此訊息
	/// </summary>
	/// <param name="args"></param>
	/// <returns></returns>
	protected abstract Task<bool> ExecuteAsync(BasicDeliverEventArgs args);

	public void CreateWorkUnit()
	{
		_channle = _conn.CreateModel();
		_consumer = new AsyncEventingBasicConsumer(_channle);
		_channle.BasicQos(0, Setting.PrefetchTaskCount, true);
		_channle.BasicConsume(Setting.QueueName, false, _consumer);
		ReceiveEvent = async (object sender, BasicDeliverEventArgs e) =>
		{
			try
			{
				var ackReuslt = await ExecuteAsync(e);
				if(ackReuslt)
					_channle.BasicAck(e.DeliveryTag, false);
				else
					_channle.BasicNack(e.DeliveryTag, false, true);
			}
			catch (Exception ex)
			{
				_channle.BasicNack(e.DeliveryTag, false, true);
				Logger.LogError(ex,ex.ToString());
			}
			await Task.Yield();
		};
		_consumer.Received += ReceiveEvent;
	}

	protected virtual async Task GracefulReleaseAsync()
	{
		await Task.CompletedTask;
	}

	public async Task GracefulShutDown()
	{
		_consumer.Received -= ReceiveEvent;
		ReceiveEvent = null;
		//wait for all unit tasks be done.
		Logger.LogInformation("Wait for Pool Close!!!!");

		await GracefulReleaseAsync();
		
		if (_channle.IsOpen)
			_channle.Close();
		
		if (_conn.IsOpen)
			_conn.Close();
		
		Logger.LogInformation("RabbitMQ Conn Closed!!!!");
	}
}
```

在 `RabbitMqGroupWorker` 裡我們會使用到我們自己建立 `WorkerPool` 處理我們要的任務邏輯

### IWokerPool

有一個 `IWorkerPool` 抽象提供我們對於 WorkerPool 實現抽象

目前提供兩種Pool

* ProcessPool
* ThreadPool

這邊我對於 `ProcessPool` 來作介紹 (ThreadPool 概念差不多只是 UnitWorker 不一樣)

之前我對於 [EventWaitHandle](https://isdaniel.github.io/multithread-eventwaithandle/) 有篇文章有探討，如果不清楚的夥伴可以先去了解後再看這部分程式.

使用 `EventWaitHandle` 主要是為了提高系統效率，不造成 Worker 無效空轉造成 CPU 資源浪費

至於 `volatile bool _finish` 一開始是 false ，Pool在接收到關機訊息時會把他設定成 true 告訴 Workers 可以準備下班了.

對於 [volatile](https://isdaniel.github.io/volatile-introduce/) 我之前有文章解釋，他的概念跟使用場景，有興趣的可以再去了解

```c#
public class ProcessPool : IWorkerPool
{
	const string CLOSED_SIGNAL = "quit";
	private readonly PoolSetting _poolSetting;
	private BlockingCollection<MessageTask> _taskQueue;
	private List<Task> _workers = new List<Task>();
	private readonly int _processCount;
	private ManualResetEvent _notify = new ManualResetEvent(false);
	private volatile bool _finish = false;
	private List<Process> _processList = new List<Process>();
	public ProcessPool(PoolSetting poolSetting)
	{
		this._processCount = poolSetting.WorkUnitCount;
		this._poolSetting = poolSetting;
		_taskQueue = new BlockingCollection<MessageTask>(poolSetting.WorkUnitCount);
		Init();
	}

	private void Init()
	{
		for (int i = 0; i < _processCount; i++)
		{
			var process = CreateProcess();
			this._workers.Add(Task.Run(()=>{
				ProcessHandler(process);
			}));
			_processList.Add(process);
		}
	}

	private Process CreateProcess() {
		Process process = new Process();
		process.StartInfo = new ProcessStartInfo()
			{
				RedirectStandardInput = true,
				RedirectStandardOutput = true,
				RedirectStandardError = true,
				UseShellExecute = false,
				FileName = _poolSetting.FileName,
				Arguments = _poolSetting.Arguments,
				CreateNoWindow = true
			};
		process.Start();

		process.BeginErrorReadLine();
		process.ErrorDataReceived += (object sender, DataReceivedEventArgs e) =>
		{
			System.Console.WriteLine($"Procees Error Information:{e.Data}");
		};

		return process;
	}


	public Task<bool> AddTaskAsync(MessageTask task){

		_taskQueue.Add(task);
		_notify.Set();
		return Task.FromResult(true);
	}

	private void ProcessHandler(Process process)
	{
		while (true){
			while(_taskQueue.Count > 0){
				if (_taskQueue.TryTake(out MessageTask task))
				{
					process.StandardInput.WriteLine(task.ToJsonMessage());
				}
			}
			if(_finish)
				break;

			_notify.WaitOne();
			_notify.Reset();
		}

		process.StandardInput.WriteLine(CLOSED_SIGNAL);
	}

	public async Task WaitFinishedAsync(){
		_finish = true;
		_notify.Set();
	
		foreach (var process in _processList)
		{
			process.WaitForExit();
		}

		await Task.WhenAll(_workers.ToArray());
	}
}
```

### BlockingCollection

我這邊使用 `BlockingCollection` 來管控我一個最多能接收多少 Message 原因如下

* k8s 在接收關機指令時最多只給 Pod 30s 左右時間去做 GracefulShutDown，如果超過時間沒做完事情會強制收回Pod，如果我們收的任務太多了 可能就造成 GracefulShutDown 無法正常完成.
* 如果沒有設定 `BlockingCollection` Worker 就會一口氣收下全部訊息，造成 Worker 後續要批次ackback 或是 資源上吃緊都不利

所以這邊使用　`BlockingCollection` 透過前面的 `PoolSetting` 設定檔，來設定一個最多能接收的任務量

`BlockingCollection` 使用上就如下圖

![](https://i.imgur.com/rELGkbs.png)

我們可以用停車場的案例來理解:

停車場有幾個重要屬性

1. 停車格數量
2. 進去閘門
3. 出去閘門
4. 多少空位

上面這四個屬性在 `BlockingCollection` 都有實現，所以才可以控制我們一次最多能收多少物件進Queue中，而如果塞不下 Thread 會進行 Blocked ，不會一直占著 CPU 資源空轉提高效率.

## 小結

今天介紹的 MQ Worker 架構，對於微服務跟非同步架構基礎建設有很重要的影響，因為有 MQ 當作我們系統核心轉接者，就可以提高我們系統併發乘載量

在日後要建立 event driven architecture 會有很大的幫助，因為我們事件的轉倒核心可以透過 MQ 來幫我們處理.

原始碼連結 [MQ Woker](https://github.com/isdaniel/MQ_Poc)