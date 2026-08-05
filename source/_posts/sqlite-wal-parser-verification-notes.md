---
title: 寫一個 SQLite WAL Parser 的完整驗證記錄：當官方文件是錯的
date: 2026-08-05 21:30:00
tags: [SQLite, WAL, Storage, SystemDesign, Database]
categories: [SQLite, SystemDesign]
keywords: SQLite,WAL,Write-Ahead-Logging,wal-parser,checksum,salt,checkpoint,starvation,nBackfill,mxFrame,frame,commit-boundary,no_std,fileformat2,walformat,libsqlite3-sys,stale-salt,PRAGMA-wal_checkpoint,SQLITE_FCNTL_RESERVE_BYTES,sector-padding,page-size
description: "把 SQLite -wal 檔正確解析成 frame 與 commit 邊界的驗證記錄，並揭露官方文件在 salt、checksum、checkpoint 時機等關鍵處的錯誤"
lang: zh-tw
---

## 前言

這篇是寫一個 SQLite WAL parser 時的完整驗證記錄。目標很單純：把 `-wal` 檔案正確解析成 frame 與 commit 邊界。

底下所有數字都是實際跑出來的，環境是 SQLite 3.37.2 / Linux x86-64，對照的原始碼是 `libsqlite3-sys` bundled 的 amalgamation。凡是跟文件衝突的地方，一律以 C 原始碼為準。

