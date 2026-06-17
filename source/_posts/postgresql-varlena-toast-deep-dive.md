---
title: 深入 PostgreSQL 變長度資料儲存：Varlena 與 TOAST 機制完整解析
date: 2026-06-16 14:30:00
tags: [PostgreSQL, Storage, TOAST, Varlena, SystemDesign, Performance-Tuning]
categories: [PostgreSQL, SystemDesign]
keywords: PostgreSQL,Varlena,TOAST,The-Oversized-Attribute-Storage-Technique,varattrib_1b,varattrib_4b,varattrib_1b_e,varatt_external,pglz,lz4,chunk,TOAST_TUPLE_THRESHOLD,TOAST_MAX_CHUNK_SIZE,storage-strategy,EXTENDED,EXTERNAL,MAIN,PLAIN,detoast,expanded-datum
description: "從 Varlena 三種 header 格式到 TOAST 切塊、compression、B-Tree 索引、storage strategy 與 detoast 流程,完整拆解 PostgreSQL 如何優雅地塞下 1GB 大欄位"
lang: zh-tw
---

## 前言

PostgreSQL 的單一資料頁面 (Page) 預設只有 **8 KB**,但實務上我們經常會塞進 JSON、長文字、圖片 base64、甚至幾十 MB 的 bytea。這些「比一個頁面還大」的欄位,為什麼可以正常運作?背後的功臣就是 **Varlena**(變長度資料結構)與 **TOAST**(The Oversized-Attribute Storage Technique)。

這篇文章會把整個機制從 header bit-layout、切塊、compression、索引,一路講到 detoast 的執行流程,並補上原始 summary 中沒提到、但實務上非常重要的觀念:**storage strategy**、**inline compression**、**TOAST threshold**、**expanded datum**,以及如何用 SQL 直接觀察 TOAST 表。

---

## 一、為什麼需要 Varlena?

C 語言的字串靠 `\0` 結尾,要知道長度就得 `strlen()` 一個一個 byte 數過去 — O(n) 而且資料中不能出現 `\0`。資料庫顯然不能這樣搞,所以 PostgreSQL 設計了一個通用的「變長度資料」結構,叫做 **Varlena (Variable-length Attribute)**。

所有變長度型別(`TEXT`、`VARCHAR`、`BYTEA`、`JSON`、`JSONB`、`NUMERIC`、`ARRAY` 等)在磁碟與記憶體中都是 Varlena。Varlena 的核心思想很簡單:**把長度資訊放在資料最前面**,讀取時看一眼 header 就知道整段資料有多長,O(1) 完成。

但只是「加個長度 header」還不夠 — 如果一個 30 byte 的小字串要硬塞 4 byte 的長度欄位,空間浪費太嚴重(超過 13%)。所以 PostgreSQL 為 Varlena 設計了**三種 header 格式**,根據資料大小自動切換,完全對開發者透明。

---

## 二、Varlena 的三種 Header 格式

定義位於 `src/include/varatt.h`,核心結構大致如下:

```c
typedef union {
    struct {                       /* Normal varlena (4-byte length) */
        uint32 va_header;
        char   va_data[FLEXIBLE_ARRAY_MEMBER];
    } va_4byte;
    struct {                       /* Compressed-in-line format */
        uint32 va_header;
        uint32 va_tcinfo;          /* raw size + compression method */
        char   va_data[FLEXIBLE_ARRAY_MEMBER];
    } va_compressed;
} varattrib_4b;

typedef struct {
    uint8  va_header;              /* 1-byte short header */
    char   va_data[FLEXIBLE_ARRAY_MEMBER];
} varattrib_1b;

typedef struct {                   /* TOASTed, has external storage */
    uint8  va_header;              /* Always 0x01 */
    uint8  va_tag;                 /* Type of external data */
    char   va_data[FLEXIBLE_ARRAY_MEMBER];
} varattrib_1b_e;
```

### 三種格式的判別

PostgreSQL 用 header 的**第一個 byte** 做 tag dispatch:

| 第一 byte 的最低 2 bits | 格式 | 用途 |
|---|---|---|
| `00` | `varattrib_4b` (uncompressed) | 大資料 (≥ 127 bytes、未 compressed) |
| `10` | `varattrib_4b` (compressed) | 大資料、行內 compressed |
| `xxxxxxx1` (最低 bit = 1, header ≠ 0x01) | `varattrib_1b` (short) | 小資料 (≤ 126 bytes) |
| `0x01` (整個 byte) | `varattrib_1b_e` (external) | 已搬到 TOAST 表 |

