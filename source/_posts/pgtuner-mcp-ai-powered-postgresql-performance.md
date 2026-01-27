---
title: AI-Powered PostgreSQL Performance Tuning with MCP - Introducing pgtuner_mcp
date: 2025-01-13 10:30:00
tags: [Python, PostgreSQL, MCP, AI, Performance-Tuning, Database-Optimization]
categories: [Python, PostgreSQL, AI, Performance]
keywords: Python, PostgreSQL, MCP, Model-Context-Protocol, AI-tuning, performance-optimization, database-health, index-tuning
description: An MCP server that delivers AI-driven PostgreSQL performance analysis, tuning advice, and health checks.
lang: en
---

# AI-Powered PostgreSQL Performance Tuning with MCP - Introducing pgtuner_mcp

Database performance optimization is one of the most critical yet challenging aspects of maintaining production systems. Identifying slow queries, optimizing indexes, and monitoring database health requires deep expertise and constant vigilance. Today, I'm excited to introduce **pgtuner_mcp**, a Model Context Protocol (MCP) server that brings AI-powered PostgreSQL performance tuning capabilities directly into your development workflow.

## What is pgtuner_mcp?

**pgtuner_mcp** is an intelligent PostgreSQL performance analysis server built on the Model Context Protocol (MCP). It bridges the gap between AI assistants (like Claude) and your PostgreSQL database, enabling natural language interactions for complex database optimization tasks.

