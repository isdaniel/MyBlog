---
title: 發布自己的Nuget專案
date: 2019-06-10 22:30:11
tags: [C#,Nuget]
categories: [C#]
---

## 前言：

前陣子在被面試官說：我有電子發票開源專案，是否有上到Nuget上

我回答:沒有.

我就突然想到我也可以把我的專案放到Nuget上讓更多人方便使用

我就查詢資料去了解整個上板流程,並打成文章跟大家分享

-----

### 下載Nuget Commandline Tool

[下載Nuget Commandline Tool](https://www.nuget.org/downloads)

![](https://dotblogsfile.blob.core.windows.net/user/九桃/a236f1fa-ad61-4d1e-a547-873093f89865/1543152784_97518.png)

之後你會取得 `nuget.exe` 這個檔案

把它放到你要打包Nuget的專案資料夾中

![](https://dotblogsfile.blob.core.windows.net/user/九桃/a236f1fa-ad61-4d1e-a547-873093f89865/1543152541_67261.png)

之後打開cmd 並在專案資料夾打上 `nuget spce`

![](https://dotblogsfile.blob.core.windows.net/user/九桃/a236f1fa-ad61-4d1e-a547-873093f89865/1543152985_63932.png)

之後在你資料夾中會出現 `xxxx.nuspec`的XML檔案,這個檔案是描述你要打包的專案

```xml
<code class="language-xml"><?xml version="1.0"?>
<package >
  <metadata>
    <id></id>
    <version></version>
    <title></title>
    <authors></authors>
    <owners></owners>
    <licenseUrl></licenseUrl>
    <projectUrl></projectUrl>
    <iconUrl></iconUrl>
    <requireLicenseAcceptance>false</requireLicenseAcceptance>
    <description>This is a AOP framework</description>
    <releaseNotes>Summary of changes made in this release of the package.</releaseNotes>
    <copyright>Copyright 2018</copyright>
    <tags>c# AOP</tags>
  </metadata>
</package>
```

### 必填欄位 

*   ID：不區分大小寫的套件識別碼，在整個 nuget.org 或套件所在的任何組件庫中都必須是唯一的。 識別碼可能不包含對 URL 而言無效的空格或字元，而且通常會遵循 .NET 命名空間規則。 如需指導方針，請參閱[選擇唯一的套件識別碼](https://docs.microsoft.com/zh-tw/nuget/create-packages/creating-a-package#choosing-a-unique-package-identifier-and-setting-the-version-number)。
*   Version：套件版本，遵循 *major.minor.patch* 模式。 版本號碼可以包含預先發行版本的後置詞，如[套件版本控制](https://docs.microsoft.com/zh-tw/nuget/reference/package-versioning#pre-release-versions)中所述。
*   Description：UI 顯示中的套件詳細描述。

> Authors：以逗號分隔的套件作者清單，與 nuget.org 上的設定檔名稱相符。這些名稱會顯示在 nuget.org 的 NuGet 組件庫中，並用來交互參照相同作者的其他套件。

### 打包Nuget

填完資料後就可以回到commandline 並打另一個指令`nuget pack `將專案打包成 `xxx.nupkg` 檔案 以提供上傳

![](https://dotblogsfile.blob.core.windows.net/user/九桃/a236f1fa-ad61-4d1e-a547-873093f89865/1543153426_68079.png)

之後申辦一個Nuget帳號,並產生一個API Key

![](https://dotblogsfile.blob.core.windows.net/user/九桃/a236f1fa-ad61-4d1e-a547-873093f89865/1543153601_8669.png)

產生完後在上面的選單選擇 `Upload` 按鈕

![](https://dotblogsfile.blob.core.windows.net/user/九桃/a236f1fa-ad61-4d1e-a547-873093f89865/1543153522_96047.png)之後按下Browse按鈕並上傳你的 `xxxx.nupkg`檔案,上傳完畢後就按下Submit按鈕 將此專案提交上去

上傳完畢後Nuget他會審核你的專案,等審核完後大家就可以下載使用你的專案摟^^

### 石頭已經打包專案

這兩個是我已經發布的專案

[AwesomeProxy.Net](https://www.nuget.org/packages/AwesomeProxy.Net/)

[ElectronicInvoice_TW](https://www.nuget.org/packages/ElectronicInvoice_TW/)

### Note

如果要查nuget指令可以打 `nuget ?`

### 參考連結：

[.nuspec 參考](https://docs.microsoft.com/zh-tw/nuget/reference/nuspec)

