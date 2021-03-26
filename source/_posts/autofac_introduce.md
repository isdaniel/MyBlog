---
title: Autofac (IOC)容器介紹
date: 2019-06-02 22:30:11
tags: [C#,IOC,Autofac,AOP]
categories: [C#,IOC]
---

## 前言：

市面上有許多IoC容器 [Ninject](http://ninject.org/),[Unity](https://github.com/unitycontainer/unity)....

雖然容器眾多但要解決的問題和概念是一樣

今天使用Autofac 介紹一下IoC容器

不了解 IoC 概念可參考 我之前寫 {% post_link ioc-di %}

## Autofac是一個 <span style="color:#FF8C00;">Ioc</span> <span style="color:#ADD8E6;">容器</span>

眼尖的讀者會發現我把Ioc跟容器這兩個字使用兩個不同顏色

原因是Autofac這個框架其實做到兩個概念.

*   <span style="color:#FFA500;">IoC(Inversion of Control)</span>
*   <span style="color:#FFA500;">管理物件的容器</span>

<div class="note note--important">Autofac框架幫我們實現可以管理物件生命週期並提供依賴注入相對應的物件中</div>

-----

## 為何使用Autofac在我們專案中?

我們先來看看在專案中常使用的撰寫方式,我們需要讀取使用者資料 透過`UserDao`來幫我們完成.

    public UserService {
        private UserDao _userDao = new UserDao();

        public UserModel GetUserById(string Id){
            return _userDao.GetUserById(Id);
        }
    }

`_userDao`物件跟依賴`UserService`，導致兩個狀況

1.  `UserDao`物件掌控於 `UserService`,假如有其他類別也使用`UserDao`物件各自掌控`UserDao`物件,這導致許多不必要的資源浪費.
2.  日後要替換讀取 `GetUserById `方式(從db改讀成其他地方 如API) 需要異動全部有建立`UserDao`的類別

我們可以使用IoC容器解決上面兩個問題

-----

## 使用Autofac 容器

一般容器有多種注入方式：建構子注入，屬性注入，參數注入

按照以下四個步驟 簡單使用Autofac

1.  建立`ContainerBuilder`物件
2.  註冊型別(可限制創建物件生命週期)
3.  建立`IContainer`
4.  取得我們需要的物件.

此範例使用建構子注入方式

    //1.建立ContainerBuilder物件
    ContainerBuilder builder = new ContainerBuilder();

    //2.註冊型別(可限制創建物件生命週期)
    builder.RegisterType<UserDao>().As<IUser>();

    //3.建立IContainer
    IContainer container = builder.Build();

    //4.使用IContainer取得我們需要的物件.
    IUser user = container.Resolve<IUser>();

我們新建一個`IUser`來給`UserDao`繼承當作解耦合點(介面可利於日後替換使用)

    public interface IUser{
        UserModel GetUserById(string Id);
    }

    public UserService {
        private IUser _userDao;

        public UserService(IUser userdao){
            _userDao = userdao;
        }

        public UserModel GetUserById(string Id){
            return _userDao.GetUserById(Id);
        }
    }

可能還感受不到IoC容器威力，因為目前依賴的複雜度還沒有太大

目前模組依賴關係 如下UML圖

![](https://az787680.vo.msecnd.net/user/九桃/c59c2248-a535-431f-b1ca-a17372438940/1555298305_13744.png)

模組複雜程度像下圖 如果沒有容器幫我們做物件控制管理,想想就覺得可怕

<b id="docs-internal-guid-0b402e0a-7fff-daaa-ae1a-0fd681ce4177">![](https://lh3.googleusercontent.com/v8WHBoDPfaypFKDoEKPrnTgwQ6QRqnXvgz9QQamrSrzsC8BUOr5_WLXiIRH2YO4mRac8EG_BhyRhDoH41iiSX-Yn0I8oID7spXRXYnTCjh93Vh6CwbfUQt8Es_LRUzqcMdUL-o87_8E)**

**上圖是我Inovce SDK框架的UML圖 **

**其中我們可以發現 **`ApiBase `**這個抽象類別 依賴於 **`IConfig `**介面(日後可能依賴更多其他物件或介面)**

    ContainerBuilder builder = new ContainerBuilder();
    builder.RegisterType<AppsettingConfig>().As<IConfig>().InstancePerRequest();
    builder.RegisterGeneric(typeof(ApiBase<>)).PropertiesAutowired();
    builder.RegisterType<InvoiceApiFactory>().InstancePerRequest();
    

如果使用Autofac我們可不用擔心這些 只需要將被依賴的物件,介面註冊到容器中，剩下配對注入動作容器都會幫我們達成

已上面的例子來說：我只需要用 `InvoiceApiFactory `產生繼承`ApiBase<> `物件，使用`IConfig `將會被容器自動注入其中。

-----

## Autofac 常用三種注射方式.

1.  Constructor injection
2.  Property injection
3.  Method injection

### constructor injection

![](https://az787680.vo.msecnd.net/user/九桃/c59c2248-a535-431f-b1ca-a17372438940/1555387105_48127.png)

### Property injection

![](https://az787680.vo.msecnd.net/user/九桃/c59c2248-a535-431f-b1ca-a17372438940/1555387131_13945.png)

### Method injection

![](https://az787680.vo.msecnd.net/user/九桃/c59c2248-a535-431f-b1ca-a17372438940/1555387134_01082.png)

-----

## 小結：

系統越來越複雜越能表現IoC容器的優勢，如果系統沒那麼複雜其實也不一定要使用他﹐看情境如何