[GitHub Repository](https://github.com/isdaniel/pgtuner_mcp)

### Key Capabilities

- **Intelligent Query Analysis**: Identify slow queries with detailed statistics from `pg_stat_statements`
- **AI-Powered Index Recommendations**: Get smart indexing suggestions based on actual workload patterns
- **Hypothetical Index Testing**: Test indexes without creating them using HypoPG
- **Comprehensive Health Checks**: Monitor connections, cache efficiency, locks, and replication
- **Bloat Detection**: Identify and quantify table/index bloat for maintenance
- **Vacuum Monitoring**: Track vacuum operations and autovacuum effectiveness
- **I/O Analysis**: Analyze disk read/write patterns and identify bottlenecks
- **Configuration Review**: Get recommendations for memory, checkpoint, and connection settings

## Architecture Overview

pgtuner_mcp leverages several PostgreSQL extensions and Python libraries to provide comprehensive analysi
```
┌─────────────────┐
│  AI Assistant   │
│  (Claude, etc)  │
└────────┬────────┘
         │ MCP Protocol
         ▼
┌─────────────────┐    ┌──────────────────┐
│  pgtuner_mcp    │───▶│   PostgreSQL     │
│  (Python MCP    │    │   + Extensions   │
│   Server)       │    │  - pg_stat_      │
└─────────────────┘    │    statements    │
         │              │  - hypopg        │
         │              │  - pgstattuple   │
         ▼              └──────────────────┘
┌─────────────────┐
│  Analysis &     │
│  Recommendations│
└─────────────────┘
```

### Core Components

1. **MCP Server**: Provides tools, prompts, and resources via Model Context Protocol
2. **Query Analyzer**: Parses and analyzes SQL using `pglast` library
3. **Performance Metrics**: Collects statistics from PostgreSQL system views
4. **AI Recommendations**: Generates intelligent suggestions based on workload patterns
5. **Multiple Transport Modes**: Supports stdio, SSE, and streamable HTTP

## Installation and Setup

### Prerequisites

Before installing pgtuner_mcp, ensure you have:

- Python 3.10+
- PostgreSQL 12+ (recommended: 14+)
- Access to install PostgreSQL extensions

### Quick Installation

```bash
# Install via pip
pip install pgtuner_mcp

# Or using uv (faster)
uv pip install pgtuner_mcp
```

### PostgreSQL Extensions Setup

pgtuner_mcp requires specific PostgreSQL extensions for full functionality:

#### 1. pg_stat_statements (Required)

This extension tracks query execution statistics:

```sql
-- Add to postgresql.conf
shared_preload_libraries = 'pg_stat_statements'
compute_query_id = o
pg_stat_statements.max = 10000
pg_stat_statements.track = top
pg_stat_statements.track_utility = on

-- Restart PostgreSQL, then:
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Verify installation
SELECT * FROM pg_stat_statements LIMIT 1;
```

#### 2. HypoPG (Optional, Recommended)

Enables hypothetical index testing without disk usage:

```sql
CREATE EXTENSION IF NOT EXISTS hypopg;

-- Verify installation
SELECT * FROM hypopg_list_indexes();
```

#### 3. pgstattuple (Optional, for Bloat Detection)

Provides tuple-level statistics for bloat analysis:

```sql
CREATE EXTENSION IF NOT EXISTS pgstattuple;

-- Verify installation
SELECT * FROM pgstattuple('pg_class') LIMIT 1;
```

### User Permissions

Create a dedicated monitoring user with minimal required permissions:

```sql
-- Create monitoring user
CREATE USER pgtuner_monitor WITH PASSWORD 'secure_password';

-- Grant connection and schema access
GRANT CONNECT ON DATABASE your_database TO pgtuner_monitor;
GRANT USAGE ON SCHEMA public TO pgtuner_monitor;

-- Grant read access to user tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pgtuner_monitor;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO pgtuner_monitor;

-- Grant system statistics access (PostgreSQL 10+)
GRANT pg_read_all_stats TO pgtuner_monitor;

-- Grant access to pg_stat_statements
GRANT SELECT ON pg_stat_statements TO pgtuner_monitor;
GRANT SELECT ON pg_stat_statements_info TO pgtuner_monitor;

-- For bloat detection (PostgreSQL 14+)
GRANT pg_stat_scan_tables TO pgtuner_monitor;

-- For HypoPG functions
GRANT SELECT ON hypopg_list_indexes TO pgtuner_monitor;
GRANT EXECUTE ON FUNCTION hypopg_create_index(text) TO pgtuner_monitor;
GRANT EXECUTE ON FUNCTION hypopg_drop_index(oid) TO pgtuner_monitor;
GRANT EXECUTE ON FUNCTION hypopg_reset() TO pgtuner_monitor;
```

## Configuration

### Server Modes

pgtuner_mcp supports three deployment modes:

#### 1. Standard MCP Mode (stdio)

Best for MCP clients like Claude Desktop or Cline:

```bash
# Default mode
python -m pgtuner_mcp

# Explicit stdio mode
python -m pgtuner_mcp --mode stdio
```

**Configuration for Claude Desktop** (`cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "pgtuner_mcp": {
      "command": "python",
      "args": ["-m", "pgtuner_mcp"],
      "env": {
        "DATABASE_URI": "postgresql://pgtuner_monitor:password@localhost:5432/mydb"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

#### 2. HTTP SSE Mode (Legacy Web Applications)

Server-Sent Events for web-based MCP communication:

```bash
# Start SSE server
python -m pgtuner_mcp --mode sse --host 0.0.0.0 --port 8080

# With debug mode
python -m pgtuner_mcp --mode sse --debug
```

**Endpoints**:
- `GET /sse` - SSE connection endpoint
- `POST /messages` - Send messages/requests

#### 3. Streamable HTTP Mode (Recommended for Web)

Modern MCP protocol with single `/mcp` endpoint:

```bash
# Stateful mode (maintains session state)
python -m pgtuner_mcp --mode streamable-http

# Stateless mode (serverless-friendly)
python -m pgtuner_mcp --mode streamable-http --stateless

# Custom host/port
python -m pgtuner_mcp --mode streamable-http --host localhost --port 8080
```

**Configuration**:

```json
{
  "mcpServers": {
    "pgtuner_mcp": {
      "type": "http",
      "url": "http://localhost:8080/mcp"
    }
  }
}
```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URI` | PostgreSQL connection string | Yes |
| `PGTUNER_EXCLUDE_USERIDS` | Comma-separated user OIDs to exclude | No |

**Connection String Format**:
```
postgresql://user:password@host:port/database
```



## Available Tools

pgtuner_mcp provides 15+ specialized tools organized into categories:

### Performance Analysis Tools

| Tool | Description |
|------|-------------|
| `get_slow_queries` | Retrieve slow queries with detailed statistics (time, calls, cache hit ratio) |
| `analyze_query` | Analyze execution plans with EXPLAIN ANALYZE and automated issue detection |
| `get_table_stats` | Get table statistics: size, row counts, dead tuples, access patterns |
| `analyze_disk_io_patterns` | Analyze I/O patterns, identify hot tables and bottlenecks |

### Index Tuning Tools

| Tool | Description |
|------|-------------|
| `get_index_recommendations` | AI-powered index recommendations based on workload analysis |
| `explain_with_indexes` | Test hypothetical indexes without creating them |
| `manage_hypothetical_indexes` | Create, list, drop, or reset HypoPG hypothetical indexes |
| `find_unused_indexes` | Find unused and duplicate indexes for cleanup |

### Database Health Tools

| Tool | Description |
---|-------------|
| `check_database_health` | Comprehensive health check with scoring |
| `get_active_queries` | Monitor active queries and find long-running transactions |
| `analyze_wait_events` | Identify I/O, lock, or CPU bottlenecks |
| `review_settings` | Review PostgreSQL configuration with recommendations |

### Bloat Detection Tools

| Tool | Description |
|------|-------------|
| `analyze_table_bloat` | Analyze table bloat using pgstattuple extension |
| `analyze_index_bloat` | Analyze B-tree index bloat (also supports GIN/Hash) |
| `get_bloat_summary` | Comprehensive bloat overview with maintenance priorities |

### Vacuum Monitoring Tools

| Tool | Description |
|------|-------------|
| `monitor_vacuum_progress` | Track VACUUM, VACUUM FULL, and autovacuum operations |

## Docker Deployment

pgtuner_mcp is available as a Docker image for easy deployment:

```bash
# Pull the image
docker pull dog830228/pgtuner_mcp

# Run in streamable HTTP mode (recommended)
docker run -p 8080:8080 \
  -e DATABASE_URI=postgresql://user:pass@host:5432/db \
  dog830228/pgtuner_mcp --mode streamable-http

# Run in stateless mode (serverless-friendly)
docker run -p 8080:8080 \
  -e DATABASE_URI=postgresql://user:pass@host:5432/db \
  dog830228/pgtuner_mcp --mode streamable-http --stateless

# Run in stdio mode for MCP clients
docker run -i \
  -e DATABASE_URI=postgresql://user:pass@host:5432/db \
  dog830228/pgtuner_mcp --mode stdio
```

## Real-World Use Cases

### 1. Slow Query Investigation

**Scenario**: Application experiencing slow response times.

**Workflow**:
```
User: "Find the slowest queries in my database"
AI + pgtuner_mcp:
  1. Calls get_slow_queries(limit=10, order_by="total_time")
  2. Identifies top 3 problematic queries
  3. Calls analyze_query() for each
  4. Detects sequential scans and missing indexes
  5. Calls get_index_recommendations()
  6. Provides CREATE INDEX statements with impact estimates
```

### 2. Index Optimization

**Scenario**: Database growing, need to optimize indexes.

**Workflow**:
```
User: "Help me optimize my database indexes"
AI + pgtuner_mcp:
  1. Calls find_unused_indexes() to identify cleanup candidates
  2. Calls get_index_recommendations() for new index suggestions
  3. Calls explain_with_indexes() to test hypothetical indexes
  4. Estimates storage savings and performance improvements
  5. Provides prioritized action plan
```

### 3. Health Check Before Production Deploy

**Scenario**: Pre-deployment database health validation.

**Workflow**:
```
User: "Is my database ready for production traffic?"
AI + pgtuner_mcp:
  1. Calls check_database_health(verbose=True)
  2. Analyzes connection pool capacity
  3. Checks cache hit ratios
  4. Reviews vacuum and autovacuum status
  5. Analyzes wait events
  6. Reviews configuration settings
  7. Provides comprehensive health report with recommendations
```

### 4. Performance Regression Investigation

**Scenario**: Performance degraded after recent changes.

**Workflow**:
```
User: "Why is my database slower than last week?"
AI + pgtuner_mcp:
  1. Calls get_table_stats() to identify growth patterns
  2. Calls analyze_disk_io_patterns() for I/O bottlenecks
  3. Calls get_bloat_summary() to detect table/index bloat
  4. Calls monitor_vacuum_progress() to check maintenance
  5. Calls analyze_wait_events() to find resource contention
  6. Identifies root causes and provides remediation steps
```

## Performance Considerations

### Extension Overhead

| Extension | Performance Impact | Recommendation |
|-----------|-------------------|----------------|
| `pg_stat_statements` | Low (~1-2%) | Always enable |
| `track_io_timing` | Low-Medium (~2-5%) | Enable in production, test first |
| `track_functions = all` | Low | Enable for function-heavy workloads |
| `pgstattuple` functions | Varies by table size | Use `_approx` for large tables |
| `HypoPG` | Zero (in-memory only) | Safe for all environments |

**Tip**: Use `pg_test_timing` to measure timing overhead on your specific hardware:

```sql
SELECT pg_test_timing();
```

### Best Practices

1. **Use Approximate Analysis**: For large tables (>5GB), use `pgstattuple_approx` instead of `pgstattuple`
2. **Filter System Users**: Exclude monitoring/replication users using `PGTUNER_EXCLUDE_USERIDS`
3. **Limit Query History**: Configure `pg_stat_statements.max` based on your workload
4. **Regular Maintenance**: Use vacuum monitoring tools to ensure optimal performance
5. **Test Hypothetical Indexes**: Always test with HypoPG before creating real indexes

## Conclusion

pgtuner_mcp represents a paradigm shift in database performance optimization. By combining the power of AI assistants with deep PostgreSQL expertise through the Model Context Protocol, it makes advanced database tuning accessible to developers at all skill levels.

The tool doesn't replace database administrators—it augments their capabilities and democratizes access to expert-level analysis. Whether you're debugging a slow query, planning index strategies, or conducting pre-deployment health checks, pgtuner_mcp provides intelligent, context-aware assistance.

### Key Takeaways

1. **AI-Native Performance Tuning**: Natural language interface to complex database operations
2. **Risk-Free Testing**: HypoPG enables index testing without disk usage
3. **Comprehensive Analysis**: 15+ tools covering queries, indexes, health, bloat, vacuum, and I/O
4. **Flexible Deployment**: stdio, HTTP SSE, or streamable HTTP modes
5. **Production-Ready**: Minimal overhead, proper permissions, comprehensive monitoring

Whether you're a seasoned DBA looking to leverage AI for faster workflows or a developer seeking to understand and optimize database performance, pgtuner_mcp offers a powerful, modern approach to PostgreSQL tuning.

### Resources

- [pgtuner_mcp GitHub Repository](https://github.com/isdaniel/pgtuner_mcp)
- [Model Context Protocol Documentation](https://modelcontextprotocol.io)
- [PostgreSQL Performance Tuning Guide](https://www.postgresql.org/docs/current/performance-tips.html)
- [HypoPG Extension](https://github.com/HypoPG/hypopg)
- [pg_stat_statements Documentation](https://www.postgresql.org/docs/current/pgstatstatements.html)

