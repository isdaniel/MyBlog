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

可以根據[聲明式](https://zh.wikipedia.org/zh-hant/%E5%AE%A3%E5%91%8A%E5%BC%8F%E7%B7%A8%E7%A8%8B)設定，管理、擴展我們的容器化應用編排系統

* 有效安全幫我們執行Container Rollout
* 能夠因應系統流量變化，進行伸縮擴容（Scaling）
* Health check實現自動偵測故障及重啟功能
* 透過Namespace有效幫我們做資源隔離

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

* kube-apiserver：接收使用者指令來操作Node or Pod.(唯一接受命令的服務)
* etcd：可信賴的分布式key/value存儲服務，保存k8s需要持久化的配置資訊
* kube-scheduler：負責調度Pod至Node並監控
* kube-controller-manager：
  * 透過control loop監控cluster狀態並嘗試維持預期狀態，內建由多個controller集合體組成

### kubectl

kubectl 封裝成CLI方便我們下達命令操作我們 k8s cluster control plan，經由 RESTful API 對 master node 進行操作 (需要有相應權限)

我們須先透過 `~/.kube/config` 設定使用 cluster, context 及 user，建立完成後我們就可以對於Pod、deployment、 config map、service進行建立、更新，刪除..動作.

> 透過`cat ~/.kube/config`或`kubectl config view`查看目前 kubectl 設定
> 在config中`current-context`存放當前操作哪個k8s cluster

### Pods

Pod是存放container程式(可以多個Container)，是k8s調度中最小單位

一開始準備建立一個Pod會依序執行下面Container，在所有Init Container沒有執行成功前，Pod不會變成Ready狀態，Pod會處於Pedding狀態.

Pod執行Container順序為Pause Container => Init Containers => Main Container

> Main Container為我們主要運作Container，如果Pod重啟，所有Init Container必須可重新執行.

* Pod 具有自己的生命週期及階段 (Pending, Running, Succeed, Failed, Unknown)
* 一般不建議直接建立 Pod，而是由更高階 controller 負責控制(ex：Deployment)，達到更方便的控管

![](https://i.imgur.com/A8YNvJV.png)

### WorkNode

WorkNode裡面存放許多Pod來執行Container，提供資源來執行我們Pod

每個WorkNode都有下面兩個重要組件

* Kubelet：負責與API Server 溝通，管理container生命週期(health check建立Pod)，利用heartbeat定期跟Control plane說我還活著(有點類似Node的管家)

* Kubeproxy:負責更新 Node 的 iptables，控制Pod跟load balance相關網路(有點類似Node的通訊兵)

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