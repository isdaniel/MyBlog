---
title: '404 - 連結遺失'
date: 2021-07-31 00:01:35
comments: false
permalink: /404.html
---

## 這是一個不存在的頁面

很抱歉，你目前存取的頁面並不存在。

預計在<span id="timeout">5</span> 秒後返回首頁。

如果你很急著想看文章，你可以 **[點這裡](https://isdaniel.github.io//)** 返回首頁。

<script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
<script>
let countTime = 5;

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

$(function(){
  var urlLowerCase = window.location.href.toLowerCase();
  $.ajax(urlLowerCase, {
   type: "GET",
   statusCode: {
      200: function (response) {
        location.href = urlLowerCase;
      },
      404: function (response) {
         count();
      }
   }
  });
});
</script>
