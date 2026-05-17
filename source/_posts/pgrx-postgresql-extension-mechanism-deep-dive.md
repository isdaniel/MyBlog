---
title: 深入 pgrx 機制：用 Rust 撰寫 PostgreSQL Extension 的底層原理與實戰
date: 2026-05-17 10:50:42
tags: [Rust, PostgreSQL, pgrx, Extension, FFI, SystemDesign]
categories: [Rust, PostgreSQL, pgrx]
keywords: pgrx,Rust,PostgreSQL,extension,FFI,bindgen,Datum,MemoryContext,setjmp,longjmp,timescale-extension-utils,pg_fn,pg_agg,pg_module,V1-calling-convention
description: "從零開始拆解 pgrx 如何讓 Rust 與 C 寫的 PostgreSQL 完美互通,並以 timescale-extension-utils-rs 為例,帶初學者了解 pg_fn!、pg_agg!、Datum 轉換、MemoryContext 與 longjmp 處理的完整機制"
lang: zh-tw
---

## 前言

PostgreSQL 是用 C 撰寫的資料庫,它的 extension 系統設計上就是「載入 shared library 並呼叫其中的 C 函數」。長期以來,如果你想擴充 PostgreSQL — 寫一個自訂的 SQL function、Aggregate、Index、FDW、甚至 Background Worker — 都得用 C。但 C 開發體驗痛苦:手動管理記憶體、容易踩到 segfault、缺乏現代化的測試框架。