> 注意:實作上是檢查最低位 bit 來分流,short header 用 1 bit 當 tag,其餘 7 bits 存長度;4-byte header 用 2 bits 當 tag,30 bits 存長度。原始 summary 提到的「2 bits 身分證」即指此處。

### 1. `varattrib_1b` — 小資料的省空間設計

```
 7 bits 長度   |  1 bit tag
┌──────────────┬─────┐
│ length (≤126)│  1  │
└──────────────┴─────┘
 + data ...
```

- header 只有 **1 byte**,7 bits 可表示長度。
- 「最低 bit = 1」是其身分標記。
- 適合小於 127 bytes 的字串(實務上閥值是 **126 bytes**,因為 header 自己佔 1 byte)。

### 2. `varattrib_4b` — 一般大資料 (含 inline compression)

```
 30 bits 長度    | 2 bits tag
┌─────────────────┬─────┐
│  length (≤1GB)  │ 00  │   ← uncompressed
└─────────────────┴─────┘
┌─────────────────┬─────┐
│  length         │ 10  │   ← compressed (header 後面多 4 bytes 描述原始大小 + compression method)
└─────────────────┴─────┘
```

- header 4 bytes,可表示最大 **1 GB** (2^30,這也是 PostgreSQL 單一欄位的硬上限)。
- 如果是 compressed 格式,header 後面會多一個 4-byte `va_tcinfo`,其中:
  - 高 2 bits 是 **compression method** (`PGLZ` = 00 / `LZ4` = 01)。
  - 低 30 bits 是 **原始未 compressed 大小**(decompress 時需要)。

### 3. `varattrib_1b_e` — External pointer (TOAST pointer)

```
┌────────┬────────┬──────── ... ────────┐
│  0x01  │ va_tag │  pointer payload    │
└────────┴────────┴─────────────────────┘
```

第一 byte 固定 `0x01`(7 bits 全 0、最低 bit 為 1),是個特例標記:「我不是真資料,我是個指針」。第二 byte `va_tag` 表示後面 payload 的種類,常見有:

| va_tag | 結構 | 說明 |
|---|---|---|
| `VARTAG_ONDISK` (18) | `varatt_external` | 一般 on-disk TOAST 指針(最常見) |
| `VARTAG_INDIRECT` (1) | `varatt_indirect` | 記憶體中的轉址指針 |
| `VARTAG_EXPANDED_RO/RW` (2/3) | `varatt_expanded` | 展開後的可變物件(用於 array、JSONB 加速) |

---

## 三、TOAST 觸發條件與儲存策略

很多人以為「資料只要大就會 TOAST」,實際上 PostgreSQL 是看**整個 tuple 大小**,而且每個欄位的處理方式由「**storage strategy**」決定 — 這是 summary 中沒提到、但對效能調校極重要的觀念。

### 觸發閥值

```c
#define TOAST_TUPLE_THRESHOLD   2032   /* TOAST_TUPLE_TARGET, ~2KB */
#define TOAST_TUPLE_TARGET      2032
#define TOAST_MAX_CHUNK_SIZE    1996   /* 每塊約 2KB */
```

當一個 tuple 寫入時,只要它的大小 **超過 `TOAST_TUPLE_THRESHOLD` (約 2KB,即 page 的 1/4)**,PostgreSQL 就會挑出 tuple 中標記為可壓縮 / 可外宿的欄位,依以下順序處理直到 tuple 縮小到 target 以下:

1. 對最大的欄位嘗試 **壓縮**(若 storage 允許)。
2. 若還是太大,把最大的欄位整個 **搬出去 (external)**。
3. 重複 1–2 直到 tuple 達標。

### 四種 Storage Strategy

每個變長度欄位都有一個 storage 屬性,可用 `ALTER TABLE ... ALTER COLUMN ... SET STORAGE ...` 調整:

| Strategy | Compress | External | 典型用途 |
|---|---|---|---|
| `PLAIN` | No | No | 定長型別預設,不走 TOAST(資料必須能塞進 page) |
| `EXTENDED` | Yes | Yes | **變長度型別預設**,先壓縮,壓完仍太大才搬出去 |
| `EXTERNAL` | No | Yes | 不壓縮,直接外宿(犧牲空間換取 substring/length 速度) |
| `MAIN` | Yes | Prefer inline | 先壓縮、盡量留在 main table,壓完還是太大才外宿 |

實務情境:

- **大量 substring 操作**(如全文檢索片段)→ 設為 `EXTERNAL`,避免每次都要 decompress 整段。
- **整欄一次讀全部**(如 LOB)→ 預設 `EXTENDED` 最划算。
- **小到中型欄位但偶爾很大**(如 JSONB)→ 可考慮 `MAIN`,讓 hot data 留在 main table 減少 TOAST 查表。

```sql
-- 觀察與調整
SELECT attname, attstorage FROM pg_attribute
WHERE attrelid = 'my_table'::regclass AND attnum > 0;
-- attstorage: p = PLAIN, e = EXTERNAL, x = EXTENDED, m = MAIN

ALTER TABLE my_table ALTER COLUMN payload SET STORAGE EXTERNAL;
```

---

## 四、外宿指針的真實結構 (`varatt_external`)

當欄位真的被搬出去後,主表留下的不是 16 bytes,而是 **18 bytes** 的 `varatt_external` 結構(再加 2 bytes 的 `varattrib_1b_e` header,總共 20 bytes):

```c
typedef struct varatt_external {
    int32   va_rawsize;      /* 含 header 的原始大小 */
    uint32  va_extinfo;      /* 壓縮後大小 (30 bits) + compression method (2 bits) */
    Oid     va_valueid;      /* 此筆資料在 TOAST 表中的 ID */
    Oid     va_toastrelid;   /* 對應的 TOAST 表 OID */
} varatt_external;           /* sizeof = 18 bytes,實際存放時要對齊 */
```

> 注意:PostgreSQL 13 之後 `va_extinfo` 把壓縮演算法的 2 bits 塞進去 (因為新增了 LZ4),這也是原始 summary 寫「16 bytes」需要修正之處。

### 4 bytes (Oid) 的容量

`va_valueid` 是 4 bytes 的 `Oid` (unsigned 32 bit),理論名額是 2^32 ≈ **42 億**。配合 `chunk_seq` 的 4-byte 序號,單一欄位的理論上限遠超 1 GB — 但 PostgreSQL 在程式碼層硬性限制單一變長度欄位 ≤ 1 GB (來自 `varattrib_4b` 的 30-bit 長度欄位)。

---

## 五、TOAST 表長什麼樣?

每個有變長度欄位的 user table,PostgreSQL 會**自動**幫它建立一張對應的 TOAST 表,位於 `pg_toast` schema:

```sql
SELECT
    c.relname        AS main_table,
    t.relname        AS toast_table,
    pg_size_pretty(pg_relation_size(c.reltoastrelid)) AS toast_size,
    pg_size_pretty(pg_relation_size(c.oid))           AS main_size
FROM pg_class c
JOIN pg_class t ON t.oid = c.reltoastrelid
WHERE c.relname = 'my_table';
```

TOAST 表的 schema 永遠是這三欄:

```sql
CREATE TABLE pg_toast.pg_toast_<oid> (
    chunk_id   oid    NOT NULL,   -- 對應 va_valueid
    chunk_seq  int    NOT NULL,   -- 0, 1, 2, ... 切塊序號
    chunk_data bytea  NOT NULL    -- 約 2KB 的資料碎塊
);
CREATE UNIQUE INDEX pg_toast_<oid>_index
    ON pg_toast.pg_toast_<oid> (chunk_id, chunk_seq);
```

關鍵點:

- 每塊 `chunk_data` 大小是 `TOAST_MAX_CHUNK_SIZE ≈ 1996 bytes`,讓 4 塊剛好塞滿一個 8KB page (再扣掉 tuple header)。
- `(chunk_id, chunk_seq)` 上有 **unique B-Tree index**,這就是高速撈塊的關鍵。

---

## 六、Detoast 流程:資料是怎麼被讀回來的

當你執行 `SELECT payload FROM my_table WHERE id = 1`,且 payload 是 128 MB 的外宿資料,引擎做的事情大致是:

