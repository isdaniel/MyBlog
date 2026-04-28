---
title: "pg_pidstat: Real-Time Per-Backend CPU, Memory, and I/O Monitoring for PostgreSQL"
date: 2026-04-27 10:00:00
tags: [Rust, PostgreSQL, pgrx, Monitoring, Performance-Tuning]
categories: [Rust, PostgreSQL, Monitoring]
keywords: pg_pidstat,PostgreSQL-monitoring,per-backend-CPU,PostgreSQL-memory,PostgreSQL-IO,pgrx,Rust-PostgreSQL-extension,pg_stat_activity,process-monitoring,context-switches,PostgreSQL-performance
description: "pg_pidstat is a Rust-based PostgreSQL extension that adds real-time per-backend CPU, memory, I/O, and context switch monitoring via a single SQL view."
lang: en
---

# pg_pidstat: Real-Time Per-Backend CPU, Memory, and I/O Monitoring for PostgreSQL

When a PostgreSQL server slows down, the first question is usually: **which backend is consuming resources?** `pg_stat_activity` tells you what each backend is doing, but not how much CPU, memory, or disk I/O it uses. You end up jumping between `top`, `pidstat`, and `pg_stat_activity`, manually correlating PIDs.

[pg_pidstat](https://github.com/isdaniel/pg_pidstat) solves this by embedding OS-level process metrics directly into PostgreSQL. A single SQL view gives you per-backend CPU percentage, memory consumption, I/O throughput, and context switch rates — all joined with the connection context you already know from `pg_stat_activity`.

## The Problem: Blind Spots in PostgreSQL Monitoring

PostgreSQL's built-in statistics views (`pg_stat_activity`, `pg_stat_user_tables`, `pg_stat_io`) provide query-level and table-level insights, but they lack **process-level OS metrics**. When you need to answer questions like:

- Which backend is burning 100% CPU?
- Is that long-running query memory-hungry or I/O-bound?
- Are context switches causing latency spikes?

You typically resort to external tools — `pidstat`, `htop`, or custom `/proc` scrapers — and then manually join their output with `pg_stat_activity` by PID. This workflow is tedious, error-prone, and impossible to automate in pure SQL.

pg_pidstat eliminates that gap entirely.

## Key Features

- **Per-backend CPU usage** as a percentage of total system capacity
- **Memory tracking** — both percentage and absolute MB (resident set size)
- **I/O throughput** — read/write bytes per second and IOPS
- **I/O wait detection** — flags backends blocked on disk
- **Context switch rates** — voluntary and non-voluntary, per second
- **Full `pg_stat_activity` integration** — all standard columns (pid, datname, usename, state, query, etc.) included
- **Background worker sampling** — metrics updated every 1 second automatically
- **Lock-free reads** — minimal contention with brief exclusive writes only during sampling

## Architecture

pg_pidstat is built with [pgrx](https://github.com/pgcentralfoundation/pgrx) (Rust) and consists of four modules:

```
┌─────────────────────────────────────────────────────┐
│                    SQL Interface                     │
│          pg_pidstat view + helper functions           │
│                    (activity.rs)                      │
└──────────────────────┬──────────────────────────────┘
                       │  per-second deltas
┌──────────────────────▼──────────────────────────────┐
│               Background Worker                      │
│        Samples all backends every 1 second           │
│                   (bgworker.rs)                      │
└──────────────────────┬──────────────────────────────┘
                       │  raw counters
┌──────────────────────▼──────────────────────────────┐
│           Double-Buffered Shared Memory              │
│        Lock-free reads, up to 1024 backends          │
│                    (shmem.rs)                         │
└──────────────────────┬──────────────────────────────┘
                       │  reads /proc/[pid]/*
┌──────────────────────▼──────────────────────────────┐
│               /proc Filesystem Parser                │
│   /proc/[pid]/stat, statm, io, status, /proc/meminfo│
│                 (proc_stats.rs)                      │
└─────────────────────────────────────────────────────┘
```

**How it works:**

1. A background worker wakes every second and iterates over all PostgreSQL backend PIDs.
2. For each PID, it reads `/proc/[pid]/stat`, `/proc/[pid]/statm`, `/proc/[pid]/io`, and `/proc/[pid]/status` to collect raw CPU ticks, memory pages, I/O byte counters, and context switch counts.
3. The raw readings are stored in a double-buffered shared memory region. The double-buffer design lets SQL queries read the previous-second snapshot without blocking the worker's current write.
4. When you query the `pg_pidstat` view, the `activity` module computes per-second deltas (rates) from the raw counters and joins them with `pg_stat_activity` columns.

This design ensures **zero lock contention on reads** — the only exclusive lock is a brief window when the background worker swaps the active buffer.

## Metrics Reference

The `pg_pidstat` view includes all standard `pg_stat_activity` columns plus these monitoring columns:

| Column | Type | Description |
|--------|------|-------------|
| `cpu_percent` | `float8` | CPU usage as % of total system capacity |
| `memory_percent` | `float8` | Resident memory as % of total system RAM |
| `memory_usage_mb` | `float8` | Resident memory in megabytes |
| `io_read_bytes_per_sec` | `float8` | Disk read throughput (bytes/sec) |
| `io_write_bytes_per_sec` | `float8` | Disk write throughput (bytes/sec) |
| `io_read_ops_per_sec` | `float8` | Read IOPS |
| `io_write_ops_per_sec` | `float8` | Write IOPS |
| `io_wait` | `bool` | `true` if the process is in disk sleep state |
| `voluntary_ctxt_switches_per_sec` | `float8` | Voluntary context switches per second |
| `nonvoluntary_ctxt_switches_per_sec` | `float8` | Non-voluntary context switches per second |

## Usage Examples

### Find CPU-Heavy Backends

```sql
SELECT pid, datname, usename, state, query,
       cpu_percent, memory_percent, memory_usage_mb
FROM pg_pidstat
ORDER BY cpu_percent DESC;
```

### Identify I/O-Intensive Queries

```sql
SELECT pid, usename, state, query,
       io_read_bytes_per_sec,
       io_write_bytes_per_sec,
       io_read_ops_per_sec,
       io_write_ops_per_sec,
       io_wait
FROM pg_pidstat
WHERE state = 'active'
ORDER BY io_read_bytes_per_sec + io_write_bytes_per_sec DESC;
```

### Detect Context Switch Hotspots

High non-voluntary context switches indicate CPU contention — too many backends fighting for CPU time:

```sql
SELECT pid, usename, query,
       voluntary_ctxt_switches_per_sec,
       nonvoluntary_ctxt_switches_per_sec
FROM pg_pidstat
WHERE state = 'active'
ORDER BY nonvoluntary_ctxt_switches_per_sec DESC;
```

### Full Troubleshooting Dashboard

Combine all metrics for a comprehensive view of backend resource usage:

```sql
SELECT pid, datname, usename, state,
       left(query, 80) AS query_preview,
       round(cpu_percent::numeric, 2) AS cpu_pct,
       round(memory_usage_mb::numeric, 1) AS mem_mb,
       round((io_read_bytes_per_sec / 1024 / 1024)::numeric, 2) AS read_mb_s,
       round((io_write_bytes_per_sec / 1024 / 1024)::numeric, 2) AS write_mb_s,
       io_wait,
       round(voluntary_ctxt_switches_per_sec::numeric, 0) AS vol_cs,
       round(nonvoluntary_ctxt_switches_per_sec::numeric, 0) AS nvol_cs
FROM pg_pidstat
WHERE state = 'active'
ORDER BY cpu_percent DESC;
```

### Monitoring Over Time with pg_cron

Pair pg_pidstat with [pg_cron](https://github.com/citusdata/pg_cron) to build a historical resource usage table:

```sql
CREATE TABLE backend_metrics_history (
    captured_at timestamptz DEFAULT now(),
    pid int,
    datname name,
    usename name,
    state text,
    cpu_percent float8,
    memory_usage_mb float8,
    io_read_bytes_per_sec float8,
    io_write_bytes_per_sec float8
);

-- Sample every 10 seconds via pg_cron
SELECT cron.schedule('backend-metrics', '10 seconds',
$$
INSERT INTO backend_metrics_history
    (pid, datname, usename, state, cpu_percent, memory_usage_mb,
     io_read_bytes_per_sec, io_write_bytes_per_sec)
SELECT pid, datname, usename, state, cpu_percent, memory_usage_mb,
       io_read_bytes_per_sec, io_write_bytes_per_sec
FROM pg_pidstat WHERE state = 'active';
$$);
```

## Why pg_pidstat Over External Monitoring?

| Aspect | External tools (pidstat, top) | pg_pidstat |
|--------|-------------------------------|------------|
| PID-to-query mapping | Manual correlation | Automatic (joined with `pg_stat_activity`) |
| Query interface | Shell parsing / custom scripts | Standard SQL |
| Alerting integration | Requires glue code | Use any SQL-based alerting |
| Historical storage | External time-series DB | `INSERT INTO ... SELECT` from the view |
| Granularity | Per-process only | Per-backend with database context |
| Deployment | Agent on every host | PostgreSQL extension — no extra process |

The key advantage is **context**: knowing that PID 12345 uses 90% CPU is useful, but knowing it's the `analytics` user running a sequential scan on the `orders` table in the `production` database is actionable.

## Performance Design

pg_pidstat is designed for minimal overhead in production:

- **Release-mode optimization**: `opt-level = 3`, fat LTO, single codegen unit
- **Lock-free reads**: Double-buffered shared memory means `SELECT` from the view never blocks
- **Brief exclusive writes**: Only during the buffer swap (microseconds)
- **Bounded memory**: Fixed-size shared memory for up to 1024 backends
- **1-second sampling**: Background worker reads `/proc` once per second — negligible system load

## Conclusion

pg_pidstat brings OS-level process monitoring into PostgreSQL itself. Instead of correlating PIDs across `top`, `pidstat`, and `pg_stat_activity`, you get CPU, memory, I/O, and context switch metrics in a single SQL view — with full connection context attached.

For anyone running PostgreSQL on Linux and needing to quickly identify resource-heavy backends, pg_pidstat turns a multi-tool investigation into one query.

## References

- [pg_pidstat GitHub Repository](https://github.com/isdaniel/pg_pidstat)
- [pgrx — Rust Framework for PostgreSQL Extensions](https://github.com/pgcentralfoundation/pgrx)
- [PostgreSQL pg_stat_activity Documentation](https://www.postgresql.org/docs/current/monitoring-stats.html#MONITORING-PG-STAT-ACTIVITY-VIEW)
