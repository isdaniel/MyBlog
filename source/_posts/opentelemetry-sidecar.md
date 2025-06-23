---
title: Instrument Any App Instantly Using OpenTelemetry_SideCar
date: 2025-06-01 22:30:11
tags: [C#,Rust, Sidecar]
categories: [Rust,C#, Sidecar]
keywords: Rust,C#, Sidecar
---

## introduce

If you’ve ever struggled to instrument legacy apps or non-standard services for observability, `OpenTelemetry_SideCar` is here to help. This project offers a **non-intrusive way to export metrics and traces** via **OpenTelemetry** using a **sidecar approach** — no SDK required in your main app.

---

## 🌐 Project Overview

📦 **Repo:** [isdaniel/OpenTelemetry\_SideCar](https://github.com/isdaniel/OpenTelemetry_SideCar)

`OpenTelemetry_SideCar` is a standalone proxy service that collects metrics and traces **outside of your application** and forwards them to a telemetry backend (e.g., Prometheus, Jaeger, or Azure Monitor).

### 💡 Why a Sidecar?

In cloud-native systems, a *sidecar* is a helper container or process that runs alongside your main application. It can observe, extend, or enhance app behavior **without changing application code**. This pattern is ideal for adding **observability** when:

* You can’t modify the original code (e.g., closed-source, legacy binaries).
* You want to centralize telemetry logic.
* You’re aiming for a unified instrumentation strategy.

---

## 🧠 Key Concepts

### 📊 OpenTelemetry

OpenTelemetry is the CNCF-backed observability framework offering a vendor-neutral standard to collect metrics, logs, and traces.

This project leverages:

* **OTLP (OpenTelemetry Protocol)** for data transport
* **Push-based metrics** collection via HTTP endpoints
* **Custom trace generation** from event messages

### 🧱 Sidecar Design Pattern

This service runs in parallel with your main app and exposes lightweight endpoints for:

* Sending **metrics** via `/metrics`
* Sending **traces** via `/trace`

Apps interact with the sidecar using simple HTTP POST requests.

---

## ⚙️ How It Works

## Architecture

The project consists of the following components:

- **.NET Web Application**: A simple web service with custom metrics and tracing- **OpenTelemetry Collector**: Receives telemetry data and exports it to backends
- **Prometheus**: Time-series database for storing and querying metrics- **Jaeger**: Distributed tracing system for monitoring and troubleshooting
- **Grafana**: Visualization and dashboarding platform

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Rust We        │     │                 │     │                 │
│  .NET App       │────▶│  OTel Collector │────▶│  Prometheus     │
│                 │     │                 │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │                        ▲
                                 │                        │
                                 ▼                        │
                        ┌─────────────────┐      ┌────────┴────────┐
                        │                 │      │                 │
                        │  Jaeger         │      │  Grafana        │
                        │                 │      │                 │
                        └─────────────────┘      └─────────────────┘
```

## Features

- Custom metrics using OpenTelemetry Metrics API- Distributed tracing with OpenTelemetry Tracing API
- Nested HTTP calls with context propagation- Prometheus metrics collection
- Jaeger trace visualization- Grafana dashboards for metrics visualization

## Prerequisites

- Docker and Docker Compose
- .NET 9.0 SDK (for local development)

## Getting Started

### Running the Application

Clone the repository:

```
git clone https://github.com/yourusername/OpenTelemetry_SideCar.git
cd OpenTelemetry_SideCar
```

Start the services using Docker Compose:
 ```
docker-compose up -d
```

1. Access the application: Web Application: http://localhost:8080   - Nested Greeting: http://localhost:8080/NestedGreeting?nestlevel=3

### Accessing Observability Tools

- **Prometheus**: http://localhost:9090
  - Query metrics with PromQL  - Example: `greetings_count_total`
- **Jaeger UI**: http://localhost:16686
  - View distributed traces  - Filter by service: `telemetry_example`
- **Grafana**: http://localhost:3000
  - Default credentials: admin/admin  - Pre-configured dashboards for application metrics

## Application Endpoints

- **/** - Returns a simple greeting and increments the greeting counter
- **/NestedGreeting?nestlevel=N** - Creates a chain of N nested HTTP calls, demonstrating trace context propagation


## Configuration Files

- **docker-compose.yml**: Defines all services and their connections- **otel-collector-config.yaml**: Configures the OpenTelemetry Collector
- **prometheus.yml**: Prometheus scraping configuration- **Dockerfile**: Builds the .NET application

## Troubleshooting

### Common Issues

1. **No metrics in Prometheus**:
   - Verify the OpenTelemetry Collector is running: `docker-compose ps`   - Check collector logs: `docker-compose logs otel-collector`
   - Ensure Prometheus is scraping the collector: http://localhost:9090/targets
2. **No traces in Jaeger**:   - Verify Jaeger is running: `docker-compose ps jaeger`
   - Check that OTLP is enabled in Jaeger   - Generate some traces by accessing the application endpoints
3. **Application errors**:
   - Check application logs: `docker-compose logs app`

## Development
### Local Development

To run the application locally:

1. Navigate to the src directory2. Run `dotnet run`
Note: When running locally, you'll need to update the OTLP endpoint in Program.cs to point to your local OpenTelemetry Collector.

### Adding Custom Metrics

1. Create a new meter:
   ```csharp
   var myMeter = new Meter("MyApp.Metrics", "1.0.0");
   ```
2. Create metrics instruments:
   ```csharp
   var myCounter = myMeter.CreateCounter<int>("my.counter", "Count of operations");
   ```
4. Record measurements:
   ```csharp
   myCounter.Add(1);
   ```
5. Register the meter in the OpenTelemetry configuration:
   ```csharp
   metricsProviderBuilder.AddMeter("MyApp.Metrics");
   ```

---

## 📥 Example: Sending Metrics

Suppose your app wants to record a counter metric for user logins. All it needs to do is POST to the sidecar:

```bash
curl -X POST http://localhost:8080/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "name": "user_login_total",
    "kind": "counter",
    "value": 1,
    "attributes": {
      "service": "auth-service",
      "status": "success"
    }
  }'
```

📌 This will be transformed into an OpenTelemetry metric and pushed to your configured OTLP collector.

---

## 📡 Example: Sending Traces

To record a trace span (e.g., for a request to `/api/data`), POST to `/trace`:

```bash
curl -X POST http://localhost:8080/trace \
  -H "Content-Type: application/json" \
  -d '{
    "trace_id": "abc123",
    "span_id": "def456",
    "name": "GET /api/data",
    "kind": "server",
    "start_time": "2024-01-01T00:00:00Z",
    "end_time": "2024-01-01T00:00:01Z",
    "attributes": {
      "http.method": "GET",
      "http.status_code": 200
    }
  }'
```

The sidecar will:

* Create the span
* Set its metadata and timing
* Export it via OTLP to your backend (e.g., Jaeger or Zipkin)

---

## 🛠️ Configuration

Set the following environment variables:

```env
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4317
OTEL_SERVICE_NAME=my-sidecar
OTEL_METRICS_EXPORT_INTERVAL=1000
```

These control how frequently data is flushed and where it's sent.

---

## 🔒 No SDK, No Problem

One of the biggest benefits of `OpenTelemetry_SideCar` is that your main app doesn't need to:

* Link or compile with any OpenTelemetry SDK
* Maintain exporter or collector logic
* Handle telemetry lifecycle

Your app stays clean — just send HTTP!

---

## 🚀 Get Started

```bash
git clone https://github.com/isdaniel/OpenTelemetry_SideCar.git
cd OpenTelemetry_SideCar
cargo run
```

Then, start POSTing traces and metrics from your apps.

---

## 🙌 Final Thoughts

`OpenTelemetry_SideCar` empowers teams to **add observability with zero code changes** to their applications. It's perfect for teams looking to modernize telemetry practices without touching production binaries.

If you're working with mixed environments or maintaining legacy services, give it a try!

> ⭐️ Star the repo: [isdaniel/OpenTelemetry\_SideCar](https://github.com/isdaniel/OpenTelemetry_SideCar)

<! Above information summaries from AI. />