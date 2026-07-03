---
title: 深入 pgrx 呼叫慣例：一個 Rust 值如何進出 PostgreSQL
date: 2026-07-03 21:15:30
tags: [Rust, PostgreSQL, pgrx, Datum, FFI, SystemDesign]
categories: [Rust, PostgreSQL, pgrx]
keywords: pgrx,Rust,PostgreSQL,Datum,FromDatum,IntoDatum,ArgAbi,RetAbi,BoxRet,calling-convention,呼叫慣例,SRF,Set-Returning-Function,varlena,TOAST,palloc,MemoryContext,pg_extern
description: "用一個最簡單的 #[pg_extern] 函式當主角，追到 pgrx 最底層的 ABI trait，把 Rust 型別與 PostgreSQL Datum 之間的完整轉換機制講清楚。"
lang: zh-tw
---

## 前言

PostgreSQL 是 C 寫的，它不認識 Rust。但 [pgrx](https://github.com/pgcentralfoundation/pgrx) 卻能讓你只寫三行 Rust，就得到一個和原生 C extension 同等地位的 SQL 函式。這中間到底發生了什麼？

本文用一個最簡單的 `#[pg_extern]` 函式當主角，一路追到 pgrx 最底層的 ABI trait，把「Rust 型別 ↔ PostgreSQL Datum」的完整轉換機制講清楚。讀完你會理解 pgrx 的四個核心 trait（`FromDatum` / `IntoDatum` / `ArgAbi` / `RetAbi`）各自的職責，以及巨集生成的 wrapper 是怎麼把它們串起來的。

> 對照的原始碼版本：**pgrx 0.19.1**。行號可能隨版本變動，但結構穩定。
>
> 這篇是我先前 [《深入 pgrx 機制：用 Rust 撰寫 PostgreSQL Extension 的底層原理與實戰》](https://isdaniel.github.io/pgrx-postgresql-extension-mechanism-deep-dive/) 的延伸：前一篇談的是「Rust 怎麼跟 C 寫的 PostgreSQL 互通」（ABI、Magic Block、bindgen），這篇則聚焦「一個值怎麼在函式邊界進出」。

---

## 一、心智模型：Datum 是一個「萬用信封」

PostgreSQL 在函式邊界傳遞的唯一貨幣是 **Datum**——可以想成一個「8 bytes 的萬用信封」：

- 型別很小（`int4`）：信封裡直接裝著值。
- 型別很大（`text`、`array`、`jsonb`）：信封裡裝的是一個**指標**，指向記憶體某處真正的資料。

PG 呼叫你的函式時，遞給你一疊信封（包在 `FunctionCallInfo` 裡）；你算完後，也要把答案塞回一個信封還給它。

**pgrx 做的全部事情**，就是幫你自動完成兩個方向的信封拆裝：

1. **拆信封**：Datum → 好用的 Rust 型別（`&str`）
2. **裝信封**：Rust 答案（`String`）→ Datum

你寫的業務邏輯夾在中間，乾乾淨淨完全不碰信封。這就是 pgrx 的價值。

---

## 二、主角登場

以 `pgrx-examples/strings/src/lib.rs` 裡最單純的函式為例：

```rust
#[pg_extern]
fn to_lowercase(input: &str) -> String {
    input.to_lowercase()
}
```

在 SQL 端：

```sql
SELECT to_lowercase('HELLO');   -- => 'hello'
```

它剛好同時用到「參數拆信封」與「回傳裝信封」兩個方向，是完美的教材。整條呼叫鏈的全景：

```
psql: SELECT to_lowercase('HELLO');
        │
        ▼
① PostgreSQL 執行器
   準備好 FunctionCallInfo（那疊信封），呼叫 C ABI 函式指標
        │
        ▼
② to_lowercase_wrapper()   ← #[pg_extern] 巨集「自動生成」的那層
   - 從 fcinfo 拿出第 0 個 Datum
   - 【拆信封】Datum ──► &str
        │
        ▼
③ 你手寫的 to_lowercase(input: &str) -> String
        input.to_lowercase()              （純 Rust，沒 PG 的事）
        │
        ▼
② 回到 wrapper
   - 【裝信封】String ──► Datum
   - return Datum 給 PostgreSQL
        │
        ▼
① PostgreSQL 拿到結果 → 'hello'
```

三個角色：**① PG 執行器**（別人的）、**② wrapper**（巨集生的，你看不到但很重要）、**③ 你的函式**。以下逐段拆解。

---

## 三、`#[pg_extern]` 巨集生成了什麼

你只寫了 3 行，`#[pg_extern]`（一個 proc-macro）在**編譯時**幫你多生成一個「翻譯官」wrapper 函式。為什麼需要它？因為 PG 只會呼叫「長得像 C 函式、吃 `fcinfo` 吐 `Datum`」的東西，你的 `fn(&str) -> String` 簽名 PG 根本沒辦法直接呼叫。

真實生成的 wrapper 核心（`pgrx-sql-entity-graph/src/pg_extern/mod.rs`，已簡化排版）：

```rust
fn _internal_wrapper<'fcx>(fcinfo: &mut FcInfo<'fcx>) -> Datum<'fcx> {
    unsafe {
        // 問回傳型別：這次該「跑函式」還是「恢復 SRF 狀態」？
        let call_flow = <RetTy as RetAbi>::check_and_prepare(fcinfo);
        let result = match call_flow {
            CallCx::WrappedFn(mcx) => {
                let mut mcx = PgMemoryContexts::For(mcx);
                let _args = &mut fcinfo.args();
                let call_result = mcx.switch_to(|_| {
                    // ← 逐參數拆信封（見第六節）
                    // ← 呼叫你的函式
                });
                RetAbi::to_ret(call_result)
            }
            CallCx::RestoreCx => <RetTy as RetAbi>::ret_from_fcx(fcinfo),
        };
        <RetTy as RetAbi>::box_ret_in(fcinfo, result) // ← 裝信封（見第四節）
    }
}
```

> **動手驗證**：`cargo install cargo-expand`，在 `pgrx-examples/strings/` 跑 `cargo expand`，就能親眼看到這個 wrapper 被生出來。這是理解 pgrx 最有價值的一步。

除了生 wrapper，`#[pg_extern]` 還記錄「這個函式的 SQL 長相」，之後 `cargo pgrx schema` 用它產生 `CREATE FUNCTION to_lowercase(text) RETURNS text ...`。這部分屬於 `pgrx-sql-entity-graph`，本文不展開。

---

## 四、拆信封：`FromDatum`

`FromDatum`（`pgrx/src/datum/from.rs`）是「值轉換」層，核心一個方法：

```rust
pub trait FromDatum: Sized {
    unsafe fn from_polymorphic_datum(
        datum: pg_sys::Datum,   // 信封
        is_null: bool,          // 是不是 SQL NULL
        typoid: pg_sys::Oid,    // 型別 OID（多型才需要）
    ) -> Option<Self>;          // 拆出來的 Rust 值；NULL → None
}
```

「給我一個信封 + 它是不是 NULL，我還你 `Option<你的型別>`。」`None` 就代表 SQL 的 `NULL`——這是 pgrx 處理 NULL 的統一手法。


```rust
impl<'a> FromDatum for &'a str {
    unsafe fn from_polymorphic_datum(datum, is_null, _) -> Option<&'a str> {
        if is_null || datum.is_null() {
            None                              // NULL → None
        } else {
            // text 是變長型別(varlena)，可能被壓縮或搬到 TOAST 表，
            // pg_detoast_datum_packed 把它「解壓 / 拉回來」
            let varlena = pg_sys::pg_detoast_datum_packed(datum.cast_mut_ptr());
            // 把 varlena 內容當 UTF-8 包成 &str（不複製，直接借用 PG 的記憶體）
            Some(convert_varlena_to_str_memoized(varlena))
        }
    }
}
```

這裡藏著三個必懂的 PostgreSQL 機制：

1. **varlena**：`text` / `bytea` / `array` 這種變長型別，記憶體佈局是「4-byte 長度標頭 + 資料」。信封裡的指標指向的就是這個結構。
2. **TOAST / detoast**：字串很大時 PG 會壓縮、甚至存到另一張表。所以不能直接讀信封裡的指標，必須先 `detoast` 還原。這就是為什麼 `int4` 的 `FromDatum` 一行搞定，而 `&str` 要多這一步。（想深入 varlena / TOAST 的記憶體佈局，可參考我另一篇 [《PostgreSQL Varlena 與 TOAST 機制深度解析》](https://isdaniel.github.io/postgresql-varlena-toast-deep-dive/)。）
3. **零複製借用**：回傳的 `&'a str` 直接指向 PG 記憶體，沒有 copy，所以帶生命週期 `'a`。快，但不能讓它活過那塊記憶體——這也是 pgrx 型別到處都是 lifetime 的原因。

> **借用 vs 複製**：同檔案下方的 `impl FromDatum for String` 會**複製一份**到 Rust 自己管理的記憶體。`&str` = 借 PG 記憶體，快但短命；`String` = 複製一份，慢但你自己擁有。這個取捨貫穿整個 pgrx。

---

## 五、裝信封：`IntoDatum` → `BoxRet` → `RetAbi`

回傳方向比想像中多一層。**你的 `IntoDatum` 不是被 wrapper 直接呼叫的**，中間隔著 `BoxRet` / `RetAbi`。

```
你的函式 return String
      │
      ▼
① RetAbi      ← 回傳位置的「總 ABI 協定」（處理單值 / 多列 SRF 所有情況）
      │  String 走最單純那條，靠 blanket impl 轉包
      ▼
② BoxRet      ← 「把單一 Rust 值裝成 Datum」的簡化協定
      │  String 的 BoxRet 實作 = 呼叫你的 into_datum()
      ▼
③ IntoDatum   ← 你實現的這個，純粹做「值 → Datum」轉換
      │
      ▼
   Option<Datum>   （Some=有值, None=SQL NULL）
      │
      ▼
④ return_raw_datum / return_null   ← 把結果 + null 旗標寫回 fcinfo
      │
      ▼
   交還 pg_sys::Datum 給 PostgreSQL
```

### 5.1 `IntoDatum`：純值轉換

`String` 的實作（`datum/into.rs:262` 的巨集）：

```rust
impl IntoDatum for String {
    fn into_datum(self) -> Option<pg_sys::Datum> {
        self.as_bytes().into_datum()          // 轉包給 &[u8] 的實作
    }
    fn type_oid() -> pg_sys::Oid { pg_sys::TEXTOID }
}
```

真正幹活的 `&[u8]::into_datum`

```rust
fn into_datum(self) -> Option<pg_sys::Datum> {
    let len = self.len() + VARHDRSZ;          // 資料長度 + 4 bytes 標頭
    // ★ 用 palloc，不是 Rust 的 malloc！
    let varlena = pg_sys::palloc(len) as *mut pg_sys::varlena;
    set_varsize_4b(varlena, len);             // 把長度寫進 varlena 標頭
    std::ptr::copy_nonoverlapping(self.as_ptr(), 資料區, self.len());
    Some(pg_sys::Datum::from(varlena))
}
```

**最關鍵的 PostgreSQL 機制：`palloc` / MemoryContext。**

> 你回傳給 PG 的東西，**必須用 `palloc` 分配**，不能用 Rust 的 `Box` / `malloc`。因為 PG 用它自己的「記憶體上下文（MemoryContext）」管生命週期——查詢結束時整包釋放。若你用 Rust heap 給它，PG 不知道怎麼回收，就會洩漏或 crash。
>
> **進 PG 的東西走 palloc；純 Rust 內部運算走 Rust heap。** 這是貫穿全 pgrx 的第二個取捨。

### 5.2 `BoxRet`：把 `IntoDatum` 接上函式邊界

`IntoDatum` 是通用轉換，不知道 fcinfo 存在。但「從 PG 函式回傳」還要處理 NULL 旗標。pgrx 用一個 macro 幫一票有 `IntoDatum` 的型別自動生出 `BoxRet`：

```rust
macro_rules! impl_repackage_into_datum {
    ($($boxable:ty),*) => {
        $(  unsafe impl BoxRet for $boxable {
                unsafe fn box_into<'fcx>(self, fcinfo: &mut FcInfo<'fcx>) -> Datum<'fcx> {
                    match self.into_datum() {          // ★★ 呼叫你的 IntoDatum ★★
                        Some(datum) => unsafe { fcinfo.return_raw_datum(datum) },
                        None        => fcinfo.return_null(),
                    }
                }
          })*
    };
}
impl_repackage_into_datum! { String, CString, Vec<u8>, char, Json, JsonB, Uuid, ... }
```

**這行 `match self.into_datum()` 就是「協同」發生的地方。**

> 實務重點：如果你為一個新型別實作了 `IntoDatum`，它**還不能直接當回傳值**，因為缺 `BoxRet`。最省事的方式就是把型別加進這個 `impl_repackage_into_datum!` 清單。

### 5.3 NULL 是旗標，不是值

`box_into` 把 `Option<Datum>` 翻譯成 PG 機制：

```rust
// Some 路徑（callconv.rs:743）
pub unsafe fn return_raw_datum(&mut self, datum) -> Datum<'fcx> {
    *self.set_return_is_null() = false;   // 告訴 PG：這次回傳「不是」NULL
    mem::transmute(datum)
}
// None 路徑（callconv.rs:723）
pub fn return_null(&mut self) -> Datum<'fcx> {
    unsafe { *self.set_return_is_null() = true };   // 告訴 PG：這次回傳「是」NULL
    Datum::null()
}
```

> PostgreSQL 判斷回傳是不是 NULL，**不看 Datum 內容**，而是看 `fcinfo->isnull` 這個獨立布林欄位。所以「回傳 NULL」= 設 `isnull = true`，Datum 給什麼都無所謂。這就是為什麼不能讓 `into_datum` 直接對接 PG，中間一定要有 `box_into` 這個「同時管 Datum 和 isnull」的協調者。

---

## 六、`RetAbi` 到底扛了什麼髒活：SRF

`RetAbi` 比 `BoxRet` 複雜得多，而它的複雜度 **90% 來自 SRF（Set-Returning Function，回傳多列的函式）**：

```sql
SELECT * FROM split_table('a,b,c', ',');   -- 回傳 3 列
```

對應的 Rust：`fn split_table(...) -> TableIterator<...>`。

### 6.1 PostgreSQL 的 SRF 協定：Value-Per-Call

PG **不支援**「你一次 return 一個 Vec，我收下」。它用「**每列呼叫一次**」協定：

> PG：「給我第一列。」→ 函式被呼叫，回傳 row 1，然後**整個函式結束、堆疊清空**。
> PG：「給我下一列。」→ **同一個函式又從頭被呼叫一次**，回傳 row 2。
> …重複 N 次…
> 你：「沒了。」→ 回傳 done 訊號，PG 停止。

問題：函式每次從頭跑，區域變數全沒了，「我上次吐到第幾列」的狀態存哪？

PG 的答案：給你一塊**跨呼叫存活的記憶體**（`FuncCallContext` + `multi_call_memory_ctx`），叫你把 iterator 塞進去；下次呼叫再撈回來續跑。**`RetAbi` 的全部髒活就是管這個生命週期。**

### 6.2 `RetAbi` 每個方法對應的髒活

對照 `TableIterator` 的實作 ：

| 方法 | 髒活 |
|---|---|
| `check_fcinfo_and_prepare` | 問 PG「這是第幾次呼叫？」首次 → 開跨呼叫記憶體、回 `WrappedFn`；續集 → 回 `RestoreCx` |
| `to_ret` | 把使用者的 iterator 轉成內部 `Step` 狀態機，順便先 `next()` 一次確認空不空 |
| `move_into_fcinfo_fcx` | **把 iterator 存進跨呼叫記憶體**（`leak_and_drop_on_delete`：搬進 PG 記憶體並登記「這塊被刪時要 drop 這個 Rust 物件」） |
| `ret_from_fcinfo_fcx` | **續集時把 iterator 撈回來**，`next()` 抽下一列 |
| `box_ret_in_fcinfo` | 把這一列裝成 Datum，並 `srf_return_next` 撥「還有下一列」旗標 |
| `finish_call_fcinfo` | `srf_return_done` 撥「結束」旗標，PG 才停止呼叫並清記憶體（觸發 Rust drop） |

`CallCx` 這個 enum 就是給 wrapper 的方向盤：

```rust
pub enum CallCx {
    RestoreCx,                        // 續集：跳過使用者函式，去撈狀態
    WrappedFn(pg_sys::MemoryContext), // 首次：切到這個記憶體、跑使用者函式
}
```

### 6.3 兩條生命週期並排看

| 階段 | `String`（單值，走 `BoxRet`） | `TableIterator`（SRF，走完整 `RetAbi`） |
|---|---|---|
| PG 呼叫次數 | **1 次** | **N+1 次**（N 列 + 1 次收尾） |
| 跑使用者函式 | 每次都跑 | **只有第一次跑**，之後不跑 |
| 狀態保存 | 不需要 | `move_into_fcinfo_fcx` 存 iterator |
| 狀態恢復 | 不需要 | `ret_from_fcinfo_fcx` 撈 iterator |
| 每次回傳 | `box_into` → 一個 Datum | `box_ret_in_fcinfo` → 一列 + `srf_return_next` |
| 收尾 | 無 | `finish_call_fcinfo` → `srf_return_done` |

這就是為什麼 `String` 只需簡化版 `BoxRet`，而 `TableIterator` 需要完整 `RetAbi`。`BoxRet` 本質上是「把 `RetAbi` 除 `box_into` 外的方法全給空實作」的那條 blanket impl。

> **最硬的髒活**是「Rust 物件跨 C 函式呼叫存活 + 正確 Drop」。`leak_and_drop_on_delete` 把 iterator 搬進 PG 記憶體並掛上解構子——這是手寫 C extension 最容易洩漏 / crash 的地方，`RetAbi` 全包了。

### 6.4 附帶：`Result<T, E>` 的回傳

pgrx 讓你能寫 `-> Result<String, MyError>`。它的 `to_ret` 裡呼叫 `unwrap_or_report`：若是 `Err`，轉成 PostgreSQL 的 `ereport` 錯誤（SQL 端看到錯誤並中止交易），否則解包 `Ok` 值繼續走正常回傳。**所以 pgrx 函式回傳 `Result` 的 `Err` = PG 端的 ERROR。**

---

## 七、參數方向：與回傳對稱的 `ArgAbi`

回頭看第三節 wrapper 裡的參數拆解。參數方向有一套跟回傳完全對稱的 ABI trait，叫 `ArgAbi`。

### 7.1 巨集怎麼生「拆信封」語句

wrapper 生成邏輯：

```rust
// ① 每個參數的綁定名：input → input_（加底線避開名稱衝突，是個 workaround）
let arg_pats = args.iter().map(|v| format_ident!("{}_", &v.pat)).collect();
// ② 參數迭代器變數名：_args
let args_ident = Ident::new("_args", ...);
// ③ 每個參數生一句「掏出下一個、解箱、失敗就 panic」
let arg_fetches = arg_pats.iter().map(|pat| quote!{
    let #pat = #args_ident.next_arg_unchecked()
        .unwrap_or_else(|| panic!("unboxing {} argument failed", stringify!(#pat)));
});
```

`quote!` 的重複語法只有一條規則：

```
#(#變數)*      → 逐元素展開，之間「沒有分隔符」
#(#變數),*     → 逐元素展開，之間用「逗號」分隔
```

對 `substring(input: &str, start: i32, end: i32)`，逐參數拆解會展開成三句 `let`，再展開成 `substring(input_, start_, end_)`：

```rust
let input_ = _args.next_arg_unchecked().unwrap_or_else(|| panic!(...));
let start_ = _args.next_arg_unchecked().unwrap_or_else(|| panic!(...));
let end_   = _args.next_arg_unchecked().unwrap_or_else(|| panic!(...));
substring(input_, start_, end_)
```

> **為什麼需要這道拆解？** wrapper 從 PG 拿到的是 `fcinfo`（一坨裸信封），不是打好型別的 Rust 值。你的函式要 `&str` 不是 `Datum`。這道「拆信封」工序就是：每個參數生一句 `let`，把第 i 個裸 Datum 掏出來、解箱成正確型別的綁定。
>
> **漂亮的細節**：`next_arg_unchecked()` 沒寫 `::<&str>`。型別靠 Rust 從後面 `to_lowercase(input_)` 的簽名**反推**回來——巨集完全不用知道參數型別，交給編譯器。這就是這句能對所有型別通用的原因。

### 7.2 `ArgAbi` → `FromDatum` 的接線

```
_args.next_arg_unchecked::<&str>()
        │  callconv.rs:940
        ▼
Args::next() → 取出第 i 個 Arg(fcinfo, i, &NullableDatum)  // {value: Datum, isnull}
        │
        ▼
<&str as ArgAbi>::unbox_arg_unchecked(arg)   // ArgAbi = 參數位置的 ABI 協定
        │  （&str 由 argue_from_datum! 巨集生成，callconv.rs:253）
        ▼
arg.unbox_arg_using_from_datum::<&str>()      // callconv.rs:887
        │
        ▼
<&str as FromDatum>::from_datum(datum, isnull)  // 第四節那個 detoast + 借用
        │
        ▼
      &str（借用 PG 記憶體）
```

橋接點 `unbox_arg_using_from_datum`：

```rust
pub unsafe fn unbox_arg_using_from_datum<T: FromDatum>(self) -> Option<T> {
    if T::GET_TYPOID {
        T::from_polymorphic_datum(self.2.value, self.is_null(), self.raw_oid())  // 多型
    } else {
        T::from_datum(self.2.value, self.is_null())     // 一般：detoast + 借用
    }
}
```

`Args` 就是「把 PG 那疊信封做成 Rust 迭代器」，`next_arg_unchecked` 每叫一次吐一個 `Arg`，交給 `ArgAbi` 解箱。

---

## 八、收束：pgrx 呼叫慣例的四格大圖

這是理解 pgrx 的最終地圖，值得背下來：

| | 值轉換層（通用、到處用） | ABI 層（只在函式邊界、管 fcinfo） |
|---|---|---|
| **參數方向（進）** | `FromDatum::from_datum` 拆信封 | `ArgAbi::unbox_arg_unchecked` |
| **回傳方向（出）** | `IntoDatum::into_datum` 裝信封 | `BoxRet::box_into` / `RetAbi`（含 SRF） |

兩個關鍵洞察：

1. **內圈（`FromDatum` / `IntoDatum`）是純資料轉換**，跟 fcinfo 無關，所以 SPI 傳參、建 array、composite type 也都在用它們——通用。**外圈（`ArgAbi` / `BoxRet`）是函式邊界專屬的 ABI**，負責 fcinfo 髒活（null 旗標、參數迭代、pass-by-ref/value、SRF 多列、生命週期），再把值轉換轉包給內圈。

2. **唯一不對稱的地方是 `RetAbi`**：因為 PG「回傳多列」比「吃多個參數」複雜得多——參數永遠一次給齊，回傳卻可能分 N 次。所以進的方向只有 `ArgAbi` 一個 trait，出的方向卻有 `BoxRet` + `RetAbi` 兩個。

---

## 九、給想貢獻 pgrx 的人：實務清單

- 想讓一個新型別能當**參數**：實作 `FromDatum`，並確保有對應的 `ArgAbi`（多數走 `argue_from_datum!` 或 borrow-based 的 blanket impl）。
- 想讓一個新型別能當**回傳值**：實作 `IntoDatum`，並把它掛上 `BoxRet`（最省事：加進 `impl_repackage_into_datum!` 清單）。光有 `IntoDatum` 不夠。
- 回傳多列：實作 `Iterator` 並用 `SetOfIterator` / `TableIterator` 包起來，`RetAbi` 的 SRF 生命週期它們已經幫你處理好。
- 測試一定要用 `#[pg_test]`（在真實 PG 裡跑），純 `#[test]` 碰不到 PG 內部。
- 動 unsafe 前先讀 repo 根目錄的 `SAFETY.md`，PR review 主要卡在這裡。

---

## 小結

pgrx 看似魔法，拆開後其實只是四個 trait 分工合作：**內圈的 `FromDatum` / `IntoDatum` 負責純值轉換，外圈的 `ArgAbi` / `RetAbi` 負責函式邊界的 ABI 髒活**，中間靠 `#[pg_extern]` 巨集生成的 wrapper 串起來。

理解這條「一個值如何進出 PostgreSQL」的鏈路後，你不但能看懂 pgrx 生成的程式碼，也能自己為新型別擴充參數與回傳支援——甚至讀懂手寫 C extension 為什麼那麼容易在記憶體管理上翻車。

---

## References

- [深入 pgrx 機制：用 Rust 撰寫 PostgreSQL Extension 的底層原理與實戰](https://isdaniel.github.io/pgrx-postgresql-extension-mechanism-deep-dive/)
- [PostgreSQL Varlena 與 TOAST 機制深度解析](https://isdaniel.github.io/postgresql-varlena-toast-deep-dive/)
- [PostgreSQL: Version 1 Calling Conventions](https://www.postgresql.org/docs/current/xfunc-c.html#XFUNC-C-V1-CALLING)
