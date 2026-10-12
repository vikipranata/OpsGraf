# OpsGraf

[![Go Version](https://img.shields.io/badge/go-1.24%2B-blue.svg)](https://golang.org)
[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://www.docker.com)
[![RAM Footprint](https://img.shields.io/badge/memory-%3C15MB-success.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()

**OpsGraf** is an ultra-lightweight, high-performance alternative to Grafana built specifically for Prometheus metrics visualization. It features sub-second load times, an idle footprint of ~15 MB RAM, and zero database dependencies.

---

## Highlights

- **Ultra-Lean Resource Usage**: Operates entirely in ~15 MB RAM without SQLite, Postgres, or Redis.
- **Single Self-Contained Binary**: HTML, CSS, JavaScript, and vendored uPlot are embedded directly via Go `embed.FS`.
- **Grafana-Grade Visual Experience**: Canvas 2D time series rendering powered by **uPlot** (~50 KB), synchronized crosshairs (`cursorSync`), multi-series hover tooltips, and unit formatting (`%`, `W`, `°C`, `mV`, `GHz`, `GB`, `RPM`).
- **File-Based Dashboard Storage**: Automatically scans and loads dashboards directly from `./dashboard/*.json` (supporting Grafana Declarative / Scenes schema).
- **Native Prometheus Integration**: Built-in reverse proxy bypassing CORS issues and forwarding PromQL range queries, instant queries, series queries, and label values.
- **Dynamic Template Variables**: Automatically resolves queries like `label_values(node_hwmon_temp_celsius, instance)` into reactive dropdowns.
- **Controls & Auto-Refresh**: Time range switcher (Last 5m to Last 24h) and auto-refresh intervals (5s, 10s, 30s, 1m).

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Web Browser UI                       │
│  - Plus Jakarta Sans + JetBrains Mono Typography       │
│  - EchoHeaders Design Tokens & Animated Hamburger      │
│  - uPlot Multi-Series Time Charts & Synced Cursor      │
│  - Stat Cards & Instant Query KPI Badges               │
└───────────────────────────┬────────────────────────────┘
                            │ REST (/api/v1/*, /api/dashboards)
                            ▼
┌────────────────────────────────────────────────────────┐
│               OpsGraf Server (Go Binary)               │
│  - Single binary (~11 MB)                              │
│  - Embedded UI assets (Zero runtime NPM dependencies)  │
│  - Prometheus Reverse Proxy & CORS Handler             │
│  - Dashboard JSON File Scanner                         │
└───────────────────────────┬────────────────────────────┘
                            │ HTTP
                            ▼
                    Prometheus Server
                 (http://172.16.0.253:9090)
```

---

## Quick Start

### 1. Run from Source (Go)

```bash
# Clone and build
git clone https://github.com/vikipranata/opsgraf.git
cd opsgraf

# Run directly pointing to your Prometheus instance
go run cmd/opsgraf/main.go -prom http://172.16.0.253:9090 -listen :8080
```

Open your browser at `http://localhost:8080`.

### 2. Run with Docker

```bash
# Build Docker image
docker build -t opsgraf:latest .

# Run container
docker run -d \
  --name opsgraf \
  -p 8080:8080 \
  -e PROMETHEUS_URL="http://172.16.0.253:9090" \
  opsgraf:latest
```

### 3. Run with Docker Compose

```bash
docker compose up -d
```

## Configuration

OpsGraf is configured via command-line flags or environment variables:

| Environment Variable | CLI Flag | Default | Description |
|---|---|---|---|
| `LISTEN_PORT` | `-listen` | `8080` | Port for web server |
| `LISTEN_ADDRESS` | `-listen` | `0.0.0.0` | Bind address for web server |
| `PROMETHEUS_ENDPOINT` | `-prom` | `http://172.16.0.253:9090` | Upstream Prometheus base URL |
| `TIMEZONE` | `-tz` | `Asia/Jakarta` | Local timezone for date/time formatting |
| `ADMIN_USER` | `-admin-user` | `admin` | Administrator username for dashboard modifications |
| `ADMIN_PASSWORD` | `-admin-password` | `admin` | Administrator password for dashboard modifications |
| `DASHBOARD_DIR` | `-dashboards` | `./dashboard` | Directory containing dashboard JSON files |

---

## Live Edit, Backups & Rollback

- **Read-Only by Default**: Dashboards are viewable publicly without login credentials.
- **Admin Authentication**: Click **Admin Login** in topbar to authenticate with `ADMIN_USER` and `ADMIN_PASSWORD`.
- **Live Edit JSON**: Authenticated admins can edit dashboard definitions directly in the web UI via **Edit JSON**.
- **Automatic Backups**: Every save automatically creates a timestamped version in `./dashboard/backups/<id>/`.
- **One-Click Rollback**: View all previous versions via **History** and rollback instantly with pre-rollback safety snapshots.

---

## Standardized Legend Values

- When the pointer hovers over a chart timestamp, legends display values at that specific moment.
- When the pointer is not hovering, legends automatically display the **latest / most recent recorded value** (`lastNotNull`), avoiding empty/null legend displays.

---

## Dashboards

Dashboards are stored as JSON files under `./dashboard/`. OpsGraf parses Grafana Declarative / Scenes schemas out of the box:

- **[lact.json](file:///home/viki/OpenCloud/Personal/Workdir/gitRepo/opsgraf/dashboard/lact.json)**: LACT GPU monitoring (Utilization, Power, Temperature, VRAM, Clock Speed, Voltage, Fan Speed).
- **[sensors.json](file:///home/viki/OpenCloud/Personal/Workdir/gitRepo/opsgraf/dashboard/sensors.json)**: Hardware sensors monitoring (CPU Tctl, GPU temperatures, NVMe drives, Fan RPMs, Motherboard).

---

## Project Structure

```
opsgraf/
├── cmd/
│   └── opsgraf/
│       └── main.go              # Entrypoint and HTTP routing
├── pkg/
│   ├── config/                  # Configuration loader
│   ├── dashboard/               # Dashboard JSON scanner & reader
│   └── proxy/                   # Prometheus reverse proxy
├── ui/                          # Frontend assets embedded in binary
│   ├── index.html               # Main dashboard shell
│   ├── ui.go                    # Go embed.FS wrapper
│   └── static/
│       ├── css/styles.css       # EchoHeaders design system styles
│       ├── js/app.js            # Reactive controller & uPlot renderer
│       └── vendor/              # Vendored uPlot (~50 KB)
├── dashboard/                   # Dashboard JSON definitions
│   ├── lact.json
│   └── sensors.json
├── Dockerfile                   # Multi-stage minimal container build
├── docker-compose.yml           # Compose stack definition
├── BREAKDOWN.md                 # Technical architecture specification
├── CHANGELOG.md                 # Version release history
└── README.md
```
