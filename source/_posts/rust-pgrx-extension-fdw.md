---
title: Building a PostgreSQL Foreign Data Wrapper (FDW) in Rust with pgrx
date: 2025-06-30 22:30:11
tags: [Rust, PostgreSQL,pgrx]
categories: [Rust, pgrx, PostgreSQL]
keywords: Rust, pgrx, PostgreSQL
---

Here's a well-structured draft for your technical blog post based on the provided Rust + pgrx Foreign Data Wrapper (FDW) code.

# 🚀 Building a Simple PostgreSQL FDW with Rust and pgrx

PostgreSQL Foreign Data Wrappers (FDW) enable PostgreSQL to query external data sources as if they were regular tables. Traditionally, FDWs are written in C, but with [`pgrx`](https://github.com/pgcentralfoundation/pgrx), we can now build PostgreSQL extensions — including FDWs — in **Rust**, unlocking safety and modern tooling.

In this post, we'll walk through creating a simple FDW using Rust and `pgrx` that simulates reading rows from an external source (e.g., Redis or API). While it’s a stub, it demonstrates how to implement the core FDW lifecycle.

## 🛠️ What Can You Build with `pgrx`?

* ✅ **SQL Functions:** Scalar, aggregate, and set-returning functions.
* ✅ **Custom Types:** Define composite types or enums in Rust.
* ✅ **Foreign Data Wrappers (FDWs):** Like the one in your example — connect PostgreSQL to external systems (Redis, APIs, file systems, etc.).
* ✅ **Index Access Methods:** Implement new index types.
* ✅ **Background Workers:** Run tasks in the background inside PostgreSQL.
* ✅ **Hooks:** Intercept or modify PostgreSQL internal behavior (like planner or executor hooks).

### 🌐 Under the hood:

* PostgreSQL communicates via C APIs.
* `pgrx` provides Rust-safe bindings to these APIs.
* Memory management is handled carefully via `PgMemoryContexts`, matching PostgreSQL’s memory context model.
* Rust functions are exposed to PostgreSQL as SQL-callable functions with the `#[pg_extern]` macro.

## 🏗️ Key Components of an default_fdw

PostgreSQL FDWs consist of several callback functions that handle different phases of query planning and execution:

Example extension [default_fdw](https://github.com/isdaniel/rust_pg_extensions/blob/main/src/default_fdw.rs)

* **Planning Phase:**

  * `GetForeignRelSize`: Estimate rows.
  * `GetForeignPaths`: Generate access paths.
  * `GetForeignPlan`: Create the scan plan.

* **Execution Phase:**

  * `BeginForeignScan`: Initialize the scan.
  * `IterateForeignScan`: Produce each row.
  * `ReScanForeignScan`: Restart the scan if needed.
  * `EndForeignScan`: Cleanup.

### How to use

```sql
create foreign data wrapper default_wrapper
  handler default_fdw_handler;

create server my_default_server
  foreign data wrapper default_wrapper
  options (
    foo 'bar'
  );

create foreign table hello (
  id bigint,
  col text
)
server my_default_server options (
	foo 'bar'
);
```

Then we can select hello table.

```
select * from hello;
```

## 🔧 Setting Up the FDW Handler

The entry point is the FDW handler function, which PostgreSQL calls to retrieve a set of function pointers.

```rust
#[pg_extern(create_or_replace)]
pub extern "C" fn default_fdw_handler() -> PgBox<pg_sys::FdwRoutine> {
    log!("> default_fdw_handler");
    unsafe {
        let mut fdw_routine = PgBox::<pg_sys::FdwRoutine, AllocatedByRust>::alloc_node(pg_sys::NodeTag::T_FdwRoutine);

        // Planning callbacks
        fdw_routine.GetForeignRelSize = Some(get_foreign_rel_size);
        fdw_routine.GetForeignPaths = Some(get_foreign_paths);
        fdw_routine.GetForeignPlan = Some(get_foreign_plan);
        fdw_routine.ExplainForeignScan = Some(explain_foreign_scan);

        // Execution callbacks
        fdw_routine.BeginForeignScan = Some(begin_foreign_scan);
        fdw_routine.IterateForeignScan = Some(iterate_foreign_scan);
        fdw_routine.ReScanForeignScan = Some(re_scan_foreign_scan);
        fdw_routine.EndForeignScan = Some(end_foreign_scan);

        fdw_routine.into_pg_boxed()
    }
}
```



## 📦 Extracting Foreign Table Options

PostgreSQL allows specifying options like hostnames or credentials when creating a foreign table. This function retrieves those options:

```rust
unsafe fn get_foreign_table_options(relid: pg_sys::Oid) -> HashMap<String, String> {
    ...
}
```

This is crucial when your FDW needs to connect to external systems like Redis, REST APIs, or filesystems.



## 📊 Planner Callbacks

### 1️⃣ **GetForeignRelSize**

Estimates the number of rows in the foreign table.

```rust
#[pg_guard]
extern "C" fn get_foreign_rel_size(..., baserel: *mut pg_sys::RelOptInfo, ...) {
    log!("> get_foreign_rel_size");
    unsafe {
        (*baserel).rows = 1000.0;
    }
}
```

### 2️⃣ **GetForeignPaths**

Defines possible access paths for the planner.

```rust
#[pg_guard]
extern "C" fn get_foreign_paths(..., baserel: *mut pg_sys::RelOptInfo, ...) {
    log!("> get_foreign_paths");
    unsafe {
        let path = pg_sys::create_foreignscan_path(
            ...,
            (*baserel).rows,
            10.0,   // startup cost
            100.0,  // total cost
            ...
        );
        pg_sys::add_path(baserel, path as *mut pg_sys::Path);
    }
}
```

### 3️⃣ **GetForeignPlan**

Generates the actual execution plan.

```rust
#[pg_guard]
extern "C" fn get_foreign_plan(...) -> *mut pg_sys::ForeignScan {
    log!("> get_foreign_plan");
    unsafe {
        pg_sys::make_foreignscan(...)
    }
}
```



## ▶️ Execution Callbacks

### 🏁 **BeginForeignScan**

Initializes the scan.

```rust
#[pg_guard]
extern "C" fn begin_foreign_scan(node: *mut pg_sys::ForeignScanState, ...) {
    log!("> begin_foreign_scan");
    unsafe {
        let relid = (*(*node).ss.ss_currentRelation).rd_id;
        let options = get_foreign_table_options(relid);
        log!("Foreign table options: {:?}", options);

        let state = PgMemoryContexts::CurrentMemoryContext
            .leak_and_drop_on_delete(RedisFdwState { row: 0 });

        (*node).fdw_state = state as *mut std::ffi::c_void;
    }
}
```

### 🔁 **IterateForeignScan**

Produces rows one at a time.

```rust
#[pg_guard]
extern "C" fn iterate_foreign_scan(node: *mut pg_sys::ForeignScanState) -> *mut pg_sys::TupleTableSlot {
    log!("> iterate_foreign_scan");

    unsafe {
        let state = &mut *((*node).fdw_state as *mut RedisFdwState);
        let slot = (*node).ss.ss_ScanTupleSlot;
        let tupdesc = (*slot).tts_tupleDescriptor;
        let natts = (*tupdesc).natts as usize;

        if state.row >= 5 {
            exec_clear_tuple(slot);
            return slot;
        }

        exec_clear_tuple(slot);

        let values_ptr = PgMemoryContexts::For((*slot).tts_mcxt)
            .palloc(std::mem::size_of::<pg_sys::Datum>() * natts) as *mut pg_sys::Datum;

        let nulls_ptr = PgMemoryContexts::For((*slot).tts_mcxt)
            .palloc(std::mem::size_of::<bool>() * natts) as *mut bool;

        *values_ptr.add(0) = (state.row + 1).into();
        let name = format!("hello_{}", state.row + 1);
        let cstring = CString::new(name).unwrap();
        *values_ptr.add(1) = Datum::from(pg_sys::cstring_to_text(cstring.as_ptr()));

        *nulls_ptr.add(0) = false;
        *nulls_ptr.add(1) = false;

        (*slot).tts_values = values_ptr;
        (*slot).tts_isnull = nulls_ptr;

        pg_sys::ExecStoreVirtualTuple(slot);

        state.row += 1;

        slot
    }
}
```

This example emits five rows with `(id, name)` pairs like `(1, hello_1)`.

### 🔄 **ReScanForeignScan**

Handles rescan requests.

```rust
#[pg_guard]
extern "C" fn re_scan_foreign_scan(_node: *mut pg_sys::ForeignScanState) {
    log!("> re_scan_foreign_scan");
}
```

### 🛑 **EndForeignScan**

Frees resources.

```rust
#[pg_guard]
extern "C" fn end_foreign_scan(node: *mut pg_sys::ForeignScanState) {
    log!("> end_foreign_scan");
    unsafe {
        if !(*node).fdw_state.is_null() {
            (*node).fdw_state = std::ptr::null_mut();
        }
    }
}
```


## 🗒️ Utilities

Tuple clearing is handled by this helper:

```rust
unsafe fn exec_clear_tuple(slot: *mut pg_sys::TupleTableSlot) {
    if let Some(clear) = (*(*slot).tts_ops).clear {
        clear(slot);
    }
}
```


## 🏁 Conclusion

This post walked you through the basics of building a PostgreSQL FDW using Rust and `pgrx`. While this example generates dummy data, the same structure can be extended to connect with real-world systems like Redis, REST APIs, or message queues.

## 🚀 Next Steps

* Add connection logic to Redis or any backend.
* Support `INSERT`, `UPDATE`, `DELETE` by implementing the modification callbacks.
* Package and distribute as a PostgreSQL extension.


## 📚 References

* [pgrx GitHub](https://github.com/pgcentralfoundation/pgrx)
* [PostgreSQL FDW API Documentation](https://www.postgresql.org/docs/current/fdw-callbacks.html)


If you'd like, I can help refine this post further, format it for Medium/Dev.to, or extend it with Redis connection examples. Would you like that?
