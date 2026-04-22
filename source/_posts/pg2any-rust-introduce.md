---
title: "pg2any: A Rust CDC Library for Streaming PostgreSQL Changes to Any Database"
date: 2025-09-09 21:10:43
tags: [Rust, PostgreSQL, logical-replication, CDC]
categories: [Rust, PostgreSQL, logical-replication]
keywords: Rust, PostgreSQL, logical-replication, CDC, Change Data Capture, MySQL, SQL Server, SQLite
description: "pg2any is a production-ready Rust library that captures real-time data changes from PostgreSQL via logical replication and streams them to MySQL, SQL Server, or SQLite with crash-safe, file-based transaction persistence."
lang: en
---

## What is pg2any?

[pg2any](https://github.com/isdaniel/pg2any) is a Rust library (published as `pg2any_lib` on [crates.io](https://crates.io/crates/pg2any_lib)) that builds production-ready Change Data Capture (CDC) pipelines. It reads PostgreSQL's Write-Ahead Log (WAL) through logical replication and replays changes — inserts, updates, deletes, and truncates — to destination databases in real time.

Supported destinations:

- **MySQL** (via SQLx)
- **SQL Server** (via Tiberius)
- **SQLite** (via SQLx)

Each destination is behind a Cargo feature flag (`mysql`, `sqlserver`, `sqlite`), so you compile only the drivers you need.

A ready-to-run example application lives at [pg2any-example](https://github.com/isdaniel/rust_playground/tree/main/pg2any-example), and the underlying PostgreSQL streaming replication protocol is handled by the companion crate [pg_walstream](https://github.com/isdaniel/pg-walstream).

## Architecture

pg2any follows a **producer–consumer** pattern with **file-based transaction persistence** as the intermediary. This design gives crash safety: if the process dies mid-stream, committed-but-unexecuted transactions survive on disk and are replayed on restart.

```
┌─────────────────┐        ┌──────────────────────────────────────┐       ┌──────────────────┐
│   PostgreSQL    │        │          pg2any CDC Engine            │       │   Destination    │
│                 │  WAL   │                                      │  SQL  │  MySQL / MSSQL   │
│  Logical Repli- │───────▶│  ┌──────────┐     ┌───────────────┐ │──────▶│  / SQLite        │
│  cation Stream  │        │  │ Producer  │────▶│ File Storage  │ │       │                  │
│                 │        │  └──────────┘     └───────┬───────┘ │       └──────────────────┘
└─────────────────┘        │                          │         │
                           │                   ┌──────▼───────┐ │       ┌──────────────────┐
                           │                   │   Consumer   │ │       │   Prometheus     │
                           │                   │ (Priority Q) │ │       │   /metrics       │
                           │                   └──────────────┘ │       │   /health        │
                           └──────────────────────────────────────┘       └──────────────────┘
```

### Three-Directory Transaction Lifecycle

Transactions flow through three directories during their lifetime:

| Directory | Purpose |
|---|---|
| `sql_data_tx/` | Stores actual SQL content. Files are append-only and rotate at 64 MB segments for large transactions. |
| `sql_received_tx/` | Metadata for **in-progress** transactions (created at `BEGIN`). |
| `sql_pending_tx/` | Metadata for **committed** transactions ready for the consumer (atomically moved from `sql_received_tx/` on `COMMIT`). |

This three-phase approach means that only fully committed transactions ever reach the consumer, and incomplete transactions are cleaned up on restart.

### Producer

The producer reads the logical replication stream event by event:

1. On **BEGIN** — creates a metadata file in `sql_received_tx/` and a data file in `sql_data_tx/`.
2. On **INSERT / UPDATE / DELETE / TRUNCATE** — converts each event to destination-dialect SQL and appends it to the data file via a `BufferedEventWriter`.
3. On **COMMIT** — atomically moves metadata from `sql_received_tx/` to `sql_pending_tx/`, making the transaction visible to the consumer.

For protocol version 2+, the producer also handles **streaming transactions** (`StreamStart` / `StreamStop` / `StreamCommit`), which allow PostgreSQL to send chunks of large in-progress transactions before the final commit.

### Consumer

The consumer maintains a **priority queue ordered by commit LSN** to guarantee correct replay order:

1. Reads pending transaction metadata from `sql_pending_tx/`.
2. Parses SQL from `sql_data_tx/` using a streaming SQL parser (constant memory regardless of transaction size).
3. Executes statements atomically in a destination-side database transaction.
4. Invokes a **PreCommitHook** — a callback that runs inside the destination transaction before `COMMIT`, used to atomically persist the LSN checkpoint alongside the data. This eliminates the window where data is committed but the checkpoint is not (or vice versa).
5. Commits, then deletes processed files.

### Crash Recovery

On startup, pg2any scans:

- `sql_received_tx/` for incomplete transactions → **aborts** them.
- `sql_pending_tx/` for committed-but-unexecuted transactions → **replays** them.

The `LsnTracker` persists the last successfully applied LSN, so replication resumes exactly where it left off.

## Key Features

### DML Coalescing

One of pg2any's most impactful optimizations. Instead of executing individual DML statements one by one, the coalescing engine merges consecutive same-table operations:

- Multiple `INSERT`s → multi-value `INSERT INTO ... VALUES (...), (...), (...)`.
- Multiple `UPDATE`s → `CASE`-`WHEN` batch updates.
- Multiple `DELETE`s → combined `WHERE` clauses with `OR`.

This is applied across all three destination types, with dialect-aware identifier quoting (backticks for MySQL, brackets for SQL Server, double quotes for SQLite) and respects `max_allowed_packet` limits (MySQL) with an 80% safety margin.

### Compressed Storage

When enabled via `PG2ANY_ENABLE_COMPRESSION=true`, transaction files are stored as `.sql.gz` with accompanying `.sql.gz.idx` index files. Sync points are created every 1,000 statements, enabling O(1) seeking to arbitrary positions without decompressing the entire file — critical for efficient crash recovery of large transactions.

### Monitoring

With the `metrics` feature enabled, pg2any exposes a Prometheus-compatible HTTP server (default port 8080):

- `GET /metrics` — Prometheus text format with event counters, LSN progress, processing rates, error counts, and transaction statistics.
- `GET /health` — JSON health status.

Metrics use `AtomicU64` counters (lock-free) to minimize overhead on the hot path. When compiled without the `metrics` feature, all metric calls become zero-cost no-ops.

### Protocol Version Support

| Version | Capabilities |
|---|---|
| v1 | Basic logical replication (BEGIN, INSERT, UPDATE, DELETE, TRUNCATE, COMMIT) |
| v2 | Adds streaming transactions for large in-progress transactions |
| v3 | Adds two-phase commit support |
| v4 | Additional protocol capabilities |

## Quick Start

### Prerequisites

- PostgreSQL 10+ with `wal_level = logical`
- A destination database (MySQL 8.0+, SQL Server, or SQLite)

### PostgreSQL Setup

```sql
-- Verify logical replication is enabled
SHOW wal_level;           -- must be 'logical'
SHOW max_replication_slots;
SHOW max_wal_senders;

-- Create a publication for the tables you want to replicate
CREATE PUBLICATION cdc_pub FOR ALL TABLES;
-- Or for specific tables:
-- CREATE PUBLICATION cdc_pub FOR TABLE orders, customers;
```

### Using pg2any as a Library

Add `pg2any_lib` to your `Cargo.toml` with the destination features you need:

```toml
[dependencies]
pg2any_lib = { version = "0.9", features = ["mysql", "metrics"] }
tokio = { version = "1", features = ["full"] }
```

### Configuration via Environment Variables

| Variable | Description | Default |
|---|---|---|
| `CDC_SOURCE_CONNECTION_STRING` | PostgreSQL URI with `?replication=database` | Required |
| `CDC_DEST_TYPE` | `MySQL`, `SqlServer`, or `SQLite` | Required |
| `CDC_DEST_URI` | Destination connection string | Required |
| `CDC_REPLICATION_SLOT` | Replication slot name | Required |
| `CDC_PUBLICATION` | Publication name | Required |
| `CDC_SCHEMA_MAPPING` | Comma-separated `source:dest` pairs (e.g., `public:cdc_db`) | None |
| `CDC_PROTOCOL_VERSION` | Protocol version (1–4) | `1` |
| `CDC_STREAMING_MODE` | Enable streaming transactions (requires v2+) | `false` |
| `CDC_BINARY_MODE` | Binary format for protocol | `false` |
| `CDC_CONNECTION_TIMEOUT` | Connection timeout (seconds) | `30` |
| `CDC_QUERY_TIMEOUT` | Query timeout (seconds) | `60` |
| `CDC_BUFFER_SIZE` | Transaction channel queue capacity | `1000` |
| `CDC_BATCH_SIZE` | Batch size for destination inserts | `1000` |
| `PG2ANY_ENABLE_COMPRESSION` | Enable gzip compression for SQL files | `false` |
| `PG2ANY_METRICS_PORT` | Prometheus HTTP port | `8080` |

### Run with Docker Compose

The [example project](https://github.com/isdaniel/rust_playground/tree/main/pg2any-example) includes a full Docker Compose stack with PostgreSQL, MySQL, the CDC application, and Prometheus:

```bash
git clone https://github.com/isdaniel/rust_playground.git
cd rust_playground/pg2any-example

# Start all services
docker-compose up -d

# Watch CDC logs
docker-compose logs -f cdc_app
```

## Design Decisions Worth Noting

**File-based persistence over in-memory queues** — Using the filesystem as the intermediary between producer and consumer trades some latency for crash safety. If the process is killed, no committed transaction data is lost.

**PreCommitHook for atomic checkpoints** — Executing the LSN checkpoint update inside the same destination transaction as the data changes eliminates an entire class of consistency bugs where the checkpoint and data can diverge.

**Feature-gated compilation** — Database drivers and monitoring are behind Cargo features, so the binary only includes what you actually use. This reduces compile time, binary size, and attack surface.

**Transaction segmentation at 64 MB** — Large transactions (e.g., bulk imports) are split across multiple files to prevent unbounded memory and disk usage.

## Testing

pg2any has 104+ tests across 16 test files, covering:

- Integration tests for all three destination types
- Streaming transaction correctness
- Compression and large file handling
- WHERE clause generation for UPDATE/DELETE with various replica identity configurations
- Position tracking for crash recovery
- Metrics logic

Beyond unit and integration tests, the project runs **chaos testing** in CI — randomly restarting the CDC application during pgbench workloads to validate graceful shutdown and recovery under real conditions.

## Links

- [pg2any source code (GitHub)](https://github.com/isdaniel/pg2any)
- [pg2any_lib on crates.io](https://crates.io/crates/pg2any_lib)
- [Example application](https://github.com/isdaniel/rust_playground/tree/main/pg2any-example)
- [pg_walstream — PostgreSQL replication protocol crate](https://github.com/isdaniel/pg-walstream)
