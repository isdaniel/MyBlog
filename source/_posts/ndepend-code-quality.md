---
title: Ndepend 靜態分析 .Net 專案好物
date: 2021-12-04
tags: [C#,Ndepend]
categories: [C#,Ndepend]
---

## 前言

當一個專案越來越大，在開發新產品時同時要兼顧程式碼品質會越來越困難，今天要介紹的　[Ndepend](https://www.ndepend.com/) 是一個很優秀靜態分析 .Net 專案好物

會幫我們產生一個 DashBoard 來了解目前專案大致上分析後的問題，並提供建議解法和處理方向，讓我們提前更快速抓出未來或目前存在 bug，減少發生需要晚上起來 support 機率，讓客戶，老闆，工程師都開心的三大歡喜

另外我們也可以透過 [Ndepend](https://www.ndepend.com/) 來撰寫我們自己 Code Rule 並在 CI/CD 流程中進行靜態掃描，讓我們出產軟體更有品質

本文我使用我自己的開源專案 [ElectronicInvoice_TW](https://github.com/isdaniel/ElectronicInvoice_TW) 來當作分析案例

## 建立 Ndepend 開始分析

安裝完 `Ndepend` 後我們可以在 virtual studio 上面的[延伸模組] 出現建立 `Ndepend` 項目，一開始我們利用 Attach New Ndepend Project to Current VS Solution ，來建立分析項目

![](https://i.imgur.com/flzNRXR.png)

`NDepend` 分析完程式後我們會在 sln 檔同級目錄下看到一個 `NDependOut` 資料夾跟 `.ndproj` 檔案

* `.ndproj` 是 XML 格式儲存的專案檔，內容包含 `NDepend` 專案資訊及分析設定資訊
* `NDependOut` 資料夾中會有一個 `.ndar` 檔案這次一個二進制格式儲存的分析後結果
* `NDependOut` 中有一個 `NDependReport.html` 是一個分析後 Html 報表

假如不想在版控加入 Ndepend 分析紀錄，我們可以自行加上 gitignore 規則

```gitignore
**/NDependOut/
*.ndproj
```

## Ndepend DashBoard

在許多國外大公司都有使用 `Ndepend` 來幫助開發流程，我個人覺得有其中一個原因是因為　`Ndepend` DashBoard 讓我們開發人員可以一目了然目前有的問題

Ndepend 提供許多有用的 Code Metrics，

* Lines of Code ：專案規模:
* Comment：註解撰寫註解覆蓋率
* Quality Gate：品質把控，設定本次 Release 程式檔至少要通過某些標準，在 CI/CD 環節扮演很重要一環
* Debt：程式債比率 `Rating` 代表評分，百分比越低越好
* Rules：品質規則，建議 `Critical` 等級需要了解一下
* Issues：目前問題，建議 `Critical` 等級需要了解一下

Ndepend 能針對一個基準點來比較調整前後，修改哪些問題

例如下圖

![](https://i.imgur.com/Ig723uv.png)

黃框：目前有的問題資訊
藍框：基於上一個 baseline 我們修改了哪些問題(我修正了一個，所以會看到-1)

有了這項功能讓我們可以很好追蹤每次上到基於上次上版修改了哪些問題

`Ndepend` 利用上面介紹的 Metrics 來畫出炫砲圖表

![](https://i.imgur.com/aRvR5AE.png)

## Rule 介紹

`NDependOut` 提供許多 Rule 來建議我們程式碼優化，且裡面有許多詳細的說明

![](https://i.imgur.com/yif7FfJ.png)

### 建立自己 Code Rule

我覺得使用 `NDepend` 有一個很大的優勢是可以很簡單制訂自己的 `Rules` 

`NDepend`  自創 [CQL](https://www.ndepend.com/Features/#CQL) (Code Query Language) 來制訂檢驗規則，寫法跟 c# LINQ 非常類似

我們可以利用 CQL 來找尋符合，我們設定 Rule Metrics，並進行統計

最後呈現在 DashBoard 報表上

例如下面是 `NDepend` 其中一個 Rule  `Methods prefixed with 'Try' should return a boolean`

這個 Rule 代表是建議如果有取名叫 `Try` 開頭 method 建議返回值是 `bool` 比照 `Int32.TryParse`

`warnif count > 0` ： 代表如果有至少一個情況符合下面的條件就會顯示警告

其餘下面程式碼寫得很直白，開發過 Linq 的您應該很容易了解

最後我們可以把我們關注資訊 `select` 用一個匿名類別來返回我們要的資料

依照下面這個 Rule 我們判定是 `Severity.Medium`，另外對於每筆符合此 Rule 資料我們都會計算 `Debt` (程式債) 處理 + 10 分鐘

```c#
// <Name>Methods prefixed with 'Try' should return a boolean</Name>
// <Id>ND2016:MethodsPrefixedWithTryShouldReturnABoolean</Id>

warnif count > 0
from m in Application.Methods where
  m.SimpleNameLike("^Try") &&
  m.ReturnType != null &&
  m.ReturnType.FullName != "System.Boolean"
select new { 
   m, 
   m.ReturnType,
   Debt = 10.ToMinutes().ToDebt(),
   Severity = Severity.Medium
}

//<Description>
// When a method has a name prefixed with **Try**, it is expected that
// it returns a *boolean*, that reflects the method execution status,
// *success* or *failure*.
//
// Such method usually returns a result through an *out parameter*.
// For example:  *System.Int32.TryParse(int,out string):bool*
//</Description>

//<HowToFix>
// To fix a violation of this rule,
// Rename the method, or transform it into an operation that can fail.
//</HowToFix>
```

如果想要了解更多撰寫 Rule 方式可以參考[write-your-own-code-rules](https://www.ndepend.com/docs/write-your-own-code-rules)

我們可以依照團隊習慣和風格慢慢打造屬於自己的 **CQL Query** 來協助我們整個開發流程更穩健且  `NDepend` 對於 CI/CD Azure + TFS 支援性蠻好，對於想要建立 high quality devops 具有很大的幫助

## 小結

我覺得 `NDepend` 是一個很優秀的靜態分析工具，裡面的建議修改提示就像是旁邊有一個大師在跟你指導，可以學習到不少東西

`NDepend` 對於 CI/CD 整合有提供豐富的影片跟資訊可以參考
[devops-tfs-vsts-integration-ndepend](https://www.ndepend.com/docs/azure-devops-tfs-vsts-integration-ndepend)

可以讓我們每次 Release 開發結果更透明，讓整個團隊人能一目了然看到該專案的狀態

最後跟大家分享經由 `NDepend` 建議提示我調整了，我的專案分數跟程式複雜度有明顯下降

![](https://i.imgur.com/t2Yuf4U.png)
