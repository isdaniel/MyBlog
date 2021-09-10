---
title: RabbitMQ cluster-operator
date: 2021-09-10 22:31:09
tags: [k8s,Kubernetes,RabbitMQ]
categories: [k8s,Kubernetes,RabbitMQ]
---

## 前言

在 Rabbitmq 官方 Github 有開源一個 k8s 操作管理  RabbitMQ clusters 環境 [cluster-operator](https://github.com/rabbitmq/cluster-operator).

這個專案在2020啟動，我個人覺得官方有些說明還沒很完善，本篇文章跟大家介紹如何去使用

## 建立 operator

```cmd
kubectl apply -f https://github.com/rabbitmq/cluster-operator/releases/latest/download/cluster-operator.yml
```

下面的yaml檔案是建立一個`RabbitmqCluster`

```yaml
apiVersion: rabbitmq.com/v1beta1
kind: RabbitmqCluster
metadata:
  name: hello-world
spec:
  replicas: 3
```

透過 `kubectl apply -f {your yaml filename}` 後就可以透過 `kubectl get all` 查看 RabbitMQ cluster 是否建立完成

如果建立完成會出現類似下圖

![](https://i.imgur.com/5qtQixT.png)

綠色框框是這次建立的 RabbitMQ cluster 能看到 Pod 有三台

我們可以利用 Ingress Rule & Ingress 把我們的服務對外出來，可以執行下面yaml

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: rabbitmq-ingress
spec:
  rules:
  - http:
      paths:
      - path: /
        pathType: Prefix
        backend: ## to service
          service:
            name: hello-world
            port:
              number: 15672
```

> 注意 `backend.service.name` 名稱要對應上面的 `metadata.name` 不然 Ingress Endpoint會綁定不到

能看到畫面後會發現利用 `guest/guest` 登入會失敗，稍後會跟大家說明原因

## 修改登入預設密碼

啟動完 RabbitMQ clusters 透過 ingress controller 對外暴露，服務但會發現使用RabbitMq預設密碼不能登入....

那是因為他的預設密碼有透過特別處理.

在官方Guide文件中 [Limitations](https://www.rabbitmq.com/kubernetes/operator/operator-overview.html#limitations) 由提到

> Deleted **Secret** objects will be recreated by the Kubernetes Operator but the newly generated **secret** value will not be deployed to the RabbitMQ cluster

經由上面我們可以知道密碼可能藏在**secret**上

利用`kubectl get secret`可以看到有多了幾個RabbitMQ Secret

![](https://i.imgur.com/y7026UN.png)

> `secret`可以透過 base64 解碼，就可以看到原始的資料(就可以看到 RabbitmqCluster 幫我們預設建立 password & username)

但我下面會介紹如何透過 yaml 檔案設定預設帳號密碼

我們把剛剛建立的 RabbitmqCluster 稍微改一下，新增 `additionalConfig` 區段

```yaml
apiVersion: rabbitmq.com/v1beta1
kind: RabbitmqCluster
metadata:
  name: hello-world
spec:
  replicas: 3
  rabbitmq:
    additionalConfig: |
      default_user=guest
      default_pass=guest
```

改完後再執行刪除跟重建

> 因為要把`secret`更新 這樣做比較快XDD

```yaml
kubectl delete -f {your yaml filename}
kubectl apply -f {your yaml filename}
```

再次利用 `guest/guest` 理論上就可以登入進去了

## 小結

Rabbitmq 官方很佛心 幫我們建立 k8s cluster 機制，讓我們可以方便操作，雖然目前有一些 [sample](https://github.com/rabbitmq/cluster-operator/tree/main/docs/examples) 可以參考

但我覺得Sample 文件資訊還是有點少，到導致有些需求要花蠻多時間去查找的


