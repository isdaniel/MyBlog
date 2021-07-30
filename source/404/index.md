---
title: '404 - 真巧，竟然在這裡遇到你！'
date: 2021-07-31 00:01:35
comments: false
permalink: /404.html
---

## 這是一個不存在的頁面

很抱歉，你目前存取的頁面並不存在。

預計在<span id="timeout">3</span> 秒後返回首頁。

如果你很急著想看文章，你可以 **[點這裡](https://isdaniel.github.io//)** 返回首頁。

<script>
let countTime = 3;

function count() {
  
  document.getElementById('timeout').textContent = countTime;
  countTime -= 1;
  if(countTime === 0){
    location.href = 'https://isdaniel.github.io//'; 
  }
  setTimeout(() => {
    count();
  }, 1000);
}

count();
</script>
