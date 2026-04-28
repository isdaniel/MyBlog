---
title: "pg-walstream: High-Performance PostgreSQL WAL Streaming in Rust"
date: 2026-04-21 22:00:00
tags: [Rust, PostgreSQL, logical-replication, WAL, CDC]
categories: [Rust, PostgreSQL, logical-replication]
keywords: Rust,PostgreSQL,WAL,logical-replication,CDC,Change-Data-Capture,pg-walstream,real-time,event-driven
description: "A high-performance Rust library for parsing and streaming PostgreSQL WAL messages via logical replication — with load testing results showing 200K+ events/sec."
lang: en
---

# pg-walstream: High-Performance PostgreSQL WAL Streaming in Rust

[pg-walstream](https://github.com/isdaniel/pg-walstream) is a Rust library for parsing and streaming PostgreSQL Write-Ahead Log (WAL) messages through logical and physical replication protocols. It provides a type-safe, async-first interface for building real-time Change Data Capture (CDC) pipelines.

If you need to react to database changes in real-time — event-driven architectures, data pipelines, audit logging, cache invalidation, or search index syncing — pg-walstream abstracts the complex PostgreSQL replication protocol into a clean Rust API.

[crates.io](https://crates.io/crates/pg_walstream) | [API Docs](https://docs.rs/pg-walstream)

## Background: PostgreSQL WAL and Replication

Before diving into pg-walstream, it helps to understand how PostgreSQL replication works at a fundamental level.

### What is WAL (Write-Ahead Logging)?

WAL is PostgreSQL's mechanism for ensuring data durability. The core idea: **write the transaction log first, then write the actual data**. Every INSERT, UPDATE, DELETE, and DDL change is recorded sequentially in WAL files before the corresponding data pages are flushed to disk.

This design provides two key benefits:

1. **Crash recovery** — if the system crashes, PostgreSQL can replay (REDO) the WAL to recover committed transactions that weren't yet flushed to disk.
2. **I/O efficiency** — sequential WAL writes are much faster than random page writes, so PostgreSQL doesn't need to flush dirty pages on every commit.

Each WAL record is identified by a **Log Sequence Number (LSN)** — a monotonically increasing pointer into the WAL stream. LSN is the backbone of replication: it tells both the sender and receiver exactly where they are in the change history.

```
                  WAL Stream
   ┌───────┬───────┬───────┬───────┬───────┐
   │ BEGIN │INSERT │UPDATE │DELETE │COMMIT │  ...
   │LSN: 1 │LSN: 2 │LSN: 3 │LSN: 4 │LSN: 5 │
   └───────┴───────┴───────┴───────┴───────┘
                         │
              Replayed by standby / consumed by CDC
```

For a deeper dive into WAL internals, see my earlier post: [PostgreSQL WAL (Write-Ahead Logging) mechanism](https://isdaniel.github.io/postgresql-wal-introduce/).

### Physical vs. Logical Replication

PostgreSQL supports two replication modes, each serving different use cases:

**Physical Replication** streams raw WAL bytes — the exact disk-level changes — to a standby server. The standby replays these byte-for-byte, producing an identical copy of the primary. This is what powers read replicas and high-availability setups.

**Logical Replication** decodes WAL into higher-level change events (INSERT, UPDATE, DELETE) using an output plugin (e.g., `pgoutput`). Instead of raw disk blocks, consumers receive structured messages like "row X was inserted into table Y with these column values." This is what powers CDC pipelines.

```
Physical Replication:
  Primary ──[raw WAL bytes]──▶ Standby (byte-identical copy)

Logical Replication:
  Primary ──[pgoutput plugin]──▶ Decoded Change Events ──▶ CDC Consumer
                                  (INSERT/UPDATE/DELETE)
```

pg-walstream supports **both** modes — physical replication for standby/backup scenarios and logical replication for CDC.

### The Logical Replication Protocol

When a client connects to PostgreSQL in replication mode, they communicate via the **Streaming Replication Protocol**. For logical replication, the flow works as follows:

1. **Client creates a replication slot** — this tells PostgreSQL to retain WAL segments needed by this consumer, preventing them from being recycled.
2. **Client starts replication** from a slot, specifying the output plugin (`pgoutput`) and which publication to subscribe to.
3. **PostgreSQL streams messages** — the server continuously sends WAL data messages (`XLogData`) containing decoded change events.
4. **Client sends feedback** — periodically, the client reports its progress (flushed LSN, applied LSN) back to the server. This lets PostgreSQL know which WAL segments can be safely recycled.

The decoded messages follow the **logical replication message format**, which has evolved across four protocol versions:

| Protocol Version | PostgreSQL | Key Additions |
|:---:|:---:|---|
| v1 | 14+ | Core messages: BEGIN, COMMIT, INSERT, UPDATE, DELETE, TRUNCATE, RELATION, TYPE, ORIGIN |
| v2 | 14+ | **Streaming transactions**: STREAM_START, STREAM_STOP, STREAM_COMMIT, STREAM_ABORT — allows consuming large, in-progress transactions before COMMIT |
| v3 | 14+ | **Two-phase commit**: BEGIN_PREPARE, PREPARE, COMMIT_PREPARED, ROLLBACK_PREPARED, STREAM_PREPARE |
| v4 | 17+ | **Parallel streaming**, `abort_lsn` field for more precise abort handling |

Each message type carries specific data. For example, an INSERT message contains:

- **Relation ID** — which table the row belongs to
- **Tuple data** — the column values of the new row, typed by OID

The RELATION message (sent once per table, or when a schema changes) maps the relation ID to a table name, namespace, and column definitions — so the consumer can interpret the tuple data.

### Why Build a Library for This?

Implementing the replication protocol from scratch involves:

- Managing the PostgreSQL wire protocol and authentication (cleartext, MD5, SCRAM-SHA-256)
- Parsing binary WAL messages with protocol-version-specific formats
- Tracking LSN positions and sending periodic feedback to avoid WAL bloat
- Handling connection drops, retries, and replication slot lifecycle
- Dealing with streaming transactions that may arrive interleaved

pg-walstream encapsulates all of this complexity into a type-safe Rust API, so you can focus on what to **do** with the change events rather than how to **receive** them.

## Key Features

- **Protocol v1–v4 support** including streaming transactions (v2), two-phase commit (v3), and parallel streaming (v4)
- **Two connection backends**: `libpq` (C FFI, default) and `rustls-tls` (pure Rust, no runtime C deps)
- **Zero-copy buffers** via the `bytes` crate — no unnecessary data cloning
- **Serde-based deserialization** — map WAL events directly to Rust structs
- **Automatic retry** with exponential backoff for transient failures
- **Async/await** with `tokio` and `futures::Stream` integration
- **Memory efficient** — all configurations stay under 18 MB RSS

## Architecture

```
┌──────────────────────────────────────────┐
│          Application Layer               │
│  (Your CDC / Replication Logic)          │
└──────────────┬───────────────────────────┘
               │
┌──────────────▼───────────────────────────┐
│    LogicalReplicationStream              │
│  - Connection management & retry         │
│  - Event processing & LSN feedback       │
│  - Snapshot export support               │
└──────────────┬───────────────────────────┘
               │
┌──────────────▼───────────────────────────┐
│  LogicalReplicationParser                │
│  - Protocol v1-v4 parsing                │
│  - Zero-copy message deserialization     │
│  - Streaming transaction support         │
└──────────────┬───────────────────────────┘
               │
┌──────────────▼───────────────────────────┐
│     PgReplicationConnection              │
│  ┌─────────────────┬──────────────────┐  │
│  │  libpq backend  │ rustls-tls       │  │
│  │  (C FFI)        │ (pure Rust)      │  │
│  └─────────────────┴──────────────────┘  │
│  Compile-time feature flag selection     │
└──────────────┬───────────────────────────┘
               │
┌──────────────▼───────────────────────────┐
│     BufferReader / BufferWriter          │
│  - Zero-copy operations (bytes crate)    │
│  - Binary protocol handling              │
└──────────────────────────────────────────┘
```

The library has two connection backends selected at compile time:

| Backend | Feature Flag | Dependencies | Description |
|---------|-------------|--------------|-------------|
| libpq (default) | `libpq` | `libpq-dev`, `libclang-dev` | FFI wrapper around PostgreSQL's C client library |
| rustls-tls | `rustls-tls` | `cmake` (build-time only) | Pure-Rust TLS via rustls + aws-lc-rs (hardware-accelerated) |

When both features are enabled, `rustls-tls` takes priority automatically.

## Getting Started

### Installation

```toml
# Default (libpq backend)
[dependencies]
pg_walstream = "0.6.2"

# Pure-Rust backend (no C runtime deps)
pg_walstream = { version = "0.6.2", default-features = false, features = ["rustls-tls"] }
```

### PostgreSQL Setup

Enable logical replication in `postgresql.conf`:

```
wal_level = logical
max_replication_slots = 4
max_wal_senders = 4
```

Create a publication and replication user:

```sql
CREATE PUBLICATION my_publication FOR TABLE users, orders;

CREATE USER replication_user WITH REPLICATION PASSWORD 'secure_password';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO replication_user;
```

### Basic Streaming Example

```rust
use pg_walstream::{
    LogicalReplicationStream, ReplicationStreamConfig, RetryConfig,
    StreamingMode, CancellationToken,
};
use std::time::Duration;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = ReplicationStreamConfig::new(
        "my_slot".to_string(),
        "my_publication".to_string(),
        2,                              // Protocol version
        StreamingMode::On,
        Duration::from_secs(10),        // Feedback interval
        Duration::from_secs(30),        // Connection timeout
        Duration::from_secs(60),        // Health check interval
        RetryConfig::default(),
    );

    let mut stream = LogicalReplicationStream::new(
        "postgresql://postgres:password@localhost:5432/mydb?replication=database",
        config,
    ).await?;

    stream.start(None).await?;
    let cancel_token = CancellationToken::new();

    loop {
        match stream.next_event_with_retry(&cancel_token).await {
            Ok(event) => {
                println!("Received: {:?}", event);
                stream.shared_lsn_feedback.update_applied_lsn(event.lsn.value());
            }
            Err(e) if matches!(e, pg_walstream::ReplicationError::Cancelled(_)) => {
                println!("Shutting down gracefully");
                break;
            }
            Err(e) => {
                eprintln!("Error: {}", e);
                break;
            }
        }
    }

    Ok(())
}
```

### Typed Deserialization

pg-walstream supports mapping WAL events directly to Rust structs via Serde:

```rust
use serde::Deserialize;
use pg_walstream::EventType;

#[derive(Debug, Deserialize)]
struct User {
    id: i64,
    username: String,
    email: Option<String>,
    score: f64,
    active: bool,
}

// Inside your event loop:
match &event.event_type {
    EventType::Insert { .. } => {
        let user: User = event.deserialize_insert()?;
        println!("New user: {:?}", user);
    }
    EventType::Update { .. } => {
        let (old, new): (Option<User>, User) = event.deserialize_update()?;
        println!("Updated: {:?} -> {:?}", old, new);
    }
    EventType::Delete { .. } => {
        let user: User = event.deserialize_delete()?;
        println!("Deleted: {:?}", user);
    }
    _ => {}
}
```

### Producer/Consumer Pattern with tokio::spawn

For high-throughput scenarios, decouple WAL reading from event processing using channels:

```rust
use tokio::sync::mpsc;
use pg_walstream::{ChangeEvent, ReplicationError};

async fn run_producer(
    mut stream: LogicalReplicationStream,
    cancel_token: CancellationToken,
    tx: mpsc::Sender<ChangeEvent>,
) {
    stream.start(None).await.unwrap();
    loop {
        match stream.next_event_with_retry(&cancel_token).await {
            Ok(event) => {
                stream.shared_lsn_feedback.update_applied_lsn(event.lsn.value());
                if tx.send(event).await.is_err() { break; }
            }
            Err(ReplicationError::Cancelled(_)) => break,
            Err(e) => {
                eprintln!("Fatal: {e}");
                break;
            }
        }
    }
    stream.stop().await.ok();
}
```

## Load Testing Results

The library was benchmarked on an 8-core Intel Xeon Platinum 8370C (16 GB RAM, Ubuntu 22.04) across three PostgreSQL configurations:

- **PG16** with protocol v4 + parallel streaming (rustls-tls backend)
- **PG18** with binary mode + direct TLS negotiation
- **PG18 + COPY** with COPY generator optimization

### DML Throughput (events/sec)

| Scenario | PG16 | PG18 Binary+DirectTLS | PG18 +COPY |
|----------|-----:|-----:|-----:|
| Baseline | 148,533 | 168,205 | **209,193** |
| Batch-5000 | 132,623 | 151,820 | **190,687** |
| 4-Writers | 135,036 | 159,233 | **193,354** |
| Mixed-DML | 42,198 | 176,580 | **186,019** |
| Batch-100 | 22,270 | 141,597 | **199,780** |
| Wide-20col | 18,917 | 172,772 | **173,283** |
| Payload-2KB | 14,017 | 114,884 | **134,323** |

Peak throughput: **209,193 events/sec** (PG18 + COPY, Baseline scenario).

### Data Throughput (MB/s)

| Scenario | PG16 | PG18 Binary+DirectTLS | PG18 +COPY |
|----------|-----:|-----:|-----:|
| Baseline | 30.4 | 31.1 | **38.7** |
| Wide-20col | 21.3 | 50.7 | **51.5** |
| Payload-2KB | 28.3 | 43.9 | **57.1** |
| Mixed-DML | 7.9 | 32.1 | **33.8** |
| Batch-100 | 4.6 | 26.2 | **37.0** |

Best data throughput: **57.1 MB/s** (PG18 + COPY, Payload-2KB scenario).

### Stress Scaling: 16 to 192 Concurrent Writers

| Writers | PG16 | PG18 Binary+DirectTLS | PG18 +COPY |
|--------:|-----:|-----:|-----:|
| 16 | 125,657 | 130,625 | **185,044** |
| 32 | 111,970 | 133,880 | **184,718** |
| 64 | 103,937 | 125,082 | **182,349** |
| 128 | 87,352 | 109,594 | **160,293** |
| 192 | 71,316 | 98,482 | **171,585** |

Under high concurrency (16 to 192 writers), PG16 degrades by **43%** while PG18 + COPY only degrades by **~7%**, demonstrating significantly better scalability.

### CPU Efficiency (events/sec per 1% CPU)

| Scenario | PG16 | PG18 Binary+DirectTLS | PG18 +COPY |
|----------|-----:|-----:|-----:|
| Baseline | 5,689 | 5,637 | **5,920** |
| Batch-5000 | 5,379 | **5,733** | 5,440 |
| Wide-20col | 2,369 | 5,059 | **5,517** |
| Batch-100 | 3,966 | 5,572 | **5,693** |

PG18 variants deliver consistently higher CPU efficiency, averaging **5,200+ events/sec per 1% CPU** compared to PG16's **~4,700**.

### Memory Usage

All configurations remain extremely lightweight — between **15–18 MB RSS** regardless of load. Memory stays flat even under 192 concurrent writers, demonstrating the zero-copy buffer design pays off.

### Key Takeaways from Load Tests

1. **PG18 + COPY + binary mode** is the clear winner, peaking at **209K events/sec**
2. **Stress resilience** — PG18 + COPY maintains throughput under heavy concurrency where PG16 degrades sharply
3. **CPU efficient** — the rustls-tls backend uses ~3x less CPU than libpq in prior benchmarks (4,252 vs 1,628 events/sec per 1% CPU)
4. **Memory stable** — sub-18 MB footprint under all tested conditions
5. **Binary mode + direct TLS** provide significant improvements even without COPY optimization

## Performance Design Decisions

Several design choices contribute to pg-walstream's performance:

- **SmallVec** for tuple data — up to 16 columns stored inline on the stack, avoiding heap allocation for common cases
- **Custom OidHasher** — eliminates SipHash overhead for 32-bit OID integer keys
- **Arc\<str\>** for column/namespace names — shared immutable strings across events
- **CachePadded atomics** for LSN feedback — avoids false sharing in concurrent scenarios
- **Feedback throttling** — time checks only every 128 events via bitmask (`count & 0x7F == 0`)

## TCP Tuning for Production

For high-throughput deployments, the following Linux kernel parameters are recommended:

```bash
net.core.rmem_max = 67108864
net.core.wmem_max = 67108864
net.ipv4.tcp_rmem = 4096 262144 67108864
net.ipv4.tcp_wmem = 4096 262144 67108864
net.ipv4.tcp_congestion_control = bbr
net.core.netdev_max_backlog = 5000
```

## Conclusion

pg-walstream fills a gap in the Rust ecosystem for a production-grade PostgreSQL WAL streaming library. With protocol v1–v4 support, dual connection backends, zero-copy parsing, and throughput exceeding 200K events/sec, it provides a solid foundation for building CDC pipelines, event-driven systems, and real-time data synchronization.

The load testing results demonstrate that pairing pg-walstream with PostgreSQL 18's binary mode and COPY optimization delivers exceptional performance and scalability — maintaining high throughput even under 192 concurrent writers while keeping memory usage under 18 MB.

## References

- [pg-walstream GitHub Repository](https://github.com/isdaniel/pg-walstream)
- [pg-walstream on crates.io](https://crates.io/crates/pg_walstream)
- [API Documentation on docs.rs](https://docs.rs/pg-walstream)
- [Load Test Comparison Report](https://github.com/isdaniel/pg-walstream/blob/main/LOAD_TEST_COMPARISON.md)
- [PostgreSQL Logical Replication Documentation](https://www.postgresql.org/docs/current/logical-replication.html)