```
主表 tuple
┌──────────────────────────────────────────┐
│ id=1 │ ...其他欄位... │ varattrib_1b_e   │
└──────────────────────────────┬───────────┘
                               │ (va_toastrelid, va_valueid=9527)
                               ▼
                    pg_toast.pg_toast_xxxx
                    ┌──────────────────────────────┐
                    │ B-Tree (chunk_id, chunk_seq) │
                    └──────┬───────────────────────┘
                           │ Index Range Scan from (9527, 0)
                           ▼
┌──────────┬───────────┬────────────┐
│ chunk_id │ chunk_seq │ chunk_data │
├──────────┼───────────┼────────────┤
│   9527   │     0     │ [≈2KB]     │  ──┐
│   9527   │     1     │ [≈2KB]     │    │
│    ...   │    ...    │   ...      │    │ 依序串接
│   9527   │  65535    │ [≈2KB]     │    │
└──────────┴───────────┴────────────┘    ▼
                                    [拼接 + 解壓 pglz/lz4]
                                          │
                                          ▼
                                   還原 128MB 原始 bytes
```

### 三個關鍵設計

**1. B-Tree 一次定位**
拿著 `va_valueid` 在 unique index 上做 `=` 查詢,O(log n) 直達 `chunk_seq=0`。

**2. Index Range Scan,不是逐塊查**
找到第一塊後,沿著 B-Tree leaf 的 sibling pointer 連續往後讀(因為 `(chunk_id, chunk_seq)` 排序),直到 `chunk_id` 變化才停。底層通常是順序 I/O,不是隨機 I/O。

**3. Lazy detoast**
這點 summary 沒提:**只有真的要用到欄位內容時才會 detoast**。例如:

```sql
SELECT id FROM my_table WHERE id = 1;
-- 即使 payload 是 1GB,根本不會碰 TOAST 表
```

這就是為什麼「主表 SELECT * 很快」的真正原因 — 不只是因為指針小,而是因為**指針從不主動被展開**。Detoast 只發生在運算子真的需要 bytes 的那一刻 (例如 `length(payload)` 對未壓縮的 EXTERNAL 是免費的,但對 EXTENDED 就得 decompress)。

---

## 七、Inline Compression vs External

很多人混淆「壓縮」與「外宿」,其實它們是**兩個獨立的步驟**:

| 狀態 | header 是? | 在哪? | 觸發條件 |
|---|---|---|---|
| 純 inline | `varattrib_4b` (tag=00) | 主表 tuple | 小 tuple,完全不動 |
| Inline compressed | `varattrib_4b` (tag=10) | 主表 tuple | tuple 超過 threshold,壓完仍能塞下 |
| External uncompressed | `varattrib_1b_e` | TOAST 表 | storage = EXTERNAL,或 EXTENDED 但壓不下去 |
| External compressed | `varattrib_1b_e` | TOAST 表 | EXTENDED / MAIN,壓縮後仍超過 target |

注意:**External 的資料本身也可以是壓縮的**。`varatt_external` 裡的 `va_extinfo` 同時記錄壓縮後大小與演算法,讓 detoast 時知道要不要解壓。

### 壓縮演算法:pglz vs lz4

PostgreSQL 14 之後支援兩種演算法,可在 column 層級指定:

```sql
ALTER TABLE my_table ALTER COLUMN payload SET COMPRESSION lz4;
```

| 特性 | pglz (預設) | lz4 |
|---|---|---|
| 壓縮速度 | 較慢 | **約 4–5 倍快** |
| 解壓速度 | 較慢 | **約 10 倍快** |
| 壓縮率 | 略好 (≈ 5–10%) | 略差 |
| 需要編譯選項 | 內建 | `--with-lz4` |

對於寫多讀多、且 CPU 比 I/O 緊的場景,LZ4 幾乎是無腦選擇。只有極度在意壓縮率(冷資料、空間敏感)才該留著 pglz。

---

## 八、實用 SQL:觀察 TOAST 的真實樣貌

### 1. 看一張表的 TOAST 表佔用

```sql
SELECT
    relname,
    pg_size_pretty(pg_table_size(oid))   AS table_size,
    pg_size_pretty(pg_relation_size(oid)) AS heap_size,
    pg_size_pretty(pg_relation_size(reltoastrelid)) AS toast_size,
    pg_size_pretty(pg_indexes_size(oid)) AS index_size
FROM pg_class
WHERE relkind = 'r' AND reltoastrelid <> 0
ORDER BY pg_table_size(oid) DESC
LIMIT 10;
```

