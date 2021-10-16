---
title: CLR系列-Lock深入淺出
date: 2021-08-15 21:13:34
tags: [C#,lock,CLR]
categories: [C#,CLR]
top:
photos: 
    - "https://i.imgur.com/dWZF6DH.png"
keywords: C#,lock,CLR
---

## 前言

你知道object lock底層怎麼實作，可重入鎖是底層是怎麼運作的嗎?

本篇就跟大家分享這些細節.

## 可重入鎖Demo

```c#
class Program
{
    static object _object = new object();

    static void Main(string[] args)
    {
        Task.WaitAll(Task.Run(() => { TryLockDemo(); }), Task.Run(() => { TryLockDemo(); }));

        Console.WriteLine("Hello World!");
    }

    public static void TryLockDemo() {
        var threadId = Thread.CurrentThread.ManagedThreadId;
        Console.WriteLine($"[{threadId}] {DateTime.Now:HH:mm:ss} TryLockDemo Start");
        try
        {
            Monitor.Enter(_object);
            Console.WriteLine($"[{threadId}] {DateTime.Now:HH:mm:ss} get first lock");
            try
            {
                Thread.Sleep(3000);
                Monitor.Enter(_object);
                Console.WriteLine($"[{threadId}] {DateTime.Now:HH:mm:ss} get second lock");
            }
            finally
            {
                Monitor.Exit(_object);
                Console.WriteLine($"[{threadId}] {DateTime.Now:HH:mm:ss} release second lock");
            }
        }
        finally
        {
            Thread.Sleep(3000);
            Monitor.Exit(_object);
            Console.WriteLine($"[{threadId}] {DateTime.Now:HH:mm:ss} release first lock");
        }
    }
}
```

上面這段程式碼，同時間會由2個Thread來呼叫處理`TryLockDemo`方法.

主要是演示lock中在對於同一個object lock一次且在multiple-Thread中會怎麼運作

為什麼Thread 1釋放first lock時，Thread 2會繼續blocking並等待Thread 1釋放second lock?

![](https://i.imgur.com/gKt8aY4.png)

## object中Syncblk

在回答上面問題前，我們必須先了解Syncblk這個區塊

每個Object Instance都有的底層資訊

* Syncblk:掌管指向Syncblk Entry Index和HashCode資料
* TypeHandle:存放對應Method Table資訊

TypeHandle不是本次介紹範疇就不多說了

> 每個Object都有Object Header (syncblk + TypeHandle) 8 bytes

在MSDN有一張圖詳細描述Syncblk

![](https://i.imgur.com/Mj8HoFC.png)

下圖是我畫重點流程和關係

![](https://i.imgur.com/dWZF6DH.png)

如果對於物件使用lock Syncblk會存放本次使用TheadID，存放指向Syncblk Entry Table.

Syncblk Entry Table是一個全域的物件，掌管物件跟syncblk對應資訊(串聯lock中繼資料表)，用指針指向物件所屬的syncBlock.

syncBlock中會存放幾個重要成員變數

* ThreadID:當前佔有的ThreadID
* m_Recursion:當前佔有的ThreadID獲取幾次Lock
* m_appDomainIndex:當前AppDomain標示
* m_lockState:目前lock佔有狀態(int 0代表可用，1代表不可用)

> syncBlock內置有一個FIFO等待鏈結表的排隊隊列，將每個等待獲取lock的Thread封裝成一個Node

下面部分會跟大家介紹cpp核心解鎖

## LockState object

m_lockState這個變數帳管syncblk鎖狀態，對於Lock來說至關重要

下面是原始碼，裡面涉及許多邏輯運算我不打算一一解說 有興趣的可以自行查看

主要可以看到`LockState.m_state`初始值設定成0

```cpp
    class LockState
    {
    private:
        // Layout constants for m_state
        static const UINT32 IsLockedMask = (UINT32)1 << 0; // bit 0
        static const UINT32 ShouldNotPreemptWaitersMask = (UINT32)1 << 1; // bit 1
        static const UINT32 SpinnerCountIncrement = (UINT32)1 << 2;
        static const UINT32 SpinnerCountMask = (UINT32)0x7 << 2; // bits 2-4
        static const UINT32 IsWaiterSignaledToWakeMask = (UINT32)1 << 5; // bit 5
        static const UINT8 WaiterCountShift = 6;
        static const UINT32 WaiterCountIncrement = (UINT32)1 << WaiterCountShift;
        static const UINT32 WaiterCountMask = (UINT32)-1 >> WaiterCountShift << WaiterCountShift; // bits 6-31

    private:
        UINT32 m_state;

    public:
        LockState(UINT32 state = 0) : m_state(state)
        {
            LIMITED_METHOD_CONTRACT;
        }

    public:
        UINT32 GetState() const
        {
            LIMITED_METHOD_CONTRACT;
            return m_state;
        }

        UINT32 GetMonitorHeldState() const
        {
            LIMITED_METHOD_CONTRACT;
            static_assert_no_msg(IsLockedMask == 1);
            static_assert_no_msg(WaiterCountShift >= 1);

            // Return only the locked state and waiter count in the previous (m_MonitorHeld) layout for the debugger:
            //   bit 0: 1 if locked, 0 otherwise
            //   bits 1-31: waiter count
            UINT32 state = m_state;
            return (state & IsLockedMask) + (state >> WaiterCountShift << 1);
        }
//..
```

[source code](https://github.com/dotnet/runtime/blob/6ebdf247cf9f99ee70bad0db8dd7abdcba993496/src/coreclr/vm/syncblk.h#L183-L225)

## Entry Lock cpp code

下面是CLR獲取Lock時核心程式碼

* 當前sync block物件**沒有任何Thread佔有**且**是未上鎖**狀態才會進入上鎖環節.

> `InterlockedTryLock_Or_RegisterWaiter`呼叫此方法內部會做CAS所以狀態具有Atomic.
> 使用CAS & Volatile來達到變數Atomic & 可見性

* 當前sync block物件是上鎖狀態但佔有Thread不是自己就會呼叫`EnterEpilog`方法會執行把此Thread加入`ThreadQueue`等待(FIFO)，lock Thread完成發出signal讓後續Threads可以繼續動作.
* 當前sync block物件事由當前Thread擁有還在上鎖中，就把m_Recursion++(註記目前重入幾次，需要在釋放把m_Recursion設定成0才會釋放sync block)


```c++
void AwareLock::Enter()
{
    CONTRACTL
    {
        INSTANCE_CHECK;
        THROWS;
        GC_TRIGGERS;
        MODE_ANY;
        INJECT_FAULT(COMPlusThrowOM(););
    }
    CONTRACTL_END;

    Thread *pCurThread = GetThread();
    LockState state = m_lockState.VolatileLoadWithoutBarrier();
    if (!state.IsLocked() || m_HoldingThread != pCurThread)
    {
        if (m_lockState.InterlockedTryLock_Or_RegisterWaiter(this, state))
        {
            // We get here if we successfully acquired the mutex.
            m_HoldingThread = pCurThread;
            m_Recursion = 1;
            pCurThread->IncLockCount();
            return;
        }

        // Lock was not acquired and the waiter was registered

        // Didn't manage to get the mutex, must wait.
        // The precondition for EnterEpilog is that the count of waiters be bumped
        // to account for this thread, which was done above.
        EnterEpilog(pCurThread);
        return;
    }

    // Got the mutex via recursive locking on the same thread.
    _ASSERTE(m_Recursion >= 1);
    m_Recursion++;
}
```

[source code](https://github.com/dotnet/coreclr/blob/master/src/vm/syncblk.cpp#L2376-L2429)

## Release Lock cpp code

在呼叫syncblk物件`AwareLock::Leave`方法，主要是透過`LeaveHelper`來判定解鎖是否成功.

```c++
BOOL AwareLock::Leave()
{
    CONTRACTL
    {
        INSTANCE_CHECK;
        NOTHROW;
        GC_NOTRIGGER;
        MODE_ANY;
    }
    CONTRACTL_END;

    Thread* pThread = GetThread();

    AwareLock::LeaveHelperAction action = LeaveHelper(pThread);

    switch(action)
    {
    case AwareLock::LeaveHelperAction_None:
        // We are done
        return TRUE;
    case AwareLock::LeaveHelperAction_Signal:
        // Signal the event
        Signal();
        return TRUE;
    default:
        // Must be an error otherwise
        _ASSERTE(action == AwareLock::LeaveHelperAction_Error);
        return FALSE;
    }
}
```

[syncblk.cpp (AwareLock::Leave)](https://github.com/dotnet/coreclr/blob/master/src/vm/syncblk.cpp#L2741-L2770)

一開始要先判斷目前解鎖的Thread是否和syncblk佔有的Thread相同，如果不同就回傳`AwareLock::LeaveHelperAction_Error`

後續會判斷是否所有重入鎖都是放完畢(`if (--m_Recursion == 0)`)，如果都是放完畢就會把`m_HoldingThread`釋放，讓其他Thread可以擁有並接續判斷是否有其他Thread在等待此資源，有的話回傳`AwareLock::LeaveHelperAction_Signal`代表要通知其他Thread爭取此syncblk物件

```c++
FORCEINLINE AwareLock::LeaveHelperAction AwareLock::LeaveHelper(Thread* pCurThread)
{
    CONTRACTL {
        NOTHROW;
        GC_NOTRIGGER;
        MODE_ANY;
    } CONTRACTL_END;

    if (m_HoldingThread != pCurThread)
        return AwareLock::LeaveHelperAction_Error;

    //省略一些程式碼
    if (--m_Recursion == 0)
    {
        m_HoldingThread = NULL;

        // Clear lock bit and determine whether we must signal a waiter to wake
        if (!m_lockState.InterlockedUnlock())
        {
            return AwareLock::LeaveHelperAction_None;
        }

        // There is a waiter and we must signal a waiter to wake
        return AwareLock::LeaveHelperAction_Signal;
    }

    return AwareLock::LeaveHelperAction_None;
}
```

[syncblk source code(AwareLock::LeaveHelper)](https://github.com/dotnet/runtime/blob/57bfe474518ab5b7cfe6bf7424a79ce3af9d6657/src/coreclr/vm/syncblk.inl#L665-L700)

## LockState::InterlockedUnlock

`InterlockedUnlock`方法會將`LockState.m_state`減1(具有Atomic)，把狀態設定成0讓其他人可以獲得此物件.

```cpp
FORCEINLINE bool AwareLock::LockState::InterlockedUnlock()
{
    WRAPPER_NO_CONTRACT;

    LockState state = InterlockedDecrementRelease((LONG *)&m_state);
    while (true)
    {
        // Keep track of whether a thread has been signaled to wake but has not yet woken from the wait.
        // IsWaiterSignaledToWakeMask is cleared when a signaled thread wakes up by observing a signal. Since threads can
        // preempt waiting threads and acquire the lock (see InterlockedTryLock()), it allows for example, one thread to acquire
        // and release the lock multiple times while there are multiple waiting threads. In such a case, we don't want that
        // thread to signal a waiter every time it releases the lock, as that will cause unnecessary context switches with more
        // and more signaled threads waking up, finding that the lock is still locked, and going right back into a wait state.
        // So, signal only one waiting thread at a time.
        if (!state.NeedToSignalWaiter())
        {
            return false;
        }

        LockState newState = state;
        newState.InvertIsWaiterSignaledToWake();

        LockState stateBeforeUpdate = CompareExchange(newState, state);
        if (stateBeforeUpdate == state)
        {
            return true;
        }

        state = stateBeforeUpdate;
    }
}
```

## 補充說明 Lock Wait環節

上面有說假如有一個`SyncBlock`目前已經有Thread在使用中，其他Thread如果要嘗試存取會進入等待鏈結表進行等待.

`SyncBlock`內部維護一個重要成員變數`SLink`當作指針，指向`WaitEventLink`使用鏈結表.

![](https://i.imgur.com/q4o9SML.png)

```cpp
// We can't afford to use an SList<> here because we only want to burn
// space for the minimum, which is the pointer within an SLink.
SLink       m_Link;
```

`WaitEventLink`程式碼

```cpp
// Used inside Thread class to chain all events that a thread is waiting for by Object::Wait
struct WaitEventLink {
    SyncBlock         *m_WaitSB;
    CLREvent          *m_EventWait;
    PTR_Thread         m_Thread;       // Owner of this WaitEventLink.
    PTR_WaitEventLink  m_Next;         // Chain to the next waited SyncBlock.
    SLink              m_LinkSB;       // Chain to the next thread waiting on the same SyncBlock.
    DWORD              m_RefCount;     // How many times Object::Wait is called on the same SyncBlock.
};
```

下面是ThreadQueue的`DequeueThread` & `EnqueueThread`實作

`DequeueThread`:透過`SLink`取得下一個等待的Wait Thread.
`EnqueueThread`:把新加入等待Thread透過Link reference point，加入到WaitQueue節點之後

```cpp
// Unlink the head of the Q.  We are always in the SyncBlock's critical
// section.
/* static */
inline WaitEventLink *ThreadQueue::DequeueThread(SyncBlock *psb)
{
    CONTRACTL
    {
        NOTHROW;
        GC_NOTRIGGER;
        MODE_ANY;
        CAN_TAKE_LOCK;
    }
    CONTRACTL_END;

    // Be careful, the debugger inspects the queue from out of process and just looks at the memory...
    // it must be valid even if the lock is held. Be careful if you change the way the queue is updated.
    SyncBlockCache::LockHolder lh(SyncBlockCache::GetSyncBlockCache());

    WaitEventLink      *ret = NULL;
    SLink       *pLink = psb->m_Link.m_pNext;

    if (pLink)
    {
        psb->m_Link.m_pNext = pLink->m_pNext;
#ifdef _DEBUG
        pLink->m_pNext = (SLink *)POISONC;
#endif
        ret = WaitEventLinkForLink(pLink);
        _ASSERTE(ret->m_WaitSB == psb);
    }
    return ret;
}

// Enqueue is the slow one.  We have to find the end of the Q since we don't
// want to burn storage for this in the SyncBlock.
/* static */
inline void ThreadQueue::EnqueueThread(WaitEventLink *pWaitEventLink, SyncBlock *psb)
{
    CONTRACTL
    {
        NOTHROW;
        GC_NOTRIGGER;
        MODE_ANY;
        CAN_TAKE_LOCK;
    }
    CONTRACTL_END;

    _ASSERTE (pWaitEventLink->m_LinkSB.m_pNext == NULL);

    // Be careful, the debugger inspects the queue from out of process and just looks at the memory...
    // it must be valid even if the lock is held. Be careful if you change the way the queue is updated.
    SyncBlockCache::LockHolder lh(SyncBlockCache::GetSyncBlockCache());

    SLink       *pPrior = &psb->m_Link;

    while (pPrior->m_pNext)
    {
        // We shouldn't already be in the waiting list!
        _ASSERTE(pPrior->m_pNext != &pWaitEventLink->m_LinkSB);

        pPrior = pPrior->m_pNext;
    }
    pPrior->m_pNext = &pWaitEventLink->m_LinkSB;
}
```

之前有說到Thread`ret = m_SemEvent.Wait(timeOut, TRUE);`會等待訊號發出，假如不幸同時間有多個Thread在爭搶又搶輸了，就會進入SpinLock等待會透過[CLREventBase::WaitEX](https://github.com/dotnet/runtime/blob/57bfe474518ab5b7cfe6bf7424a79ce3af9d6657/src/coreclr/vm/synch.cpp#L416-L469)，最後呼叫[PalRedhawkUnix](https://github.com/dotnet/corert/blob/c6af4cfc8b625851b91823d9be746c4f7abdc667/src/Native/Runtime/unix/PalRedhawkUnix.cpp#L990-L999)等待再進入Wait環節.

```cpp
extern "C" UInt32 WaitForSingleObjectEx(HANDLE handle, UInt32 milliseconds, UInt32_BOOL alertable)
{
    // The handle can only represent an event here
    // TODO: encapsulate this stuff
    UnixHandleBase* handleBase = (UnixHandleBase*)handle;
    ASSERT(handleBase->GetType() == UnixHandleType::Event);
    EventUnixHandle* unixHandle = (EventUnixHandle*)handleBase;

    return unixHandle->GetObject()->Wait(milliseconds);
}
```

## 小結

經過上面說明相信大家對於一開始說的可重入鎖，上鎖原理有了些許了解

下面是我畫出上鎖對於重入鎖syncblk物件狀態圖流程圖

![](https://i.imgur.com/gocsWQc.png)

在object Instance的sync block index區塊除了會存放lock使用Thread(sync table index)外，HashCode也是存在上面(此區塊共有32 bit，其中26 bit，有時會給呼叫GetHashCode時存放)因為不是這次主題我就不多說了.

本次使用sample在 

https://github.com/isdaniel/BlogSample/tree/master/src/Samples/DeepKnowLock