**[pgrx](https://github.com/pgcentralfoundation/pgrx)** 改變了這個局面。它讓 Rust 開發者可以在不犧牲效能的前提下,享受型別安全、ownership、RAII 等好處,寫出與原生 C extension 同等地位的 PostgreSQL extension。

但 pgrx 究竟是怎麼讓 Rust 與 C 寫的 PostgreSQL 「完美合作」?這篇文章會帶你深入到最底層,並透過我自己研究的 [`timescale-extension-utils-rs`](https://github.com/isdaniel/timescale-extension-utils-rs) 這個輕量級實作(它可以視為一個「迷你 pgrx」),把每一個關鍵機制拆給你看 — 你會看到 pgrx 在背後到底幫你做了多少事。

> 這個範例 repo 是一個三 crate 的 workspace:`postgres-headers-rs`(透過 bindgen 產生 PG 的 FFI 綁定)、`timescale-extension-utils`(提供 `pg_fn!` / `pg_agg!` / `pg_module!` macro)、`example-extension`(實際用這些 macro 寫出來的 demo extension)。閱讀它的原始碼,對理解 pgrx 是極佳的入門。

---

## 一、為什麼 Rust 能跟 C 寫的 PostgreSQL 互通

要先建立一個觀念:**PostgreSQL extension 的兼容性不是「語言」問題,而是「ABI」問題。**

PostgreSQL 載入 extension 的流程很單純:

1. 使用 `dlopen()` 載入 `.so` / `.dll` 檔。
2. 用 `dlsym()` 查找特定符號(例如 `add_integers`、`pg_finfo_add_integers`、`Pg_magic_func`)。
3. 拿到 function pointer 後直接呼叫。

只要產出的二進位:
- 符合 **C ABI**(stack frame、register passing、name mangling 關閉)。
- 內含 PostgreSQL 規定的 **Magic Block**(讓 PG 確認版本相容)。
- 函數使用 **Version 1 Calling Convention**(固定簽名 `Datum func(FunctionCallInfo)`)。

那麼這個 extension 就跟 C 寫的沒兩樣。Rust 透過 `extern "C"`、`#[no_mangle]`、`#[repr(C)]` 三大武器完美滿足這些條件。

---

## 二、第一塊拼圖:bindgen 自動產生 FFI 綁定

要在 Rust 呼叫 PostgreSQL 內部的 C 函數,你需要對應的 Rust 宣告。手寫上萬個 struct 和 function declaration 是不切實際的。

pgrx 和 timescale-extension-utils-rs 都使用 **bindgen** 在 `build.rs` 階段自動解析 PostgreSQL 的 C header,產生 Rust 的 `unsafe extern "C"` 宣告。

來看 `postgres-headers-rs/build.rs` 中的關鍵段落:

```rust
let pg_include = include_dir(&pg_config)
    .expect("Could not find postgres install");

let bindings = bindgen::Builder::default()
    .clang_arg(format!("-I{}", pg_include))
    .header("wrapper.h")
    .generate()
    .expect("Unable to generate bindings");

bindings.write_to_file(out_path).expect("Couldn't write bindings!");
```

而 `wrapper.h` 是個簡單的 C header,把所有需要暴露給 Rust 的 PostgreSQL header `#include` 進來:

```c
#include "postgres.h"
#include "executor/spi.h"
#include "foreign/fdwapi.h"
#include "utils/builtins.h"
#include "utils/palloc.h"
// ... 等等
```

bindgen 會幫你產生類似這樣的 Rust 程式碼(輸出到 `OUT_DIR/generated.rs`):

```rust
#[repr(C)]
pub struct FunctionCallInfoBaseData {
    pub flinfo: *mut FmgrInfo,
    pub context: *mut Node,
    pub resultinfo: *mut Node,
    pub fncollation: Oid,
    pub isnull: bool,
    pub nargs: c_short,
    pub args: __IncompleteArrayField<NullableDatum>,
}

extern "C" {
    pub fn palloc(size: Size) -> *mut c_void;
    pub fn pfree(pointer: *mut c_void);
    pub fn pg_re_throw() -> !;
    pub static mut CurrentMemoryContext: MemoryContext;
    pub static mut PG_exception_stack: *mut sigjmp_buf;
}
```

**`#[repr(C)]`** 是這裡的關鍵 — 它強制 Rust struct 的 memory layout 完全比照 C struct,這樣當 PG 把 `FunctionCallInfo` 的 pointer 傳進來時,Rust 可以正確讀取每個欄位。

---

## 三、第二塊拼圖:Magic Block — PG 載入時的握手協議

PostgreSQL 載入 shared library 時,**第一件事**就是去找 `Pg_magic_func()` 這個符號,呼叫它取得一個結構,比對裡面的版本資訊。版本不符就直接拒絕載入,避免 ABI 不相容造成的 crash。

在 C extension 裡,通常一行 `PG_MODULE_MAGIC;` 就解決。在 Rust 中我們得手動產生這個函數。看 `timescale-extension-utils-rs` 怎麼用 macro 包起來:

```rust
#[macro_export]
macro_rules! pg_module {
    ($version:expr) => {
        #[no_mangle]
        pub extern "C" fn Pg_magic_func() -> &'static pg_sys::Pg_magic_struct {
            const MY_MAGIC: pg_sys::Pg_magic_struct = pg_sys::Pg_magic_struct {
                len: std::mem::size_of::<pg_sys::Pg_magic_struct>() as c_int,
                version: $version,
                funcmaxargs: pg_sys::FUNC_MAX_ARGS as c_int,
                indexmaxkeys: pg_sys::INDEX_MAX_KEYS as c_int,
                namedatalen: pg_sys::NAMEDATALEN as c_int,
                float8byval: pg_sys::USE_FLOAT8_BYVAL as c_int,
            };
            &MY_MAGIC
        }
    }
}
```

使用時只要一行:

```rust
use timescale_extension_utils::*;
pg_module!(1400);  // 對應 PostgreSQL 14
```

幾個重點:
- **`#[no_mangle]`**:Rust 預設會對函數名做 name mangling(產生像 `_ZN3foo3barE` 這種符號),加了這個屬性才會保留原名,讓 `dlsym("Pg_magic_func")` 找得到。
- **`pub extern "C"`**:強制使用 C ABI。
- **`&'static`**:回傳一個指向 static 區段的 pointer,不會被釋放。

pgrx 有對應的 `pg_module_magic!()` macro,功能完全一樣。

---

## 四、第三塊拼圖:V1 Calling Convention 的橋接

PostgreSQL 的 SQL function 在 C 層全部長這個樣子:

```c
Datum my_func(PG_FUNCTION_ARGS);   // 展開後簽名:Datum my_func(FunctionCallInfo fcinfo)
PG_FUNCTION_INFO_V1(my_func);      // 註冊 V1 metadata
```

兩個關鍵元素:
1. **每個 function 都必須有一個 `pg_finfo_xxx()` 函數**回傳 `Pg_finfo_record { api_version: 1 }`,告訴 PG 「我用 V1 慣例」。
2. **函數簽名固定**:接 `FunctionCallInfo`,回傳 `Datum`。參數從 `fcinfo->args[i]` 取出,return 值是個 `Datum`。

### Rust 端的對應:`pg_fn!` macro 展開

來看 `timescale-extension-utils-rs` 怎麼把它包成易用的 API。先看使用者程式碼(`example-extension/src/lib.rs`):

```rust
pg_fn! {
    pub fn add_integers(a: i32, b: i32) -> i32 {
        a + b
    }
}
```

從使用者角度看,這就是個普通的 Rust 函數。但展開後,macro 產生了**兩個** `extern "C"` 函數:

```rust
// 1) V1 metadata 函數
#[no_mangle]
pub extern "C" fn pg_finfo_add_integers() -> &'static pg_sys::Pg_finfo_record {
    const V1_API: pg_sys::Pg_finfo_record = pg_sys::Pg_finfo_record { api_version: 1 };
    &V1_API
}

// 2) PostgreSQL 真正會呼叫的 wrapper
#[no_mangle]
pub extern "C" fn add_integers(fcinfo: pg_sys::FunctionCallInfo) -> pg_sys::Datum {
    unsafe {
        in_context(CurrentMemoryContext, || {
            let fcinfo = &mut *fcinfo;
            // 把 catch_unwind、參數解析、回值轉換、錯誤處理全部封裝
            // 內部會解析參數、執行 user code、轉成 Datum 回傳
        })
    }
}
```

實際 macro 內部更複雜,我們稍後拆解。先看核心定義:

```rust
#[macro_export]
macro_rules! pg_fn {
    ($(pub fn $name:ident($($arg:ident : $typ:ty),*) $(-> $ret:ty)? $body:block)+) => {
        $(
        $crate::pg_finfo!($name);

        #[no_mangle]
        pub extern "C" fn $name(fcinfo: $crate::pg_sys::FunctionCallInfo)
            -> $crate::pg_sys::Datum
        {
            unsafe {
                $crate::palloc::in_context($crate::pg_sys::CurrentMemoryContext, || {
                    let fcinfo = &mut *fcinfo;
                    $crate::pg_fn_body!(fcinfo; $name( $($arg:$typ,)* ) $(-> $ret)? $body);
                })
            }
        })+
    };
}
```

這就是 pgrx 的 `#[pg_extern]` 巨集在做的事情:**把使用者寫的純 Rust 函數,包裝成一個符合 PostgreSQL V1 calling convention 的 `extern "C"` 函數**。

### 對應到 SQL 註冊

extension 的 `.sql` 檔案裡會這樣註冊:

```sql
CREATE OR REPLACE FUNCTION add_integers(integer, integer)
RETURNS integer
AS '$libdir/libexample_extension', 'add_integers'
LANGUAGE C IMMUTABLE STRICT;
```

- `LANGUAGE C` 告訴 PG「用 V1 慣例呼叫」。
- `'$libdir/libexample_extension', 'add_integers'` 指定 shared library 路徑和符號名 — 對應到我們 `#[no_mangle]` 出來的那個函數。

pgrx 更進一步,**自動產生這份 SQL**(透過 `cargo pgrx schema`),所以你不用手寫。

---

## 五、Datum 轉換:Rust 型別 ↔ PostgreSQL 型別

PostgreSQL 內部所有值都用 **`Datum`** 表示 — 它本質上是個 `uintptr_t`(64-bit 平台是 `uint64`):

- 小於等於 64 bit 的 by-value 型別(`int`, `bool`, `float`)直接塞進去。
- 大於 64 bit 的 by-reference 型別(`text`, `bytea`, `array`)塞 pointer 進去。

Rust 是靜態型別語言,要在 SQL 動態型別與 Rust 靜態型別之間搭橋,需要 **trait**。看 `timescale-extension-utils/src/datum.rs`:

```rust
pub trait FromDatum {
    fn from_datum(datum: Datum) -> Self;
}

pub trait ToDatum {
    fn to_datum(self) -> Datum;
}

// 處理 NULL:用 Option<T> 包起來
pub trait FromOptionalDatum: Sized {
    fn try_from_optional_datum(datum: Option<Datum>) -> Option<Self>;
}

pub trait ToOptionalDatum {
    fn to_optional_datum(self) -> Option<Datum>;
}
```

整數型別的實作就是直接 cast:

```rust
macro_rules! int_datum_convert {
    ($($typ:ty)*) => {
        $(
            impl FromDatum for $typ {
                fn from_datum(datum: Datum) -> Self { datum as Self }
            }
            impl ToDatum for $typ {
                fn to_datum(self) -> Datum { self as Datum }
            }
        )*
    };
}
int_datum_convert!(i8 u8 i16 u16 i32 u32 i64 u64 isize usize);
```

浮點數比較有趣 — 因為 `Datum` 是整數型別,所以 `f64` 必須先用 `to_bits()` / `from_bits()` 轉成位元表示再塞進去:

```rust
impl FromDatum for f64 {
    fn from_datum(datum: Datum) -> Self { f64::from_bits(datum as _) }
}
impl ToDatum for f64 {
    fn to_datum(self) -> Datum { self.to_bits() as _ }
}
```

最關鍵的設計:**`Option<T>` 對應 SQL `NULL`**。這是 Rust 型別系統最漂亮的應用之一 — C 開發者常常忘記檢查 `fcinfo->args[i].isnull` 而搞出 crash,Rust 把這件事直接拉到型別層強制處理:

```rust
// SQL 的 NULL 自動對應到 Rust 的 None
impl<T: FromDatum> FromOptionalDatum for Option<T> {
    fn from_optional_datum(datum: Option<Datum>) -> Self {
        datum.map(<T as FromDatum>::from_datum)
    }
}
```

用起來就是:

```rust
pg_fn! {
    // b 可以是 NULL — Rust 端就用 Option<i32>
    pub fn conditional_add(a: i32, b: Option<i32>) -> i32 {
        match b {
            Some(value) => a + value,
            None => a,
        }
    }
}
```

pgrx 的型別映射更完整,涵蓋 `&str` / `String`(text 型別)、`Vec<T>`(array)、composite type 等,但底層原理完全一樣。

---

## 六、最棘手的核心:Memory Model 與 Unwinding Model

這是 pgrx 工程深度最深的兩個議題。我曾在另一篇分析中詳細拆解 — 這裡聚焦在 timescale-extension-utils-rs 的實際實作。

### 6.1 Memory Model:palloc 與全域 allocator

PostgreSQL 不用 `malloc/free`,而是用 **MemoryContext**(階層式 arena allocator)。在 transaction、query、tuple 不同 scope 結束時整批 reset,即使中途 `ereport(ERROR)` 也能自動回收。

如果你在 Rust 端用標準 `Box<T>`、`Vec<T>`,它們呼叫的是系統 allocator,**Postgres 不知道這些記憶體存在**,error handler 不會幫你清,就會 leak。

timescale-extension-utils-rs 的解法很激進 — **直接替換 Rust 的 global allocator**:

```rust
#[global_allocator]
static mut GLOBAL: PallocAllocator = PallocAllocator;

struct PallocAllocator;

unsafe impl GlobalAlloc for PallocAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        MemoryContextAlloc(CurrentMemoryContext, layout.size() as _) as *mut _
    }

    unsafe fn dealloc(&self, ptr: *mut u8, _layout: Layout) {
        pfree(ptr as *mut _)
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        MemoryContextAllocZero(CurrentMemoryContext, layout.size() as _) as *mut _
    }

    unsafe fn realloc(&self, ptr: *mut u8, _layout: Layout, new_size: usize) -> *mut u8 {
        repalloc(ptr as *mut _, new_size as _) as *mut _
    }
}
```

這意味著 — **整個 Rust extension 內所有的 `Box::new`、`Vec::push`、`String::from` 底層全部都走 PostgreSQL 的 `palloc`**。一旦發生 ereport 觸發的 longjmp,PostgreSQL 自然會在 reset MemoryContext 時把這些記憶體一起清掉,不會 leak。

這段註解寫得很坦白:

> There is an uncomfortable mismatch between rust's memory allocation and postgres's; rust tries to clean memory by using stack-based destructors, while postgres does so using arenas. ... we use postgres's MemoryContexts to manage memory, even though this is not strictly speaking safe.

pgrx 的策略類似但更精緻 — 它預設用系統 allocator 配上一系列的 `PgBox<T>`、`PgMemoryContexts` 抽象,讓你顯式選擇哪些資料走 palloc、哪些走系統 allocator。

### 6.2 切換 MemoryContext 的 RAII 守衛

PostgreSQL 寫法是手動切換 + 手動恢復:

```c
MemoryContext old = MemoryContextSwitchTo(target_ctx);
// ... do work ...
MemoryContextSwitchTo(old);   // 如果中間 ereport 跳走就完蛋
```

timescale-extension-utils-rs 用 RAII 包成 `in_context`:

```rust
pub unsafe fn in_context<T, F>(context: MemoryContext, f: F) -> T
where F: FnOnce() -> T {
    let old = replace(&mut CurrentMemoryContext, context);
    let _guard = MemoryContextGuard(old);   // 在 scope 結束時自動切回
    f()
}

pub struct MemoryContextGuard(pub MemoryContext);
impl Drop for MemoryContextGuard {
    fn drop(&mut self) {
        unsafe { memory_context_switch_to(self.0); }
    }
}
```

這就是 pgrx 的 `PgMemoryContexts::CurrentMemoryContext.switch_to(|ctx| { ... })` 的本質。

### 6.3 `Pox<T>` — 不會在 Drop 時釋放的 Box

對於要 across function call 存活的資料(典型是 aggregate 的 state),你不希望 Rust 的 Drop 提前 free 掉。所以有了 `Pox<T>`:

```rust
pub struct Pox<T: ?Sized>(NonNull<T>, PhantomData<T>);

impl<T> Pox<T> {
    pub fn new(val: T) -> Self {
        unsafe {
            Pox(NonNull::new_unchecked(Box::into_raw(Box::new(val))), PhantomData)
        }
    }
    pub fn into_raw(self) -> *mut T { self.0.as_ptr() }
    // 注意:沒有 Drop 實作!
}
```

它擁有 `Box<T>` 的 API(`Deref`、`DerefMut`),但**沒有實作 `Drop`**。釋放時機交給 PostgreSQL 的 aggregate context 自動處理。pgrx 的 `PgBox<T, AllocatedByPostgres>` 是同個概念。

---

## 七、Unwinding Model:setjmp/longjmp 與 panic 的雙向轉換

這是整個 pgrx 機制裡最精巧、也最危險的一環。

**問題的本質**:
- **Rust** 用 stack unwinding 處理 panic(會跑所有 Drop)。
- **PostgreSQL** 用 `setjmp/longjmp` 處理錯誤(CPU register 瞬移,跳過中間所有 frame)。
- 兩種模型互相穿透就是 UB:Rust panic 穿過 C frame → 不可預測;PG longjmp 穿過 Rust frame → Drop 不跑、leak、deadlock。

### 7.1 入口處:catch_unwind 防 panic 外洩

看 `pg_fn_body!` macro 的核心:

```rust
let result: Result<Option<pg_sys::Datum>, _> = catch_unwind(AssertUnwindSafe(|| {
    // 解析參數
    let mut args = get_args(&*fc);
    let a = <i32 as FromOptionalDatum>::try_from_optional_datum(
        args.next().unwrap()
    ).unwrap();
    let b = <i32 as FromOptionalDatum>::try_from_optional_datum(
        args.next().unwrap()
    ).unwrap();

    // 執行使用者寫的 Rust code
    let res = (|| { a + b })();

    // 轉成 Datum
    <i32 as ToOptionalDatum>::to_optional_datum(res)
}));

match result {
    Ok(Some(datum)) => { fc.isnull = false; return datum; }
    Ok(None)        => { fc.isnull = true;  return 0; }
    Err(err)        => { fc.isnull = true;  handle_unwind(err) }
}
```

`catch_unwind` 攔截 Rust panic,**Rust 所有 frame 在這之前已經正確 unwind、所有 Drop 都跑完**,然後乾淨地呼叫 `handle_unwind` 把錯誤翻譯成 PostgreSQL 的 `ereport`。

```rust
pub fn handle_unwind(err: Box<dyn Any + Send + 'static>) -> ! {
    if let Some(err) = err.downcast_ref::<PGError>() {
        unsafe { err.re_throw() }   // 如果原本就是 PG error,直接重拋
    }
    if let Some(msg) = err.downcast_ref::<&'static str>() {
        crate::elog!(#unguarded Error, "internal panic: {}", msg);
    }
    // ...
    crate::elog!(#unguarded Error, "internal panic");
}
```

### 7.2 出口處:guard_pg 把 longjmp 轉成 panic

當 Rust 程式碼要呼叫 PostgreSQL 的 C 函數(例如 `palloc`、`SPI_execute`),這些 C 函數內部可能 `ereport(ERROR)` 觸發 `longjmp`。如果直接跳走,中間的 Rust frame 的 `Drop` 就不會跑。

`guard_pg` 是處理這個的關鍵函數:

```rust
pub unsafe fn guard_pg<R, F: FnOnce() -> R>(f: F) -> R {
    // 1) 保存原本的 exception stack
    let original_exception_stack = pg_sys::PG_exception_stack;
    let mut local_exception_stack: MaybeUninit<sigjmp_buf> = MaybeUninit::uninit();

    // 2) 安裝我們自己的 setjmp 點
    let jumped = pg_sys::sigsetjmp(
        local_exception_stack.as_mut_ptr() as *mut _,
        1,
    );

    if jumped != 0 {
        // 3) longjmp 跳回這裡 — C 那邊發生 ereport 了
        pg_sys::PG_exception_stack = original_exception_stack;
        compiler_fence(Ordering::SeqCst);

        // 4) 把 longjmp 「升級」成 Rust panic
        //    這樣 Rust 端的 catch_unwind 接手,沿途所有 Drop 正常執行
        panic!(PGError);
    }

    // 5) 安裝我們的 jmpbuf,執行 C 函數
    pg_sys::PG_exception_stack = local_exception_stack.as_mut_ptr() as *mut _;
    compiler_fence(Ordering::SeqCst);

    let result = f();

    compiler_fence(Ordering::SeqCst);
    pg_sys::PG_exception_stack = original_exception_stack;

    result
}
```

整段流程是個漂亮的迴圈:

```
[PG C frame]
   ↓ 呼叫
[Rust wrapper (pg_fn_body — catch_unwind 安裝)]
   ↓
[Rust 業務邏輯 (持有 Vec、MutexGuard...)]
   ↓ 呼叫
[guard_pg (sigsetjmp 安裝)]
   ↓
[PG C function (e.g., SPI_execute)]
   ↓ 內部
[ereport(ERROR) → siglongjmp]
   ↓ 跳回 sigsetjmp 點
[guard_pg 攔截,panic!(PGError)]
   ↓ Rust unwind 開始
[Rust 業務邏輯的 Vec, MutexGuard 被 Drop]
   ↓ 繼續 unwind
[Rust wrapper 的 catch_unwind 接住]
   ↓ handle_unwind → pg_re_throw()
[PG 的 transaction abort handler]
```

**兩種 unwinding model 互相轉換了兩次**,但每一段都用對應模型的「合法手段」運作,沒有任何一個 frame 被偷偷跳過。pgrx 用屬性 `#[pg_guard]` 自動把這層包到每個 `extern "C"` 函數上;timescale-extension-utils-rs 則靠手動 `guard_pg` 或包進 macro 裡。

---

## 八、Aggregate 函數:狀態跨呼叫的存活

Aggregate 函數(`SUM`、`AVG` 之類)在 PostgreSQL 內部是用兩個函數實作的:
- **State function** (`sfunc`):每處理一個 row 就呼叫一次,更新累積狀態。
- **Final function** (`finalfunc`):所有 row 處理完後呼叫,把狀態轉成最終結果。

狀態需要在多次呼叫之間活著 — 不能讓 Rust 的 Drop 提前釋放,但又要在 aggregate 結束時被回收。`timescale-extension-utils-rs` 用 `pg_agg!` macro + `Pox<T>` 解決:

```rust
#[derive(Debug)]
struct SumState {
    sum: f64,
    count: i64,
}

pg_agg! {
    pub fn avg_state(state: Option<Pox<SumState>>, value: f64) -> Option<Pox<SumState>> {
        match state {
            Some(mut s) => {
                s.sum += value;
                s.count += 1;
                Some(s)
            },
            None => Some(Pox::new(SumState { sum: value, count: 1 }))
        }
    }
}

pg_agg! {
    pub fn avg_final(state: Option<Pox<SumState>>) -> f64 {
        state.map(|s| if s.count > 0 { s.sum / s.count as f64 } else { 0.0 })
             .unwrap_or(0.0)
    }
}
```

macro 展開時做幾件特別的事:
1. 呼叫 `AggCheckCallContext(fcinfo, &mut agg_ctx)` 驗證確實是從 aggregate context 呼叫的,並取得 aggregate 的 MemoryContext。
2. 切換到 `agg_ctx` 再執行 user code — 確保所有分配都掛在 aggregate 的生命週期上。
3. State 用 `Pox<T>`(無 Drop)— 不會被 Rust 提前釋放,交給 aggregate context 自動清。

```rust
let mut agg_ctx: MemoryContext = std::ptr::null_mut();
if unsafe { AggCheckCallContext(fcinfo, &mut agg_ctx) == 0 } {
    elog!(Error, concat!("must call ", stringify!($name), " as an aggregate"))
}

unsafe {
    in_context(agg_ctx, || {
        // ... user body ...
    })
}
```

SQL 端註冊長這樣:

```sql
CREATE AGGREGATE custom_avg(double precision) (
    SFUNC = avg_state,
    STYPE = internal,
    FINALFUNC = avg_final
);

-- 使用:
SELECT custom_avg(score) FROM scores;
```

pgrx 也支援 aggregate(`#[pg_aggregate]` 屬性),原理完全一樣 — 只是 API 更簡潔。

---

## 九、把所有東西串起來:從 .rs 到 CREATE EXTENSION

到這裡為止的所有元件,組合起來就是一條完整的「Rust → PostgreSQL extension」流水線。我用 timescale-extension-utils-rs 的 example-extension 演示一次:

### 步驟 1:寫 Rust 程式碼

```rust
use timescale_extension_utils::*;

pg_module!(1400);   // 產生 Pg_magic_func()

pg_fn! {
    pub fn add_integers(a: i32, b: i32) -> i32 { a + b }
    pub fn square(x: i32) -> i32 { x * x }
    pub fn factorial(n: i32) -> i64 {
        if n <= 1 { 1 } else { (2..=n as i64).product() }
    }
}
```

### 步驟 2:編譯成 shared library

```bash
cd example-extension
cargo build --release
# 產出 target/release/libexample_extension.so
```

### 步驟 3:複製到 PostgreSQL 的 lib 目錄

```bash
PG_LIB_DIR=$(pg_config --pkglibdir)
sudo cp ../target/release/libexample_extension.so $PG_LIB_DIR/
```

### 步驟 4:在 SQL 註冊函數

```sql
CREATE OR REPLACE FUNCTION add_integers(integer, integer)
RETURNS integer
AS '$libdir/libexample_extension', 'add_integers'
LANGUAGE C IMMUTABLE STRICT;

CREATE OR REPLACE FUNCTION square(integer)
RETURNS integer
AS '$libdir/libexample_extension', 'square'
LANGUAGE C IMMUTABLE STRICT;

CREATE OR REPLACE FUNCTION factorial(integer)
RETURNS bigint
AS '$libdir/libexample_extension', 'factorial'
LANGUAGE C IMMUTABLE STRICT;
```

### 步驟 5:使用

```sql
SELECT add_integers(5, 3);   -- 8
SELECT square(4);            -- 16
SELECT factorial(10);        -- 3628800
```

### 首次呼叫的執行時序

```
1. psql 送出 SELECT add_integers(5, 3);
2. PG planner 查 pg_proc catalog,知道 add_integers 在
   $libdir/libexample_extension 的 add_integers 符號
3. 首次需要時 dlopen() 載入 libexample_extension.so
   ├─ 呼叫 Pg_magic_func() 驗證 ABI 版本
   ├─ dlsym("pg_finfo_add_integers") → 確認 API v1
   └─ dlsym("add_integers") → 拿到 function pointer
4. PG 建立 FunctionCallInfo,塞入 Datum(5) 與 Datum(3)
5. 透過 function pointer 呼叫 add_integers(fcinfo)
   ↓ macro 展開的 wrapper 接手
   ↓ in_context(CurrentMemoryContext, ...)
   ↓ catch_unwind 安裝
   ↓ FromDatum:Datum → i32(對 5 和 3)
   ↓ 執行純 Rust 的 a + b → 8
   ↓ ToDatum:i32 → Datum(8)
6. 回傳 Datum(8) 給 executor → 顯示給 user
```

---

## 十、初學者的學習建議路徑

如果你想入門 pgrx,我建議這個順序:

1. **了解 PostgreSQL extension 的 C 開發模式** — 讀官方文件 [Extending SQL](https://www.postgresql.org/docs/current/extend.html) 跟一個 C 寫的小 extension 的原始碼(例如 `contrib/citext`)。這會讓你知道 `Datum`、`PG_FUNCTION_INFO_V1`、`fmgr` 是什麼。

2. **看 timescale-extension-utils-rs 的原始碼** — 因為它小、純,沒有過多的抽象。讀完 `lib.rs` 那幾個 macro,你就理解了 pgrx 的精髓。

3. **跑 pgrx 的官方 quickstart**:
   ```bash
   cargo install cargo-pgrx
   cargo pgrx init
   cargo pgrx new myext
   cd myext
   cargo pgrx run
   ```
   你會在 5 分鐘內有一個能跑的 Rust extension。

4. **讀 pgrx 的 `examples/` 目錄** — 從 `aggregate.rs`、`bgworker.rs`、`triggers.rs` 看不同類型的 extension 怎麼寫。

5. **動手寫一個有意義的小專案** — 例如我之前做過的 [pg_where_guard](https://isdaniel.github.io/pg-where-guard-rust-postgresql-extension/)(攔截危險 SQL)、[redis_fdw](https://isdaniel.github.io/rust-pgrx-extension-fdw/)(把 Redis 當成 PG 表查)。實作的過程會逼你面對 Datum 轉換、MemoryContext、error handling 等真實問題。

---

## 小結

pgrx 之所以能讓 Rust 與 C 寫的 PostgreSQL 「完美合作」,核心是六個對接層:

1. **bindgen** → 把 C header 自動翻成 Rust FFI 宣告。
2. **`#[repr(C)]` + `extern "C"` + `#[no_mangle]`** → 滿足 C ABI 與符號可見性。
3. **`Pg_magic_func` Magic Block** → 通過 PG 載入時的 ABI 版本握手。
4. **V1 calling convention + `pg_finfo_xxx`** → 把 Rust 函數包成 PG 可呼叫的形式。
5. **`FromDatum` / `ToDatum` trait** → Rust 靜態型別 ↔ PG 動態 Datum 的雙向轉換,`Option<T>` 對應 NULL。
6. **Allocator 替換 + `catch_unwind` + `sigsetjmp` 雙向 guard** → 解決 memory model 與 unwinding model 的衝突,讓 Rust 的 RAII 與 PG 的 longjmp / MemoryContext 能各自正確運作。

透過 `timescale-extension-utils-rs` 這個輕量版本,你能用最少的程式碼看清楚每一層的設計動機。當你回頭去讀 pgrx 的 source code 時,會發現所有複雜的抽象都是這六層的延伸與強化。

Rust + pgrx 真正讓 PostgreSQL extension 開發從「危險的系統程式設計」變成「現代化的應用程式設計」 — 而背後的工程精華,值得每個資料庫人花時間理解。

---

## 參考資源

- [pgrx GitHub](https://github.com/pgcentralfoundation/pgrx) — 官方框架
- [timescale-extension-utils-rs (my fork)](https://github.com/isdaniel/timescale-extension-utils-rs) — 本文使用的迷你實作範例
- [PostgreSQL Extension Building Infrastructure](https://www.postgresql.org/docs/current/extend-pgxs.html)
- [PostgreSQL C Language Functions](https://www.postgresql.org/docs/current/xfunc-c.html)
- [bindgen User Guide](https://rust-lang.github.io/rust-bindgen/)
- [The Rustonomicon — FFI](https://doc.rust-lang.org/nomicon/ffi.html)
- 站內相關文章:
  - [Building a PostgreSQL FDW in Rust with pgrx](https://isdaniel.github.io/rust-pgrx-extension-fdw/)
  - [Building Safe PostgreSQL Extensions with Rust — pg_where_guard](https://isdaniel.github.io/pg-where-guard-rust-postgresql-extension/)
