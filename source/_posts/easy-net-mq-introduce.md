---
title: 串接 Restcountries By Vue.js
date: 2021-06-25 22:30:52
tags: [javascript,vue.js,Restcountries]
categories: [javascript,vue.js]
top:
photos: 
    - "https://i.imgur.com/vSRIciN.png"
---

## 前文

最近面試有一間公司要求使用[Restcountries API](https://restcountries.eu/)使用CRUD前端Html串接API，有看我文章的夥伴應該知道我大多是研究後端或CI/CD相關技術，對於前端技術較少研究，這次我打算使用vue.js來完成此次需求.

需求如下

1. 分頁
2. 顯示國家相關資訊
3. 排序效果
4. 點選國家名稱進入Detail頁面

因為以上幾點都是CRUD相關操作，關於CRUD相關操作使用三大框架就很適合(所以我選擇使用Vue)

話不多說先給大家看看成品 [RestcountriesSample](https://isdaniel.github.io/RestcountriesSample/)

[Source Code](https://github.com/isdaniel/RestcountriesSample)

## 要使用的API介紹

雖然官網對於API介紹雖少，但我相信只要有常串API的人應該可以很快猜出每個API作用.

* [All](https://restcountries.eu/rest/v2/all):請求所有國家資訊
* [FULL NAME](https://restcountries.eu/rest/v2/name/aruba?fullText=true):查找國家By名子.

> 而且我發現大部分API都可以用GET來請求.

只要用這兩個就可以完成我們的需求

## Code解說與問題分析

一開始我在分析問題是要找尋合適的API後面經過塞選挑出上面兩個API.

接下來我就考慮把畫面用Table + 分頁方式呈現,而Detail Page利用Query String方式傳Country Name來看明細資料.

我用Pure前端串接API，所以我建立兩個Html頁面

* 一個是Master Page
* 一個是Detail Page

### Master page 

![](https://i.imgur.com/Sj52iBe.png)

在Javascript code我主要介紹流程

主要在一開始頁面建立時去Load [All](https://restcountries.eu/rest/v2/all) 資料並把資料binding在`rows`陣列物件

`orderBy`方法，提供一個排序實現這邊可以讓Page呼叫時傳入要排的欄位名稱就可以不用HardCode(使用類似`@click="orderBy('name'),ASC *= -1"`)傳入Name就可以對於Name來排序，提高程式碼可用性

因為API請求有時候會比較久，所以我這邊使用[vue-loading-overlay](https://www.npmjs.com/package/vue-loading-overlay)來當Loading Page(有興趣的可以在查閱此連結的API)

```html
<div id="app">
<template>
    <div class="vld-parent">
    <loading :active.sync="isLoading" :is-full-page="true"></loading>
    </div>
</template>
<div><b>Search Country Name:</b> <input type="text" v-model="countryName"></div>
<div v-if="filteredRows.length === 0">No Data Display!!</div>
<table v-if="filteredRows.length > 0" class="table table-condensed">
    <thead>
    <tr>
        <th>國旗</th>
        <th @click="orderBy('name'),ASC *= -1">國家名稱
        <span class="icon" :class="{'Reverse':ASC==1}">
            <i class="fa fa-angle-up"></i>
        </span>
        </th>
        <th>2位國家代碼</th>
        <th>3位國家代碼</th>
        <th>母語名稱</th>
        <th>替代國家名稱</th>
        <th>國際電話區號</th>
    </tr>
    </thead>
    <tr v-for="item in filteredRows.slice(pageStart, pageStart + pageSize)">
    <td><img v-bind:src=item.flag style='height:150px'></td>
    <td>
        <a target="_blank" :href="'./CountryModel.html?countryName=' + item.name">
        {{ item.name }}
        </a>
    </td>
    <td>{{ item.alpha2Code }}</td>
    <td>{{ item.alpha3Code }}</td>
    <td>{{ item.nativeName }}</td>
    <td>{{ item.altSpellings[0] }}</td>
    <td>{{ item.callingCodes[0] }}</td>
    </tr>
</table>
<div class="pagination">
    <ul>
    <li v-bind:class="{'disabled': (currPage === 1)}" @click.prevent="setPage(currPage-1)"><a href="#">Prev</a></li>
    <li v-for="n in totalPage" v-bind:class="{'active': (currPage === (n))}" @click.prevent="setPage(n)"><a
        href="#">{{n}}</a></li>
    <li v-bind:class="{'disabled': (currPage === totalPage || totalPage === 0)}"
        @click.prevent="setPage(currPage+1)"><a href="#">Next</a></li>
    </ul>
</div>
</div>
```

```javascript
var app = new Vue({
    el: '#app',
    data: {
      rows: [],
      pageSize: 25,
      currPage: 1,
      countryName: '',
      ASC: 1,
      isLoading: true
    },
    computed: {
      filteredRows: function () {
        var self = this;
        return self.rows.filter(x=> !self.countryName || x.name.search(self.countryName) != -1);
      },
      pageStart: function () {
        return (this.currPage - 1) * this.pageSize;
      },
      totalPage: function () {
        return Math.ceil(this.filteredRows.length / this.pageSize);
      }
    },
    methods: {
      setPage: function (index) {
        if (index <= 0 || index > this.totalPage) {
          return;
        }
        this.currPage = index;
      },
      orderBy: function (item) {
        var self = this;
        return self.rows.sort(function (obj1, obj2) {
          var obj1 = obj1[item]
          var obj2 = obj2[item]

          if (obj1 === obj2)
            return 0;
          else if (obj1 > obj2)
            return self.ASC;
          else
            return self.ASC * -1;
        });
      }
    },
    created: function () {
      var self = this;
      $.get('https://restcountries.eu/rest/v2/all', function (data) {
        self.rows = data;
        self.isLoading = false;
      });
    },
    watch:{
      countryName:function(newValue){
        this.currPage = 1;
      }
    }
});
```

### Detail Page

![](https://i.imgur.com/PLnxUIn.png)

Detail我使用[FULL NAME](https://restcountries.eu/rest/v2/name/aruba?fullText=true)來查找我要的國家明細

Detail Html畫面，我就不多說可以看原始碼

因為我在設計時想要使用QueryString來傳送CountryName，所以我利用`URLSearchParams`來取得QueryString `countryName`資料並使用Ajax查詢API

如果查不到資料或使用者傳送一個不存在的資訊，我就會顯示`No Data Display!!`

```javascript
var app = new Vue({
    el: '#app',
    data: {
      vm: {},
      isLoading : true
    },
    created: function () {
      var self = this;
      let urlParams = new URLSearchParams(window.location.search);
      var countryName = urlParams.has('countryName') ? urlParams.get('countryName') : '';
      var url = 'https://restcountries.eu/rest/v2/name/'+encodeURI(countryName)+'?fullText=true'
      $.get(url, function (data) {
        self.vm = data[0];
        self.isLoading = false;
      }).fail(function() {
        document.write('No Data Display!!');
      });
    }
  });
```

## 小結

這次題目我前後大約花半天就把東西從無到有完成，個人覺得還算蠻順利的，但我寫的Front Code可能不太標準(因為我很少寫Js XDD)

如果有寫得不好的地方在歡迎指教

不得不說我覺得Vuejs寫起來真的蠻直覺，而且很多資源可以查閱學習來相對蠻容易的

相是Loading Page就有很多不同的樣式可以挑選.
