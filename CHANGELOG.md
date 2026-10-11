# Changelog

All notable changes to OpsGraf will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-11

### Added
- **Core Go Server**: Single self-contained Go server embedding static UI with `embed.FS`.
- **Prometheus Reverse Proxy**: Transparent forwarding of `/api/v1/query`, `/api/v1/query_range`, `/api/v1/series`, and `/api/v1/label/...` with CORS support.
- **Dashboard File Loader**: Auto-scanning and serving of `./dashboard/*.json` dashboards without external database.
- **uPlot Visual Engine**: Ultra-fast canvas 2D time series rendering with 60 FPS performance, gradient fill, and synced crosshairs (`cursorSync`).
- **EchoHeaders Design System**: Complete adoption of CSS tokens and component styles from `vikipranata/echoheaders` (`webui.go`), including topbar command bar, animated hamburger, sidebar, KPI metric cards, and data tables.
- **Dynamic Template Variables**: Automatic resolution of Prometheus `label_values(...)` queries to populate interactive dashboard filters.
- **Time Controls**: Presets for Last 5m through Last 24h with dynamic Prometheus step computation and configurable auto-refresh intervals.
- **Dashboard Presets**: Integrated `lact.json` (GPU metrics) and `sensors.json` (Hardware sensors) dashboards.
- **Container Support**: Multi-stage `Dockerfile` and `docker-compose.yml` for lightweight Alpine runtime (< 20 MB image).
- **Configurable Environment Variables**: Native support for `LISTEN_PORT`, `LISTEN_ADDRESS`, `PROMETHEUS_ENDPOINT`, `TIMEZONE`, `ADMIN_USER`, and `ADMIN_PASSWORD` via `.env` file and flags.
- **Admin Authentication**: Secure session-based authentication for modifying dashboards while preserving public read-only viewer mode.
- **Live Edit Dashboard JSON**: In-browser JSON editor with formatting validation and direct commit to dashboard storage.
- **Versioning & Rollback**: Automatic timestamped backup snapshots created before every dashboard save, with one-click restore and pre-rollback safety snapshots.
- **Standardized Graph Legends**: Legends now automatically show the latest / last non-null metric values when pointer is not hovering, eliminating blank or null legend readings.
- **Timezone Awareness**: Date and time formatting across axis ticks, tooltips, and header metadata respects configured `TIMEZONE`.
- **Documentation**: Comprehensive `README.md` and `BREAKDOWN.md` specifications.
