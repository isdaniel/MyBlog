---
title: 建立自己Blog系列(一) 介紹 Github (hosting) + Hexo (Blog) + Appveyor(CICD)
date: 2019-06-02 14:07:51
tags: [WebDesign,Blog,Github,CICD]
categories: WebDesign
---

## 前文：

網路上已經有許多Blog託管平台 例如:Google Blog，痞客邦....為何我還要自己寫這篇跟大家分享?

因為上面提供的平台固然好用，但我並無法100%的去修改我想要的樣式或版面.

如果我想要有100%彈性修改我的Blog我就必須建立自己的網站.

但要給別人Hosting需要另外花一筆費用...

就有本次系列文 `Github (hosting) + Hexo (Blog) + Appveyor(CICD)`．

這個搭配有幾個優點：

1. 完全免費
2. 使用MarkDown撰寫Blog就是爽.
3. 練習使用CICD線上工具.
4. Hexo有許多不一樣絢麗的Theme可以更換且更換方式簡單

撰寫發布流程大概如下圖

![img](/images/blog_init.PNG)

### 流程解說：

1. 使用`Hexo`樣板撰寫`MarkDown` Blog
2. 寫完後`commit`和`push`至Github Blog Code Repository
3. `Appveyor(CI)`線上工具會偵測到我們有`code commit`並執行後續Blog佈版動作
4. 使用`Hexo-cli`將MarkDown build成html靜態檔案(因為github page只能Hosting靜態頁面)
5. `Appveyor(CI)` commit並push到hosting Repository.

此流程的優點是只需在Code Repository上撰寫完Blog並commit就可以自動發佈到github page上.

----

## GitHub (Hosting)

GitHub並創建一個名為**username**.github.io Repository，其中username是您在GitHub上的用戶名（或組織名稱）。

例如我的Github帳戶是isdaniel 就建立一個Repository 叫
[isdaniel.github.io](https://github.com/isdaniel/isdaniel.github.io) 只要裡面有版控Html靜態頁面Github page 就可幫我們進行託管.

https://isdaniel.github.io/ 這個網站的進入點在此Repository的index.html頁面.

Note :

> GitHub有個設定，就是每個專案的gh-pages分支可以通過user-domain /項目名來訪問。

[詳細資料](https://pages.github.com/)

## Hexo (Blog)

`Hexo` 是一個快速、簡單且強大的網誌框架。Hexo 使用 `Markdown`（或其他渲染引擎）解析您的文章，並在幾秒鐘內，透過漂亮的主題產生靜態檔案

透過`Hexo-cli`可以簡單速建立一個blog page,而且`Hexo`社群活躍且文件支援中文.

`Hexo`提供豐富的插件程式來給使用者,甚至您如果懂Js css Html也可建立自己的Blog樣式或自行擴充.

## Appveyor(CICD)

[appveyor](https://www.appveyor.com/
)是一個支援Winodws&Linux相關的持續部屬服務

目前免費使用，可透過Github綁定Repository快速建立一套屬於自己的CICD流程.

## 小結

這篇跟大家簡單介紹一下會使用到的工具和撰寫blog佈署流程.

日後會有其他篇文章來詳細說明細節.

* {% post_link hexo-github-setting %}
* {% post_link hexo-blog-theme %}
* 建立自己Blog系列(四) Appveyor 介紹 yaml.