如果對 PostgreSQL 那一套 WAL 的先寫 log、後寫 dirty block 的模型不熟，可以先讀我之前寫的 [PostgreSQL WAL (Write-Ahead Logging) 機制](https://isdaniel.github.io/postgresql-wal-introduce/)，後面第八節會把兩者的設計取捨拿來對照。

---

## 一、WAL 的實體格式

先把地基打好。一個 WAL 檔就是 32 bytes 的檔頭，後面接一串固定大小的 frame。

```
offset 0        32                          568         1104
  +-------------+---------------------------+-----------+---
  | WAL header  | frame 1                   | frame 2   | ...
  |  32 bytes   | 24 header + 512 payload   |           |
  +-------------+---------------------------+-----------+---
```

### 檔頭 32 bytes，全部 big-endian

拿一個真實的檔案來看：

```
00: 37 7f 06 82  00 2d e2 18
08: 00 00 02 00  00 00 00 00
16: bf b5 a7 01  58 54 6f 3d
24: d6 72 b8 d2  cb bb e4 cf
```

| offset | 值 | 意義 |
|-------:|-----|------|
| 0 | `0x377f0682` | magic。最低位元決定 checksum 內容用哪種位元組序 |
| 4 | `3007000` | format version，自 2010 年凍結至今 |
| 8 | `512` | page size |
| 12 | `0` | checkpoint sequence |
| 16 | `0xbfb5a701` | salt-1 |
| 20 | `0x58546f3d` | salt-2 |
| 24 | `0xd672b8d2` | checksum-1，涵蓋前 24 bytes |
| 28 | `0xcbbbe4cf` | checksum-2 |

### Frame header 24 bytes

```
frame 1 @ offset 32:
  +00: 00 00 00 01  00 00 00 00    pgno=1, commit=0
  +08: bf b5 a7 01  58 54 6f 3d    salt，必須與檔頭逐位元組相同
  +16: 33 ea 45 86  d2 72 63 05    checksum
```

`db size after commit` 那個欄位是交易邊界的唯一訊號：`0` 表示交易還沒結束，非 `0` 表示這個 frame 提交了一筆交易，提交後資料庫共這麼多頁。

### Frame 自己不帶長度

這點值得單獨講，因為它決定了整個解析流程的順序。

frame header 是固定 24 bytes，六個欄位全部有名有姓，沒有一個是長度。整個檔案的切法是**推導**出來的：

1. 讀檔頭。它固定 32 bytes，可以無條件讀，這是唯一的立足點
2. 從 offset 8 取 `page_size`
3. `stride = 24 + page_size`
4. frame `i`（1-based）的 offset = `32 + (i-1) * stride`

換句話說，**整個 framing 由檔頭裡的一個 u32 決定**。用兩個不同 page size 的真實檔案對照：

```
page_size = 512：  offset 8 讀到 512     stride 536    檔案 1640 = 32 + 3×536
page_size = 4096： offset 8 讀到 4096    stride 4120   檔案 12392 = 32 + 3×4120
```

同樣的結構、同樣 3 個 frame，只因為那 4 個 bytes 不同，整個檔案的切法就變了。

這也是為什麼 page size 必須在任何東西用到它之前先驗證。一個被竄改的 page size 會讓其後每一個 offset 都算錯，而且錯得很安靜——你會在錯誤的位置讀到看似合理的位元組。所以驗證順序是規範性的：長度 → magic → version → page size → checksum。

順帶一提，`(len - 32) % stride == 0` 是個免費的自我檢查。有餘數就代表尾端有殘缺的 slot。

### Checksum 演算法

```
s0, s1 = seed
每 8 bytes 取兩個 u32 (x, y)：
    s0 = s0 + x + s1
    s1 = s1 + y + s0        （皆為 wrapping）
```

seed 與涵蓋範圍：

| 對象 | seed | 涵蓋 |
|------|------|------|
| WAL header | `(0, 0)` | 檔頭前 **24** bytes |
| Frame 1 | 檔頭的 checksum | frame header 前 **8** bytes + 整個 payload |
| Frame k | frame k−1 的 checksum | 同上 |

`magic & 1` 決定被 checksum 的**內容**如何解讀成 32-bit word。但存進檔案的 checksum **值**永遠是 big-endian，跟其他欄位一樣。這兩件事很容易混為一談，而且混淆之後寫出來的程式會在小端序機器上「剛好能動」。

實際驗證一條 chain：

```
frame   seed（來源）                   算出              檔案裡存的
  1     (c0780944, 3f17b724) header    (de3ecc9d, ...)   同左  OK
  2     (de3ecc9d, 5d2c46e0) frame 1   (68b39233, ...)   同左  OK
  3     (68b39233, 281b0f4c) frame 2   (161fdd33, ...)   同左  OK
  4     (161fdd33, a303ab26) frame 3   (f7d14d86, ...)   同左  OK
```

這裡有第一個文件錯誤。`wal.c` 中 `walDecodeFrame` 上方的註解寫「the first **16** bytes of this frame-header」，但同一個檔案的第 985 行寫的是：

```c
walChecksumBytes(nativeCksum, aFrame, 8, aCksum, aCksum);
```

`nByte = 8`。註解錯了，程式碼是對的。`fileformat2.html` §4.2 這次反而站在正確的一邊。

---

## 二、最重要的一件事：檔案大小不等於有效 frame 數

這是整個專案的核心風險，也是我花最多時間驗證的一點。

SQLite 的 WAL 是**原地重用**的。checkpoint 把內容 backfill 進主資料庫之後，下一次寫入會 reset WAL 並從 frame 1 重新開始寫——但上一代的 frame 位元組還躺在檔案裡，唯一的區別只有 salt 對不上。

實測：寫 5 個 frame，跑 `PRAGMA wal_checkpoint(PASSIVE)`，再寫 1 筆。

```
檔案仍是 20632 bytes（看起來有 5 個 frame slot），但：

  slot 1: salt=0x2fe926a3/0xf3e4c752 -> VALID
  slot 2: salt=0x2fe926a2/0x834e83a0 -> STALE-SALT   上一代殘留
  >>> 有效 frame 數 = 1，檔案卻暗示 5
```

用 `(len - 32) / stride` 算 frame 數的實作，會把上一代的資料當成新交易複製出去。

### 完整走一遍 INSERT → UPDATE → CHECKPOINT → INSERT

把每一步的檔案狀態攤開來看，會比講抽象規則清楚得多。用 `page_size=512`，關掉 autocheckpoint。

**步驟 0，`CREATE TABLE`：**

```
-wal  1104 bytes = 32 + 2×536   2 個 frame
.db    512 bytes                主檔還是空的

 slot  pgno  commit  內容
   1    1      -     SQLite format, CREATE TABLE users...
   2    2      2     (空的 table 根頁)
```

主檔一個 byte 都沒動。資料現在只存在於 WAL 裡，但 `SELECT` 讀得到，因為 SQLite 讀取時會先查 WAL。

**步驟 1，`INSERT alice`：**

```
-wal  1640 bytes (+536)    3 個 frame
.db    512 bytes           還是沒動

   3    2      2     ['alice']     page 2 的新版本
```

page 2 現在在 WAL 裡有兩份。SQLite 沒有回頭去改 slot 2，而是在後面加了 slot 3。

**步驟 2，`UPDATE alice → ALICE_UPDATED`：**

```
-wal  2176 bytes (+536)    4 個 frame
.db    512 bytes

   2    2      2     (空)                 第 1 版
   3    2      2     ['alice']            第 2 版
   4    2      2     ['ALICE_UPDATED']    第 3 版
```

這是最關鍵的一步。UPDATE 沒有修改 slot 3 裡的 alice，它把**整個 page 2 的新樣子**寫成一個新 frame。page 2 現在有三個版本同時躺在檔案裡。

這也解釋了為什麼 WAL 會長得很快：你在一個大頁上改一個 byte，WAL 就多 512 bytes（或 4096）。WAL 記的是頁，不是列。

**步驟 3，`CHECKPOINT(PASSIVE)`，回傳 `(0, 4, 4)`：**

```
-wal  2176 bytes  完全沒變。長度、salt、ckptseq、4 個 frame 全都還在且全都有效
.db   1024 bytes  從 512 變成 1024
```

checkpoint 做的唯一一件事是把 WAL 裡每個頁的最新版本抄進 `.db`。**WAL 一個 byte 都沒有被動。** 沒有清空、沒有截短、salt 沒變。

這是最多人搞錯的地方。checkpoint 不是「清 WAL」，是「同步到主檔」。

**步驟 4，`INSERT bob`，這一步才 reset：**

```
-wal  2176 bytes  長度還是一樣，沒有截短
salt  (0x8f3d1cd5, ...) → (0x8f3d1cd6, ...)
ckptseq  0 → 1

 slot  pgno  commit  狀態          內容
   1    2      2     有效          ['bob', 'ALICE_UPDATED']   被覆寫
   2    2      2     上一代殘留     (空)
   3    2      2     （已停）       ['alice']
   4    2      2     （已停）       ['ALICE_UPDATED']
```

### 這個坑咬人的方式

假設你在步驟 4 的時間點寫一個備份工具去讀這個檔案。你算 `(2176 - 32) / 536 = 4`，拿到 4 個 frame，依序套用到 page 2：

```
套用 slot 1 → page 2 = {bob, ALICE_UPDATED}
套用 slot 2 → page 2 = {}
套用 slot 3 → page 2 = {alice}
套用 slot 4 → page 2 = {ALICE_UPDATED}     最終結果
```

備份出來的資料庫：有 ALICE_UPDATED，沒有 bob。

bob 是剛剛才寫進去的，不見了。而 slot 3 的 `alice` 是兩代以前、已經被 UPDATE 掉、又已經被 checkpoint 進主檔的資料，它從墳墓裡爬出來影響了結果。

沒有錯誤訊息、沒有 panic，`PRAGMA integrity_check` 也會回 `ok`，因為產出的確實是一個結構合法的資料庫。

---

## 三、salt 到底什麼時候變

這是文件錯得最嚴重的地方。

`fileformat2.html` §4.1 的表格寫：

> Salt-1: random integer **incremented with each checkpoint**

但同一頁後面又寫：

> Upon WAL **reset**, the WAL header salt-1 value is incremented and the salt-2 value is randomized.

**後者才對。** 實測各個 checkpoint 模式：

| 動作 | 檔案大小 | ckptseq | salt-1 |
|------|---------:|--------:|--------|
| 寫 5 frames | 20632 | 0 | `0x752f09f4` |
| `PASSIVE` | 20632 | 0 | `0x752f09f4`（沒變） |
| 再寫 1 筆 | 20632 | **1** | `0x752f09f5`（這時才變） |
| `RESTART` | 20632 | 1 | `0x752f09f5` |
| 再寫 1 筆 | 20632 | **2** | `0x752f09f6` |
| `TRUNCATE` | **0** | n/a | n/a |
| 再寫 1 筆 | 4152 | **3** | `0x752f09f7` |

`PASSIVE`、`FULL`、`RESTART` 都不改 salt。只有 `TRUNCATE` 是例外——它在 checkpoint 內部就呼叫 `walRestartHdr()`，再把檔案截為 0。

### 真正改 salt 的路徑

```
walRestartHdr()  ←──┬── walRestartLog()  ←── sqlite3WalFrames()   寫入路徑
                    │
                    └── walCheckpoint()  ← 只有 TRUNCATE 模式
```

`walRestartLog()` 在 `sqlite3WalFrames()` 開頭被呼叫，也就是每次要寫 frame 之前。它的完整條件：

```c
static int walRestartLog(Wal *pWal){
  if( pWal->readLock==0 ){                                   // 條件 1
    volatile WalCkptInfo *pInfo = walCkptInfo(pWal);
    assert( pInfo->nBackfill==pWal->hdr.mxFrame );           // 這只是 assert
    if( pInfo->nBackfill>0 ){                                // 條件 2
      u32 salt1;
      sqlite3_randomness(4, &salt1);
      rc = walLockExclusive(pWal, WAL_READ_LOCK(1), WAL_NREADER-1);  // 條件 3
      if( rc==SQLITE_OK ){
        walRestartHdr(pWal, salt1);     // 這裡才改 salt
        walUnlockExclusive(...);
      }else if( rc!=SQLITE_BUSY ){
        return rc;
      }
      // BUSY → 什麼都不做，靜默跳過
    }
```

注意 `nBackfill == mxFrame` 是個 `assert`，不是 `if`。真正被測試的是 `readLock == 0`。

**條件 1** 的語意要往回追一層。reader 什麼時候會拿到 read slot 0？`walTryBeginRead` 第 69312 行：

```c
if( !useWal && AtomicLoad(&pInfo->nBackfill)==pWal->hdr.mxFrame ){
    /* The WAL has been completely backfilled (or it is empty).
    ** and can be safely ignored. */
    rc = walLockShared(pWal, WAL_READ_LOCK(0));
    ...
    pWal->readLock = 0;
```

slot 0 的語意（原始碼註解 66562）：

> Readers holding WAL_READ_LOCK(0) always **ignore the entire WAL and read all content directly from the database**.

所以 `readLock == 0` 的意思是「我開始交易時 WAL 已經全部進主檔了，我根本不看 WAL」。既然如此，寫入時就可以安全地從頭覆寫。那個 assert 是**推論**出來的，不是直接測試的。

**條件 3** 拿不到就回 `SQLITE_BUSY`，而程式碼靜默跳過 restart——寫入照常進行，只是變成 append 而不是覆寫。這是一道 race 防護。

### salt 不是單調 counter

在同一個 WAL 檔延續期間，salt-1 確實是遞增 1。但**跨 WAL 檔就不是**。

`wal.c:4096`：

```c
if( pWal->nCkpt==0 ) sqlite3_randomness(8, pWal->hdr.aSalt);
```

`nCkpt == 0` 時**兩個 salt 都重新隨機**，ckptseq 寫 0。實測連續三代 open → write → close（每次乾淨關閉，SQLite 會刪掉 `-wal`）：

```
gen0: salt1=0xab6fca0c salt2=0x2d2d4733 ckptseq=0
gen1: salt1=0x85f533be salt2=0xa8174adb ckptseq=0  delta=0xda856992
gen2: salt1=0x0220132f salt2=0xe197c9da ckptseq=0  delta=0x7c2adf71
```

delta 是亂數，不是 +1。ckptseq 全是 0。

所以偵測「複製位置失效」的唯一安全方法是**相等性測試**，而且要比對**兩個** salt：

```
(salt1, salt2) != 上次記錄的 (salt1, salt2)   ⇒ 換代
```

任何算術或單調性假設都是錯的。

### salt 為什麼存在

`wal.c:95-98` 講得很清楚，而且理由跟我原本想的不同：

```c
** After each checkpoint, the salt-1 value is incremented and the salt-2
** value is randomized.  This prevents old and new frames in the WAL from
** being considered valid at the same time and being checkpointing together
** following a crash.
```

「following a crash」才是重點。

想像沒有 salt：WAL 有 100 個 frame，checkpoint 完，新的寫入從 frame 1 開始覆蓋，寫到 frame 30 時斷電。重開機後 frame 1~30 是新的、frame 31~100 是舊的，而且它們的 checksum chain 各自都是自洽的。

recovery 要怎麼知道該停在 30？checksum chain 在 30→31 的交界會斷，但那跟「frame 31 是個 torn write」長得一模一樣。更糟的是如果新舊資料剛好接得上，它會把兩個世代的 frame 混在一起 checkpoint 進主檔。

salt 讓這件事變成不可能。

---

## 四、自動 checkpoint 的真實時機

文件說：「automatically checkpoint whenever a COMMIT occurs that causes the WAL file to be 1000 pages or more in size」。這句話對，但程式碼講得更多。

### 完整呼叫鏈

**① `walFrames()`，只有 commit 才記錄：**

```c
if( isCommit ){
    walIndexWriteHdr(pWal);
    pWal->iCallback = iFrame;     // commit 後 WAL 裡的 frame 總數
}
```

交易中間寫的 frame 不會設 `iCallback`。

**② `doWalCallbacks()`，在交易提交完成之後：**

```c
/*
** This function is called after a transaction has been committed. It
** invokes callbacks registered with sqlite3_wal_hook() as required.
*/
static int doWalCallbacks(sqlite3 *db){
  for(i=0; i<db->nDb; i++){
      nEntry = sqlite3PagerWalCallback(sqlite3BtreePager(pBt));
      if( nEntry>0 && db->xWalCallback && rc==SQLITE_OK ){
          rc = db->xWalCallback(db->pWalArg, db, db->aDb[i].zDbSName, nEntry);
      }
  }
}
```

**③ `sqlite3WalCallback()`，讀取後歸零：**

```c
ret = pWal->iCallback;
pWal->iCallback = 0;
```

每次 commit 只觸發一次。

**④ `sqlite3WalDefaultHook()`，真正的判斷：**

```c
if( nFrame >= SQLITE_PTR_TO_INT(pClientData) ){
    sqlite3BeginBenignMalloc();
    sqlite3_wal_checkpoint(db, zDb);
    sqlite3EndBenignMalloc();
}
```

### 實測

用預設值（`page_size=512`，不動任何 pragma），逐筆 INSERT：

```
 第幾筆   -wal bytes   slot數  有效frame  ckptseq   salt-1       .db bytes
--------------------------------------------------------------------------
     1        1640        3        3        0    0x4f233a94       512
     2        2176        4        4        0    0x4f233a94       512
   773      536032     1000     1000        0    0x4f233a94     58880
   774      536032     1000        1        1    0x4f233a95     58880
   775      536032     1000        2        1    0x4f233a95     58880
```

`536032 = 32 + 1000 × 536`，剛好 1000 個 frame，門檻分毫不差。

第 773 筆 checkpoint 觸發，`.db` 從 512 跳到 58880，但 `-wal` 完全沒變。第 774 筆才 reset。之後檔案永遠停在 536032 bytes。

換算成預設的 `page_size=4096`，門檻是 `32 + 1000 × 4120 ≈ 4.1 MB`。

### 程式碼講出來、文件沒說的

**autocheckpoint 根本不是內建機制，它就是一個 WAL hook。**

```c
SQLITE_API int sqlite3_wal_autocheckpoint(sqlite3 *db, int nFrame){
  if( nFrame>0 ){
    sqlite3_wal_hook(db, sqlite3WalDefaultHook, SQLITE_INT_TO_PTR(nFrame));
  }else{
    sqlite3_wal_hook(db, 0, 0);
  }
}
```

註解明說：「registering a callback using `sqlite3_wal_hook()` **disables the automatic checkpoint mechanism** configured by this function」。

這對做備份工具的人是陷阱。你只要自己註冊一個 `sqlite3_wal_hook`（例如想在 commit 時被通知），就等於把 autocheckpoint 整個關掉了。兩者共用同一個 slot。

**checkpoint 的回傳值被完全丟棄。**

```c
sqlite3_wal_checkpoint(db, zDb);      // 回傳值沒有被接
```

外面再包一層 `BeginBenignMalloc` / `EndBenignMalloc`，連 checkpoint 過程中的記憶體配置失敗都標記為良性。autocheckpoint 是 best-effort，失敗是設計的一部分。這解釋了後面 starvation 為什麼完全沒有錯誤訊息。

**巨大交易完全不會被中途 checkpoint。** 因為 `iCallback` 只在 `isCommit` 時設定。一個寫 5000 頁的交易，從頭到尾不會觸發任何 checkpoint。

### 完整的自動 checkpoint 時機

只有兩個：

| 時機 | 條件 | 模式 | 失敗會怎樣 |
|------|------|------|-----------|
| 每次 COMMIT 之後 | commit 後 frame 總數 `>= 1000` | PASSIVE | 靜默忽略 |
| 最後一個連線關閉 | 無條件 | PASSIVE | 失敗則 `-wal` 留著 |

沒有計時器、沒有背景執行緒。關閉連線那條路是唯一會讓 `-wal` 消失的自動路徑——它會 checkpoint 然後刪掉 `-wal` 與 `-shm`，除非設了 `SQLITE_FCNTL_PERSIST_WAL`。

---

## 五、Checkpoint starvation

只要有連線持有長時間讀取交易，就會進入這個狀態。這是我花最多力氣量測的部分。

### 現象

要複現這個狀態，有個前提得先講：**光下 `BEGIN` 是沒用的**。SQLite 的 `BEGIN` 是 deferred，read mark 要等**第一次實際讀取**才建立。必須 `BEGIN` 之後再跑一個 `SELECT`，那個交易才真的卡住 checkpoint。

開一個這樣的長時間讀取交易，然後持續寫入，autocheckpoint 用預設值：

```
 寫入筆數   -wal bytes   有效frame   ckptseq   salt-1        .db bytes
--------------------------------------------------------------------------
     500       346824        647        0    0x94ddde1d         512
    1000       697904       1302        0    0x94ddde1d         512
    2000      1407568       2626        0    0x94ddde1d         512
    4000      2829040       5278        0    0x94ddde1d         512
```

WAL 無界成長到 2.8 MB，salt 從頭到尾沒變，ckptseq 還是 0，`.db` 停在 512 bytes。

手動下 PASSIVE checkpoint：

```
PRAGMA wal_checkpoint(PASSIVE)  →  (0, 5278, 3)
```

`busy = 0`。SQLite 認為這次「成功」了。

### autocheckpoint 到底有沒有在跑

這裡我犯了一個錯誤，值得記下來。我一開始寫「autocheckpoint 每次 commit 都有觸發，只是 backfill 不動」——但那是從程式碼推的，不是量測的。觀察到的現象（WAL 成長、salt 不變、`.db` 不變）同時符合「有跑但無效」和「根本沒跑」兩種解釋。

要分辨，得找一個只有「有跑」才會動的指標。`-shm` 的 `nBackfill` 就是。

A/B 測試，兩組除了 `wal_autocheckpoint` 之外完全一樣：

```
A 組（autocheckpoint = 1000）：
   寫 3000 筆後：mxFrame=3958  nBackfill=3     -wal=2,121,520
B 組（autocheckpoint = 0）：
   寫 3000 筆後：mxFrame=3958  nBackfill=0     -wal=2,121,520
```

兩組 WAL 逐位元組相同，只有 `nBackfill` 不同。checkpoint 確實跑了，並把 backfill 推到 reader 的 read mark 就停住。

但這只證明「跑過」，不證明「持續跑」。再做一個測試：讓 read mark 分階段往前移。

```
 階段   reader 建立時 mxFrame   寫 400 筆後 nBackfill   .db bytes
   1              3                     0                  512
   2            518                   518               30,208
   3           1038                  1038               60,416
   4           1564                  1564               90,112
```

`nBackfill` 每一階段都精確追上當時 reader 的位置。只跑一次的話會凍在 518。

階段 1 的 `nBackfill = 0` 也是對的——那時 WAL 還沒到 1000 frame 門檻。

### 為什麼 salt 不變

真正的原因是 `walRestartLog` 的條件 1 失敗：

```
readLock == 0  需要  nBackfill == mxFrame
                     3        ≠  5278
→ 沒有任何 reader 能拿到 slot 0
→ 沒有任何 writer 的 readLock 會是 0
→ walRestartHdr() 永遠不被呼叫
```

所以精確的說法是「`nBackfill` 追不上 `mxFrame`」，不是「backfill 完全沒動」。

### 為什麼 `.db` 大小也不變

這個比較繞。`nBackfill = 3` 代表 frame 1~3 已被 backfill，而那三個 frame 是 page 1、2、2。按理說寫入 page 2 應該讓 `.db` 從 1 頁變成 2 頁。

實際沒有。原因在 `walCheckpoint` 的複製迴圈（第 68492 行）：

```c
if( iFrame<=nBackfill || iFrame>mxSafeFrame || iDbpage>mxPage ){
    continue;
}
```

iterator 對每個 page 回報的是**整個 WAL 裡最新的那個 frame**。page 2 的最新 frame 是 1966，`1966 > mxSafeFrame(3)`，被跳過。只有 page 1（最新 frame = 1）被真的複製，而 page 1 本來就存在，檔案不需要成長。

`nBackfill` 卻仍被設成 `mxSafeFrame = 3`。

### 卡法有兩種

比較兩次實驗：

| reader 建立時機 | reader 佔的 slot | `nBackfill` 停在 |
|---------------|-----------------|-----------------|
| WAL **沒**完全 backfill 時 | slot 1~4 | reader 的 mark |
| WAL **已**完全 backfill 時 | **slot 0** | **0**，完全不動 |

原因在 `walCheckpoint` 第 68451 行——backfill 的前置條件是拿到 slot 0 的**獨佔**鎖：

```c
if( pIter
 && (rc = walBusyLock(pWal,xBusy,pBusyArg,WAL_READ_LOCK(0),1))==SQLITE_OK
){
```

而 reader 在 `nBackfill == mxFrame` 時會拿 slot 0 的**共享**鎖。於是：

- reader 佔 **slot 0**：checkpointer 拿不到獨佔鎖，backfill 完全癱瘓
- reader 佔 **slot 1~4**：backfill 可以推到那個 reader 的 mark

諷刺的是，在資料庫最健康的時候（WAL 剛清空）開一個長交易，反而會造成最嚴重的癱瘓。

### 怎麼診斷

兩個可靠的方法，兩個會騙你的。

**可靠一：`PRAGMA wal_checkpoint(PASSIVE)` 的回傳值。**

從原始碼確認（第 70577-70579 行）：

```c
if( pnLog ) *pnLog = (int)pWal->hdr.mxFrame;
if( pnCkpt ) *pnCkpt = (int)(walCkptInfo(pWal)->nBackfill);
```

第三個數字是**累計水位**，不是「這次搬了幾個」。判讀：

| 條件 | 意義 |
|------|------|
| `busy == 1` | 連 checkpoint 鎖都拿不到 |
| `nLog == nCkpt` | 完全追上，下次寫入就會 reset |
| `nLog > nCkpt` | 卡住，落後 `nLog - nCkpt` 個 frame |

**可靠二：直接讀 `-shm`，無副作用。**

```python
b = open(path + '-shm', 'rb').read(136)
mxFrame   = struct.unpack('=I', b[16:20])[0]
nBackfill = struct.unpack('=I', b[96:100])[0]
```

注意是 native byte order，不是 big-endian。`-shm` 是機器位元序的。

**不可靠一：`.db` 檔案大小。** 實測「健康」和「卡死」兩個狀態都是 23,040 bytes，完全看不出差別。

**不可靠二：salt / ckptseq。** 更糟：

```
健康:  salt-1=0x473f6df2  ckptseq=0
卡死:  salt-1=0x473f6df3  ckptseq=1      salt 變了
```

salt 在卡死狀態下反而變了，因為那個變化是前一個健康階段留下的，跟當下完全無關。拿 salt 當「checkpoint 有沒有在運作」的指標，這裡就會誤判成健康。

還有一個限制值得說清楚：從 `-shm` 的 `aReadMark[]` **值**是看不出誰卡住的。checkpointer 自己會去改 `aReadMark[1]`（第 68434 行），所以看到某個 slot 有值，不代表有 reader 坐在上面。值和鎖是兩回事。要真的找出兇手，得去試著取那些鎖。

---

## 六、其他容易錯的細節

### Page size 有三種編碼

```
page_size    WAL檔頭(u32)   DB檔頭(u16)   -shm szPage(u16)
512          512            512           512
4096         4096           4096          4096
65536        65536          1             1
```

WAL 檔頭照實存 65536。DB 檔頭因為只有 2 bytes，用 `1` 當特例。 第三種最陰險，它不是特例值而是位元打包：

```c
編碼: (u16)((szPage & 0xff00) | (szPage >> 16))       wal.c:1519, :4249
解碼: (szPage & 0xfe00) + ((szPage & 0x0001) << 16)   wal.c:2132, :2633
```

`wal.c:317` 的註解說「szPage 可以是 512 到 32768 之間的任何 2 的冪」，講的正是存進去的形式。

### Sector padding，以及為什麼 API 叫 commits() 而不是 transactions()

`walFrames()` 只在兩個條件同時成立時寫 padding frame：

1. `isCommit && WAL_SYNC_FLAGS(sync_flags) != 0`，即 `synchronous=FULL`
2. `pWal->padToSectorBoundary`，只有主 DB 檔**不**帶 `SQLITE_IOCAP_POWERSAFE_OVERWRITE` 時才為 1

unix VFS 的 psow 預設為 1，所以 Linux 上預設永遠不會 padding。這也是我一開始試不出來的原因——得用 URI `file:test.db?psow=0` 才行。

實測一個 `CREATE TABLE`（page_size 512，synchronous=FULL）：

```
psow=1: 2 frames → 1 個 commit group
psow=0: 8 frames → 7 個 commit group
```

padding frame 複製前一個 frame 的 pgno、payload、salt **以及 commit 標記**，只有 checksum 不同（chain 有前進）。所以它是完全合法的 commit frame，四項有效性判定全過。

結論：「這個 WAL 裡有幾個 SQL 交易」不是可從位元組回復的量。可以回復的是 commit 邊界。所以 API 應該叫 `commits()`，而下游去重的 key 必須是 `(page_no, payload)`，不能比對 raw frame bytes。

### Reserved bytes 不影響 frame 大小

`pagerWalFrames()` 傳給 WAL 層的是 `pPager->pageSize`，不是 `usableSize`。所以 frame payload 恆等於 page_size。

驗證這件事的時候踩了一個坑：**SQLite 沒有 `PRAGMA reserve_bytes`**。這個 pragma 不存在於任何版本，而 SQLite 會靜默忽略無法識別的 pragma——這才是它「看起來像 no-op」的原因。正確的 API 是 `sqlite3_file_control` 配 `SQLITE_FCNTL_RESERVE_BYTES`，opcode **38**。

用對之後實測：設 reserved=32、page_size=4096，DB header offset 20 讀到 32，而 WAL 長度仍是 12392 bytes，不管有沒有 reserved 都一樣。

---

## 七、為什麼 SQLite 要這樣設計

被問到一個好問題：為什麼不像 PostgreSQL 一直往前寫，而要回頭重用同一個檔案還得靠 salt 分辨？

先修正一個前提：**PostgreSQL 也回收 WAL 檔案。**

> When old WAL segment files are no longer needed, they are removed or **recycled (that is, renamed to become future segments in the numbered sequence)**.

所以差別不是「一直寫 vs 重用」，而是**重用的粒度與可辨識性**。

| | PostgreSQL | SQLite |
|---|---|---|
| 重用單位 | 整個 16MB segment 檔 | 同一個檔案裡的同一個 offset |
| 重用手法 | 改名 | 原地覆寫 |
| 世代如何辨識 | 檔名本身就是位置，LSN 全域單調 | 檔名和 offset 都沒變，需要 salt |
| 誰負責清理 | checkpointer 背景行程 | 沒有任何背景行程 |

PostgreSQL 的 rename 本身就攜帶了「這是新世代」的資訊。SQLite 覆寫進同一個 offset，檔案系統層面看不出差異，salt 是被迫補上的標記。

### SQLite 自己給的理由

`wal.html` 直說：

> The checkpoint does not normally truncate the WAL file... Instead, it merely causes SQLite to start overwriting the WAL file from the beginning. **This is done because it is normally faster to overwrite an existing file than to append.**

append 要跟檔案系統要新的 block、更新 inode 大小、可能要 fsync 目錄。覆寫既有 block 全都省掉。對一個常跑在手機、嵌入式裝置、便宜 SD 卡上的資料庫，這不是小事。

### 為什麼不能學 PostgreSQL

三個結構性原因。

**沒有背景行程。** PostgreSQL 有 checkpointer process。SQLite 是函式庫，checkpoint 是由「剛好某個連線」順手做的。如果改成 segment 檔，誰來刪舊的？程式當掉沒清乾淨怎麼辦？你的 `app.db` 旁邊會慢慢堆出上千個 segment，而且沒有任何行程有責任收拾。

**PostgreSQL 保留 WAL 是因為它需要。** archiving、streaming replication、PITR、WAL summarization——這些 SQLite 一個都沒有。對 SQLite 來說，checkpoint 完成的那一刻，WAL 裡的內容就是純粹的冗餘。

**「單一檔案」是 SQLite 的核心賣點。** WAL 模式已經多了兩個暫時性檔案，再加上一串數量不定的 segment，這個賣點就沒了。

### 這樣設計是不是更容易誤解

對外部讀取者來說，確實危險。而且危險的形式最糟：「用檔案大小算 frame 數」是最自然的直覺，錯了不會有錯誤訊息，產出的資料庫結構完全合法。

但對 SQLite 自己來說一點都不容易誤解，因為它從來不靠檔案大小判斷——它讀 `-shm` 裡的 `mxFrame`。salt 檢查只是 recovery 時的保險。

這是一個成本轉嫁的設計：SQLite 省下背景行程、多檔案管理、目錄 fsync，代價是外部工具必須理解 salt 語意。而 SQLite 從來沒有官方支援過「外部工具直接讀 `-wal`」這個使用情境。

公平地說，SQLite 也把該講的都講了。`wal.c:29-32` 白紙黑字：

> Checksums and counters attached to each frame are used to determine which frames within the WAL are valid and which are **leftovers from prior checkpoints**.

## 小結

寫這個 parser 最大的收穫不是格式細節，而是一個很硬的教訓：面對 SQLite 的 WAL，**可信度排序是程式碼 > 實測 > 文件，而且連程式碼的註解都會錯**。整理成幾條可以帶走的原則：

| 主題 | 結論 |
|---|---|
| 有效 frame 數 | **不能**用 `(len - 32) / stride` 算，必須逐 slot 驗 salt |
| salt 何時變 | 只有 WAL reset 或 `TRUNCATE` 才變，checkpoint 不變 |
| salt 判別 | 用相等性測試，且要比對 **兩個** salt，不能假設單調遞增 |
| autocheckpoint | 只是一個 WAL hook，自己註冊 hook 就會關掉它 |
| checkpoint starvation | 用 `PRAGMA wal_checkpoint` 回傳值或 `-shm` 的 `nBackfill` 診斷，不能看檔案大小或 salt |
| commit vs transaction | 位元組只能回復 commit 邊界，去重 key 必須是 `(page_no, payload)` |
| 判定順序 | 長度 → salt → `page_no != 0` → checksum，順序是規範性的 |

如果你也在寫任何直接讀 `-wal` 的工具（備份、CDC、replication），這幾條踩過的坑希望能幫你少繞一圈。

---

## References

- [SQLite Database File Format §4](https://sqlite.org/fileformat2.html) — WAL 檔案格式、checksum 演算法、checkpoint / reader 演算法
- [SQLite WAL-Mode File Format](https://sqlite.org/walformat.html) — `-shm` 格式、鎖定協定、recovery
- [Write-Ahead Logging](https://sqlite.org/wal.html) — 設計取捨、autocheckpoint、避免 WAL 過大
- [PostgreSQL WAL Configuration](https://www.postgresql.org/docs/current/wal-configuration.html) — segment 回收與保留條件
- 相關文章：[PostgreSQL WAL (Write-Ahead Logging) 機制](https://isdaniel.github.io/postgresql-wal-introduce/)
