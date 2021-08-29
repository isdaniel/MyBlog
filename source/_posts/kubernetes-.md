---
title: 初探-介紹Kubernetes
date: 2021-08-29 22:06:40
tags: [k8s,Kubernetes,CICD]
categories: [k8s,Kubernetes,CICD]
top:
photos: 
    - "https://i.imgur.com/ROkC1Q2.png"
---

## 前文

k8s前身是Google開發borg系統，用於管理Google系統，後面由許多borg核心開發人用利用Go語言改寫就造就Kubernetes

能根據聲明式的設定，管理、擴展的容器化應用編排系統

* 支援大規模的擴展與調度
* 服務的自動 rollout 與 rollback
* 資源的邏輯隔離
* 提供硬體資源的有效利用
* 提供 service discovery 與負載平衡
* 自我修復：根據用戶的 health check 導入流量或重啟應用
* 高度的功能擴展性: Custom Resource Definition & Operator

k8s協助我們方便掌控複雜容器系統架構，具有良好伸縮性

> 建議在閱讀k8s文章前先要有Docker相關知識，不然許多點會有看沒有懂

我們練習會使用[k3d](https://github.com/rancher/k3d)使用Docker建議k8s來練習

## k8s 主要組件介紹

先來張圖(此圖來自wiki)wiki畫的很棒，我拿來借用一下XDD

![](https://i.imgur.com/r6gcJ8U.png)

developer 用 kubectl 利用（http restful API） 打到master node 中的 API Server (綠色區塊)，進而控制 node 群體(藍色區塊)

透過`kubectl api-resources -o wide`可以查看目前所有Api Server提供的服務

### master node

master node 又可以稱 control plan，存儲跟掌控Node就像是人類的大腦，所以裡面有些重要成員要跟大家介紹

* kube-apiserver:接收使用者指令來操作Node or Pod.(唯一接受命令的服務)
* etcd:可信賴的分布式key/value存儲服務，保存k8s需要持久化的配置資訊
* kube-scheduler:監控Pod建立，負責調度至對應Node上
* kube-controller-manager:
  * Controller會監控cluster中狀態，透過control loop維持期望狀態，kube-controller-manager是多個內建controller集合體.
    * Node Controller會監控Node存活狀態
    * Deployment Controller會將對應的workload維持在期望狀態（e.g. 10個replica）

### kubectl

kubectl: 使用者操作 k8s cluster control plan 所使用command line tool，透過 RESTful API 對 master node 進行一切操作 (需要有相應權限)

* 建立、更新及刪除 Pod, deployment, config map, service...etc
* 需要先透過 ~/.kube/config 設定 cluster, context 及 user
  * 設定檔路徑可透過 KUBECONFIG env 或 --kubeconfig 複寫

> 透過`cat ~/.kube/config`或`kubectl config view`查看目前 kubectl 設定

### Pods

Pod是存放container程式(可以多個Container)，是k8s調度中最小單位

一開始準備建立一個Pod會依序執行下面Container，在所有Init Container沒有執行成功前，Pod不會變成Ready狀態，Pod會處於Pedding狀態.

* Pause Container => Init Containers => Main Container.

如果Pod重啟，所有Init Container必須可重新執行.

* Pod 具有自己的生命週期及階段 (Pending, Running, Succeed, Failed, Unknown)
* 一般不會直接建立 Pod，而是由更高階的 controller 負責控制
  * e.g. Deployment, CronJob, etc

![](https://i.imgur.com/A8YNvJV.png)

### Work Node

* 提供CPU，Memory，NetWork...資源
* 裡面可以存放許多Pod來執行Container

每個work node都有下面兩個重要組件

* kubelet:每一個Node上都有個kubelet(Node上的Agent)，負責與API Server 溝通，管理container生命週期(health check node)，定時和Control plane報平安(heartbeat)

* kubeproxy:控制Pod和load balance相關網路

## k3d (Kubernetes in docker)

要建立k8s集群有點麻煩好在，有k3d可以利用container幫我們模擬k8s讓我們方便練習

安裝非常簡單依照[k3d GitHub](https://github.com/rancher/k3d)步驟一步一步就可以完成了.

**linux** 是用`wget`下載執行shell

`wget -q -O - https://raw.githubusercontent.com/rancher/k3d/main/install.sh`

**window**利用`choco`來下載

`choco install k3d`

下載完後可以利用`k3d --version`查看安裝版本資訊如下

```
k3d version v4.0.0
k3s version v1.20.0-k3s2 (default)
```

![](https://i.imgur.com/KBM6n39.png)

透過`k3d cluster create mycluster`建立k8s

建立完畢後使用`docker ps`可以看到我們k3d會跑在Docker中代表我們已經建立好k8s環境了

![](https://i.imgur.com/x9qzDfn.png)

## 建立第一個Pod

環境建立好了，現在我們就來建立一個Pod來試試看

> 因為是為了讓大家快速感受 `kubectl` 命令一般我們在管理 k8s 不會直接管理 pod 而是會透過 controller 來管理，就像你是將軍你不會想直接管理小兵，你會對於軍官下達命令由他們去管理小兵

```yml
apiVersion: v1
kind: Pod
metadata:
  labels:
    run: my-nginx
  name: nginx
spec:
  containers:
  - image: nginx:alpine
    name: my-nginx
    ports:
    - containerPort: 80
    resources:
      limits:
        cpu: 50m
        memory: 100Mi
      requests:
        cpu: 30m
        memory: 50Mi
```

我對於上面yaml設定檔大概說明一下

* `kind`：代表要建立資源類型(此次範例是pod)
* `metadata`：中繼資料描述
* `spec`：Container，storage，volume以及其他Kubernetes需要的參數，以及諸如是否在容器失敗時重新啟動容器的屬性

在當前目錄存上面的yaml檔案叫做`pods.yaml`並執行讓k8s編排出我們要的資源

```
kubectl apply -f .\pods.yaml
```

執行完後我們可以利用`kubectl get pods`查看 pod 建立狀態

### 請求我們 pod 服務

我們利用 http://127.0.0.1 請求不到 nginx 是為什麼?

> 因為80 port是pod中Container使用的Port我們需要使用一些方式讓他可以給外面請求

所以我們可以利用，我們使用`port-forward`把pod container中的port暴露出來請求 http://127.0.0.1:8888/

```k8s
kubectl port-forward nginx 8888:80
```

> 一般我們會透過Service資源來管理port 相關事情，日後有機會再跟大家說

![](https://i.imgur.com/2Ktnj3a.png)

## 小結

今天對於k8s簡單介紹幾個重要成員還有使用，希望對於想要入門k8s的人會有幫助.

日後有機會在寫其他k8s相關的文章.

