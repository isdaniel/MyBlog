---
title: 建立自己Blog系列(二) github Setting
date: 2019-06-02 22:16:39
tags: [WebDesign,Blog,Github,CICD]
categories: WebDesign
---
在Github這邊要先建立兩個Repository

1. Blog Code
2. Blog Hosting

## Blog Code

這個Repository是利用Hexo cli樣板來撰寫Blog.

像我目前使用的[MyBlog](https://github.com/isdaniel/MyBlog)

建立完自己的Code Repository後.

將他clone到自己電腦上面.

執行下面幾個步驟

1. 打開此Repository資料夾
2. 打開`CMD`並進入此資料夾
3. 利用`NodeJS NPM` 打 `npm install hexo -g` 就會開始下載 ![img](/images/github_hosting1.PNG)
4. 執行完第三步後再打`Hexo init`指令,安裝看建立Hexo將檔案.

## Blog Hosting

在建立另一個Repository來當html blog靜態託管使用.

就像石頭使用[isdaniel.github.io](https://github.com/isdaniel/isdaniel.github.io)

執行下面幾個步驟
1. 建立一個Repository ![img](/images/github_hosting.PNG)名子要取為 **[username]**.github.io，其中的**[username]**是您Github帳號.
2. 進入此Repository中，並進入`Setting`![img](/images/github_hosting2.PNG)
3. 確認是否已經成功將此Repository Hosting在你的Github page上
   如果成功呈現此圖![img](/images/github_hosting3.PNG)

我們可以嘗試在這個Hosting Repository建立一個`index.html` 在上面打`Hello would`並`commit push`

在訪問`https://[username].github.io/`應該就可以看到Hello Would文字.


* {% post_link github-hexo-appveyor %}
* 建立自己Blog系列(三) Hexo next theme 介紹
* 建立自己Blog系列(四) Appveyor 介紹 yaml.