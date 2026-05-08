---
title: "pg_dbmigrator: Near-Zero-Downtime PostgreSQL Migration with Online Mode"
date: 2026-05-04 00:00:00
tags: [Rust, PostgreSQL, logical-replication, migration, CDC]
categories: [Rust, PostgreSQL, logical-replication]
keywords: pg_dbmigrator,PostgreSQL,migration,online-migration,logical-replication,pg_dump,pg_restore,Rust,zero-downtime,cutover,CDC
description: "A hands-on guide to pg_dbmigrator, a Rust CLI for migrating PostgreSQL databases — covering offline dump/restore and the online logical-replication mode for near-zero-downtime cutovers."
lang: en
---

# pg_dbmigrator: Near-Zero-Downtime PostgreSQL Migration with Online Mode

[pg_dbmigrator](https://github.com/isdaniel/pg_dbmigrator) is a Rust-based CLI and library for moving PostgreSQL databases between two endpoints. It supports two strategies under one tool:

- **Offline mode** — a one-shot `pg_dump` → `pg_restore`, suitable for maintenance windows.
- **Online mode** — a streaming pipeline built on PostgreSQL's logical replication that copies the initial snapshot, then continuously applies WAL changes until you trigger cutover.

If you've ever had to migrate a busy PostgreSQL database between hosts, regions, or cloud providers (on-prem → RDS, RDS → Aurora, Azure → AWS, major-version upgrades, etc.), the online mode is what makes pg_dbmigrator interesting: the source database stays writable during the entire copy, and downtime is reduced to the few seconds it takes to flip the application's connection string.

This post walks through how the tool works, how to operate it end-to-end, and what to watch for in production.

## Why Another Migration Tool?

PostgreSQL ships with the building blocks — `pg_dump`, `pg_restore`, `CREATE PUBLICATION`, `CREATE SUBSCRIPTION`, replication slots — but stitching them together correctly is surprisingly easy to get wrong. Common mistakes:

- Dumping *before* creating the slot, so you have no consistent starting LSN.
- Creating the slot *after* the dump, missing changes that occurred during the dump.
- Forgetting to use `EXPORT_SNAPSHOT` so the dump and the replication start point don't align.
- Cutting over while the subscriber is still lagging behind, losing writes.

pg_dbmigrator encodes the correct order as a state machine, surfaces lag metrics, and lets the operator drive the cutover when ready.

## Migration Modes at a Glance

### Offline mode — one shot, with downtime

The source must be quiesced (writes stopped) before the dump starts. Anything written after the dump begins will be lost. The whole migration is a single linear pipe:

```
  ┌────────┐   pg_dump    ┌──────┐   pg_restore   ┌────────┐
  │ Source │ ───────────▶ │ Dump │ ─────────────▶ │ Target │
  └────────┘              └──────┘                └────────┘
   (writes stopped for the entire duration)
```

Downtime ≈ time to dump + time to restore. Simple, but every minute is user-visible.

### Online mode — copy + replay, cutover on demand

Two things run back-to-back on the same timeline. First, an initial snapshot copy (just like offline). Then, while the target catches up, a logical-replication stream keeps replaying every change that happened on the source after the snapshot — including writes that arrived **during** the dump. The source stays writable the whole time.

```
            Phase 1: initial copy
  ┌────────┐  snapshot dump   ┌────────┐
  │ Source │ ───────────────▶ │ Target │
  └────────┘                  └────────┘
       │  (slot created BEFORE dump,
       │   so we know the exact LSN
       │   the dump corresponds to)
       │
       ▼  Phase 2: streaming catch-up (runs continuously)
  ┌────────┐  WAL changes via             ┌────────┐
  │ Source │  logical replication ─────▶ │ Target │
  └────────┘  (from the slot's LSN)       └────────┘
       │
       │  Source stays writable. Lag shrinks over time.
       │
       ▼  Phase 3: cutover (operator-driven)
   1. Stop app writes on the source
   2. Wait until lag = 0
   3. Press Ctrl+C  →  pg_dbmigrator stops cleanly
   4. Repoint the app at the target
```

The trick that makes this work: the replication slot is created **before** the dump and exports a snapshot. The dump uses that snapshot, and the stream starts at the slot's LSN — so the stream picks up *exactly* where the dump left off. No gap, no duplicates.

**Rule of thumb**: pick offline when you can afford a maintenance window the size of (dump + restore). Pick online when you can't.

## Online Mode: The State Machine

Internally pg_dbmigrator runs the online migration as a sequence of phases:

```
Validate → SourceVacuum → PrepareSnapshot → Dump → Restore → Analyze
   → StreamApply → (Lag heartbeat …) → CaughtUp → Cutover
   → SourceCleanup → Complete
```

Each phase has a specific job:

| Phase | What happens |
|---|---|
| **Validate** | Checks connection strings, `wal_level`, replication slot/sender capacity, target reachability. |
| **SourceVacuum** | Runs `VACUUM ANALYZE` on the source to reclaim dead tuples and refresh planner statistics before the dump. Skip with `--skip-source-vacuum`. |
| **PrepareSnapshot** | Creates the logical replication slot with `EXPORT_SNAPSHOT`. Streaming is deferred until after the dump completes; the exported snapshot ID is what makes the dump consistent with the slot's starting LSN. |
| **Dump** | Runs `pg_dump --snapshot=<exported_id>` so the dump reflects the database state *exactly* at the slot's starting LSN. |
| **Restore** | `pg_restore` into the target. Parallelized with `--jobs` and split-sections (indexes rebuilt in parallel) by default. |
| **Analyze** | Runs `ANALYZE` on the target so the first application queries have fresh statistics. Skip with `--skip-analyze`. |
| **StreamApply** | Starts `START_REPLICATION` from the slot's LSN and applies decoded changes onto the target. |
| **Lag heartbeat** | Polls `pg_current_wal_flush_lsn()` on the source on a tunable interval, logs the delta against the receiver/applied LSN. |
| **CaughtUp** | Fires once lag falls below `--lag-threshold-bytes`, signalling the operator that cutover is safe. The threshold is **advisory only** — it does not auto-trigger cutover. |
| **Cutover** | Triggered by SIGINT (Ctrl+C). Flushes the final LSN feedback, syncs sequences on the target, then disables and drops the subscription. |
| **SourceCleanup** | After cutover, drops auto-created publications and the replication slot on the source. Failures are logged as warnings but don't abort. |

The key invariant: the slot is created **before** the dump, and the dump uses the slot's exported snapshot. That way the WAL stream picks up exactly where the dump ended — no gap, no overlap.

## Installation

pg_dbmigrator is published on crates.io:

```bash
cargo install pg_dbmigrator
pg_dbmigrator --help
```

Or build from source:

```bash
git clone https://github.com/isdaniel/pg_dbmigrator
cd pg_dbmigrator
cargo install --path crates/pg_dbmigrator-cli
```

You also need `pg_dump` and `pg_restore` on the `PATH` — the tool shells out to them rather than reimplementing the dump format. Make sure their major version is **>=** the source database's major version, otherwise you'll hit compatibility errors during dump.

## Source Prerequisites

Online mode requires a few server settings on the **source**:

```sql
-- postgresql.conf (requires restart)
ALTER SYSTEM SET wal_level = 'logical';
ALTER SYSTEM SET max_replication_slots = 10;
ALTER SYSTEM SET max_wal_senders = 10;
```

That's it for setup — pg_dbmigrator will **auto-create the publication** (`FOR ALL TABLES`) on first run if it doesn't already exist, and clean it up after cutover. If you'd rather manage the publication yourself (e.g. to scope it to a subset of tables), pre-create it and pass `--no-auto-create-publication`:

```sql
CREATE PUBLICATION pg_dbmigrator_pub FOR TABLE schema.t1, schema.t2;
```

The connecting role needs `REPLICATION` and the ability to read every table in the publication. On managed services:

- **AWS RDS**: set `rds.logical_replication = 1` in the parameter group, then reboot.
- **Azure Database for PostgreSQL**: enable the `logical` `wal_level` server parameter.
- **Google Cloud SQL**: enable `cloudsql.logical_decoding`.

The **target** doesn't need `wal_level = logical` unless you plan to chain replication out of it.

### Resource Lifecycle

By default, pg_dbmigrator owns the resources it creates and cleans them up when the migration finishes. Override the cleanup if you need the resource to outlive the migration:

| Resource | Created by | Default cleanup | Override |
|---|---|---|---|
| Publication | Auto-created if missing | Dropped if auto-created | `--no-auto-create-publication` |
| Replication slot | Always by migrator | Dropped after cutover | `--keep-slot` |
| Subscription | Always by migrator | Dropped after cutover | `--keep-subscription` |

## Offline Mode: the Simple Case

```bash
pg_dbmigrator \
  --mode offline \
  --source 'postgres://user:pw@src.example.com:5432/appdb' \
  --target 'postgres://user:pw@dst.example.com:5432/appdb' \
  --jobs 4 \
  --drop-target-first
```

What this does:

1. Drops the target database contents first (`--drop-target-first`).
2. Runs `pg_dump` against the source.
3. Pipes into `pg_restore` with 4 parallel workers.
4. Exits.

Use it for dev/staging clones, small databases, or when an outage window is acceptable.

## Online Mode: the Full Workflow

A typical online migration command:

```bash
pg_dbmigrator \
  --mode online \
  --source 'postgres://user:pw@src.example.com:5432/appdb' \
  --target 'postgres://user:pw@dst.example.com:5432/appdb' \
  --slot-name pg_dbmigrator_slot \
  --publication pg_dbmigrator_pub \
  --subscription-name pg_dbmigrator_sub \
  --jobs 4 \
  --lag-threshold-bytes 8192 \
  --cutover-poll-secs 5
```

Walking through what each flag controls:

| Flag | Purpose |
|---|---|
| `--mode online` | Selects the streaming pipeline. |
| `--source` / `--target` | Standard libpq connection strings. |
| `--slot-name` | Name of the logical replication slot created on the source. Pick something recognizable so you can clean it up if the migration is aborted. |
| `--publication` | Publication name. Defaults to `pg_dbmigrator_pub`; auto-created `FOR ALL TABLES` if missing. |
| `--subscription-name` | Name pg_dbmigrator gives the subscription it creates on the target. |
| `--jobs` | Parallelism for the initial `pg_restore`. Auto-detected from CPU count and clamped to `[1, 8]` if omitted. |
| `--lag-threshold-bytes` | When the gap between source flush LSN and applied LSN drops below this, the tool emits a "ready to cut over" signal. **Advisory only** — it does not auto-trigger cutover. |
| `--cutover-poll-secs` | How often the lag heartbeat polls `pg_current_wal_flush_lsn()`. |

Useful additional flags:

- `--drop-target-first` — recreate the target schema cleanly. Necessary on most fresh runs.
- `--no-auto-create-publication` — skip auto-creation; use a publication you manage yourself (also skips its cleanup).
- `--keep-slot` / `--keep-subscription` — leave the slot or subscription in place after cutover instead of dropping them. Handy for keeping a rollback window.
- `--no-sequence-sync` — skip the automatic `setval()` pass at cutover. Use when the target role lacks the privileges; you'll need to advance sequences manually.
- `--exclude-schema` / `--exclude-table` — repeat to omit specific schemas or tables from the dump.
- `--skip-source-vacuum` / `--skip-analyze` — disable the pre-dump `VACUUM ANALYZE` on the source or the post-restore `ANALYZE` on the target. Useful when the source is already well-vacuumed or when you want to control the maintenance window yourself.
- `--dump-compress` — archive compression spec. Defaults to `lz4:1`; alternatives include `zstd:3` or `none`.
- `--no-split-sections` — disable parallel section restore. Split sections are 30–60% faster on index-heavy schemas, so only flip this off if the parallel restore is misbehaving.
- `--allow-restore-errors` — treat `pg_restore` errors as warnings. Useful when the target is a managed service that reserves extension names (Azure-reserved extensions, missing `pg_cron`, etc.).

### What You'll See in the Terminal

Once `StreamApply` starts, the tool prints periodic heartbeats:

```
[INFO] StreamApply: replication lag 1,245,184 bytes
       (source LSN 0/1A2B3C4D, received LSN 0/1A1F0000, applied LSN 0/1A1E8000)
[INFO] StreamApply: replication lag 524,288 bytes
       (source LSN 0/1A2C1000, received LSN 0/1A2B9000, applied LSN 0/1A2B8000)
[INFO] StreamApply: replication lag 4,096 bytes
       (source LSN 0/1A2D5000, received LSN 0/1A2D4000, applied LSN 0/1A2D4000)
[INFO] CaughtUp: lag below 8,192 bytes — safe to cut over
```

The lag is the byte distance between the source's current flush LSN and the target's applied LSN. Watch it converge before cutting over.

### Driving the Cutover

Cutover is **operator-driven**, not automatic. This is intentional — only you know when the application is in a state where it can be flipped. The flow:

1. Wait for `CaughtUp` to appear (or for the lag to be acceptable).
2. **Stop application writes to the source** (put the app in maintenance, revoke writes, or fail over the load balancer).
3. Wait one more heartbeat to confirm lag is `0` bytes.
4. Press **Ctrl+C** (single SIGINT). pg_dbmigrator:
   - Stops the apply loop at the current LSN and flushes the final feedback message.
   - Syncs sequences on the target via `setval()` (skip with `--no-sequence-sync`).
   - Disables and drops the subscription on the target (unless `--keep-subscription`).
   - Drops the replication slot and any auto-created publication on the source (unless `--keep-slot` or `--no-auto-create-publication`).
   - Exits cleanly.
5. Repoint the application's connection string to the target.

A second Ctrl+C is an escape hatch — if shutdown is stuck, hitting it again forces termination. Use only as a last resort, since the slot may be left behind on the source (drop manually with `SELECT pg_drop_replication_slot('pg_dbmigrator_slot');`).

## A Realistic Online Migration Recipe

Putting it together, here's the sequence I'd run for a real migration from on-prem to RDS:

```bash
# 1. On the source, one-time setup
psql "$SOURCE" <<'SQL'
ALTER SYSTEM SET wal_level = 'logical';
SQL
# Restart source PostgreSQL.
# (No need to pre-create the publication — pg_dbmigrator will auto-create
#  pg_dbmigrator_pub FOR ALL TABLES on first run, and clean it up at cutover.)

# 2. Kick off the migration in a tmux/screen session you can leave running.
pg_dbmigrator \
  --mode online \
  --source "$SOURCE" \
  --target "$TARGET" \
  --slot-name pg_dbmigrator_slot \
  --publication pg_dbmigrator_pub \
  --subscription-name pg_dbmigrator_sub \
  --jobs 8 \
  --lag-threshold-bytes 16384 \
  --cutover-poll-secs 5 \
  --drop-target-first

# 3. (In another terminal) sanity-check row counts as the dump completes,
#    and watch lag heartbeats.

# 4. When CaughtUp fires and you're ready:
#      a. Put app in maintenance mode (stop writes to source).
#      b. Wait until lag heartbeat shows 0 bytes.
#      c. Ctrl+C the pg_dbmigrator process — it will sync sequences, drop
#         the subscription, and clean up the slot/publication on the source.
#      d. Update DNS / connection string to point at TARGET.
#      e. Bring app out of maintenance.

# 5. Cleanup on the source — by default pg_dbmigrator drops the slot and
#    the auto-created publication itself. Only run these if you used
#    --keep-slot / --no-auto-create-publication, or aborted the run:
psql "$SOURCE" -c "SELECT pg_drop_replication_slot('pg_dbmigrator_slot');"
psql "$SOURCE" -c "DROP PUBLICATION pg_dbmigrator_pub;"
```

Total user-visible downtime is steps 4a–4e, which is typically tens of seconds.

## Operational Gotchas

A few things that bite people the first time:

**Replication slots hold WAL**. If you start an online migration and abandon it, the slot will keep the source's WAL pinned indefinitely, eventually filling the source's disk. A clean Ctrl+C drops the slot for you, but if the process is killed or crashes, drop the slot manually (`pg_drop_replication_slot`).

**Sequences are synced automatically at cutover**. pg_dbmigrator runs `setval()` on every sequence in the included schemas as part of cutover, so you don't need the old "advance every sequence by hand" ritual. Per-sequence failures (typically a missing privilege on the target role) are logged as warnings but won't abort cutover. If your target role can't `setval`, pass `--no-sequence-sync` and run the SQL yourself:

```sql
SELECT setval('public.users_id_seq',
              (SELECT max(id) FROM public.users));
```

**DDL during migration is not replicated.** If someone runs an `ALTER TABLE` on the source mid-stream, the target won't see it and apply will eventually fail when a row references the new column. Freeze schema changes for the duration of the migration. If a DDL change really must happen, you'll need to refresh the publication and restart the migration.

**Restore errors on managed targets.** Azure reserves extension names; `pg_cron` is unavailable on most managed services; some superuser-only objects can't be restored by an unprivileged role. `--allow-restore-errors` lets the migration proceed, but inspect the warnings — anything important needs to be applied manually.

**Custom column transforms aren't supported.** The streaming apply binds replicated values as text and casts them server-side. If you need to transform data during migration (e.g. re-encrypt a column), do it before or after, not inline.

**Major-version differences.** If source is PG14 and target is PG16, run `pg_dump`/`pg_restore` from the **higher** version's binaries. pg_dbmigrator inherits whatever's on the `PATH`.

## When to Pick Offline vs. Online

| Situation | Mode |
|---|---|
| Database is small (< few GB) and you have a maintenance window | Offline |
| Dev / staging clones | Offline |
| Production database, can't take more than a few seconds of write downtime | Online |
| Cross-cloud or cross-region migrations | Online |
| Major-version upgrade on a live system | Online |
| Source can't be set to `wal_level = logical` | Offline (no choice) |

## Summary

pg_dbmigrator wraps a careful, correct online migration recipe — slot-before-dump, snapshot-consistent copy, streaming apply, operator-driven cutover — into a single Rust CLI. For straightforward jobs the offline mode is enough; for production cutovers where downtime matters, the online mode reduces the outage to the moment you press Ctrl+C.

The most important habits when operating it:

1. Always confirm `wal_level = logical` on the source before starting.
2. Watch the lag heartbeats and only cut over from a `CaughtUp` state with `0` bytes lag and writes stopped — the threshold is advisory, not automatic.
3. Let the tool exit cleanly via Ctrl+C so it can drop the slot, the auto-created publication, and sync sequences for you. If the process dies hard, drop the slot manually so abandoned WAL doesn't fill the source's disk.
4. Freeze schema changes for the duration of the migration — DDL isn't replicated.

## References

- [pg_dbmigrator GitHub Repository](https://github.com/isdaniel/pg_dbmigrator)
- [PostgreSQL Logical Replication Documentation](https://www.postgresql.org/docs/current/logical-replication.html)
- [PostgreSQL Replication Slots](https://www.postgresql.org/docs/current/logicaldecoding-explanation.html#LOGICALDECODING-REPLICATION-SLOTS)
- [pg-walstream: PostgreSQL WAL Streaming in Rust](https://isdaniel.github.io/pg-walstream-rust-postgresql-wal-streaming/)
- [PostgreSQL WAL (Write-Ahead Logging) mechanism](https://isdaniel.github.io/postgresql-wal-introduce/)
