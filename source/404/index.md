---
title: '404 - 頁面不存在'
date: 2021-07-31 00:01:35
comments: false
permalink: /404.html
description: "找不到您要的頁面。此頁面可能已移除或網址有誤。"
robots: "noindex, nofollow"
lang: zh-tw
---

## 這是一個不存在的頁面

很抱歉，你要找的頁面不存在，可能是網址有誤或文章已經搬家。

試試這些地方：

- **[所有文章](/archives/)** — 依時間排列的完整列表
- **[分類](/categories/)** ／ **[標籤](/tags/)** — 依主題瀏覽
- **[PostgreSQL](/tags/PostgreSQL/)** ／ **[Rust](/tags/Rust/)** ／ **[C#](/tags/csharp/)** — 主要主題
- **[回首頁](/)**

<p id="redirect-hint" hidden>偵測到大小寫不同的網址，正在為你轉往正確頁面…</p>

<script>
// 2021-04-05 的 commit 3854696 把所有文章檔名轉成小寫，GitHub Pages 的路徑區分大小寫，
// 因此舊的大寫連結會落到這裡。scripts/seo-redirects.js 已為所有已知的歷史網址產生
// 轉址檔，這段只是最後的保險：若小寫版本存在就帶過去。
//
// 刻意「不」在倒數後自動跳回首頁 —— 那會讓每個死連結變成 soft 404，
// 搜尋引擎會把它當成內容頁而不是錯誤頁。
(function () {
  var lower = window.location.href.toLowerCase();
  if (lower === window.location.href) return;

  fetch(lower, { method: 'HEAD' })
    .then(function (res) {
      if (res.ok) {
        document.getElementById('redirect-hint').hidden = false;
        window.location.replace(lower);
      }
    })
    .catch(function () { /* 保持在 404 頁 */ });
})();
</script>