### 2. 直接戳 TOAST 表 (進階,需 superuser)

```sql
-- 看某個 chunk_id 被切成幾塊
SELECT chunk_id, count(*) AS chunks, sum(octet_length(chunk_data)) AS bytes
FROM pg_toast.pg_toast_16384
GROUP BY chunk_id
ORDER BY bytes DESC
LIMIT 5;
```

### 3. 判斷某筆資料有沒有被 TOAST

```sql
SELECT
    id,
    pg_column_size(payload)         AS stored_size,    -- 含 header、壓縮後
    octet_length(payload)           AS logical_size,   -- 邏輯長度
    pg_column_compression(payload)  AS compression     -- 'pglz' / 'lz4' / NULL
FROM my_table WHERE id = 1;
```

如果 `stored_size << logical_size`,代表有壓縮;如果 `stored_size` 只有十幾 bytes 但 `logical_size` 很大,就是外宿了。

---

## 九、Expanded Datum:summary 沒提到的記憶體加速機制

當你在 PL/pgSQL 裡反覆對一個 array 或 JSONB 做修改,每次都「decompress → 修改 → 重新壓縮」會很慘。於是 PostgreSQL 9.5 引入了 **expanded datum** (`VARTAG_EXPANDED_RW`):

- 第一次使用時,把資料攤平成一個記憶體中可直接操作的物件 (e.g., array 變成真的 C array)。
- 在 query 執行期間,所有修改都直接在這個展開物件上完成。
- 寫回磁碟時才重新序列化、壓縮、TOAST。

這對 array 的 `array_append`、JSONB 的 `jsonb_set` 等操作幫助巨大。Expanded datum 也是 `varattrib_1b_e` 的一種特例 — 你會看到一個「指針」,但它指向的不是 TOAST 表,而是記憶體中的展開物件。

---

## 十、設計哲學總結

PostgreSQL 的 Varlena / TOAST 設計可以用三句話概括:

1. **小資料零成本** — 短 header 讓 99% 的字串只多付 1 byte 的代價。
2. **大資料對 OLTP 友善** — 主表只留 20 bytes 指針,讓 `SELECT id FROM ...` 等不需要該欄位的查詢完全不受影響。
3. **Lazy & Composable** — 壓縮、外宿、展開三個正交機制,可根據 workload 用 storage strategy 與 compression method 自由組合。

當你下次看到 PostgreSQL 一張表的 size 是「1 MB 主表 + 800 MB TOAST + 100 MB index」時,你會知道那是正常的:它不是 bug,而是讓主表保持精瘦、把肥肉外掛出去的精密設計。

---

## 小結

| 元件 | 角色 |
|---|---|
| `varattrib_1b` | 小字串的省空間 header (1 byte) |
| `varattrib_4b` | 一般 / 壓縮資料的 header (4 bytes) |
| `varattrib_1b_e` | 外宿 / expanded 的 tag |
| `varatt_external` | 主表中的 18 byte TOAST 指針 |
| `pg_toast.*` | 切塊存放的 side table |
| `(chunk_id, chunk_seq)` B-Tree | 高速回組碎塊的索引 |
| Storage strategy | 控制是否壓縮 / 外宿 |
| Compression method | pglz vs lz4 的權衡 |
| Expanded datum | 記憶體層的加速 |

理解這套設計後,你不只能在出問題時看懂 `pg_column_size`、`pg_relation_size` 的真正含義,還能透過調整 storage 與 compression 為自己的 workload 榨出最後一滴效能。

---

## References

- PostgreSQL 原始碼 `src/include/varatt.h`、`src/backend/access/common/toast_internals.c`
- [PostgreSQL Docs — TOAST](https://www.postgresql.org/docs/current/storage-toast.html)
- [PostgreSQL Docs — Storage Page Layout](https://www.postgresql.org/docs/current/storage-page-layout.html)
- 相關文章: [深入 pgrx 機制:用 Rust 撰寫 PostgreSQL Extension 的底層原理與實戰](https://isdaniel.github.io/pgrx-postgresql-extension-mechanism-deep-dive/)
- 相關文章: [PostgreSQL WAL (Write-Ahead Logging) 機制介紹](https://isdaniel.github.io/postgresql-wal-introduce/)
