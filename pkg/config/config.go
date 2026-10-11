package config

import (
	"flag"
	"os"
	"strings"
	"time"
)

type Config struct {
	ListenAddr    string `json:"listenAddr"`
	Prometheus    string `json:"prometheus"`
	DashboardDir  string `json:"dashboardDir"`
	Timezone      string `json:"timezone"`
	AdminUser     string `json:"adminUser"`
	AdminPassword string `json:"-"`
}

func loadDotEnv(filepath string) {
	data, err := os.ReadFile(filepath)
	if err != nil {
		return
	}
	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		idx := strings.Index(line, "=")
		if idx == -1 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		val = strings.Trim(val, `"'`)
		if os.Getenv(key) == "" {
			_ = os.Setenv(key, val)
		}
	}
}

func normalizeTimezone(tz string) (string, *time.Location) {
	if tz == "" {
		tz = "Asia/Jakarta"
	}
	if loc, err := time.LoadLocation(tz); err == nil && loc != nil {
		return tz, loc
	}

	parts := strings.Split(tz, "/")
	for i, p := range parts {
		if len(p) > 0 {
			parts[i] = strings.ToUpper(p[:1]) + strings.ToLower(p[1:])
		}
	}
	normalized := strings.Join(parts, "/")
	if loc, err := time.LoadLocation(normalized); err == nil && loc != nil {
		return normalized, loc
	}

	return tz, time.Local
}

func Load() *Config {
	loadDotEnv(".env")

	cfg := &Config{
		Prometheus:    "http://127.0.0.1:9090",
		DashboardDir:  "./dashboard",
		Timezone:      "UTC",
		AdminUser:     "admin",
		AdminPassword: "admin",
	}

	port := os.Getenv("LISTEN_PORT")
	if port == "" {
		port = os.Getenv("UI_PORT")
	}
	if port == "" {
		port = os.Getenv("PORT")
	}
	if port == "" {
		port = "8080"
	}
	port = strings.TrimPrefix(port, ":")

	addr := os.Getenv("LISTEN_ADDRESS")
	if addr == "" {
		addr = "0.0.0.0"
	}
	cfg.ListenAddr = addr + ":" + port

	if env := os.Getenv("LISTEN_ADDR"); env != "" {
		cfg.ListenAddr = env
	}

	if env := os.Getenv("PROMETHEUS_ENDPOINT"); env != "" {
		cfg.Prometheus = env
	} else if env := os.Getenv("PROMETHEUS_URL"); env != "" {
		cfg.Prometheus = env
	}

	if env := os.Getenv("TIMEZONE"); env != "" {
		cfg.Timezone = env
	}

	if env := os.Getenv("ADMIN_USER"); env != "" {
		cfg.AdminUser = env
	}

	if env := os.Getenv("ADMIN_PASSWORD"); env != "" {
		cfg.AdminPassword = env
	}

	if env := os.Getenv("DASHBOARD_DIR"); env != "" {
		cfg.DashboardDir = env
	}

	listen := flag.String("listen", cfg.ListenAddr, "Server HTTP listen address (e.g. 0.0.0.0:8080)")
	prom := flag.String("prom", cfg.Prometheus, "Prometheus target base URL")
	dash := flag.String("dashboards", cfg.DashboardDir, "Directory containing Grafana dashboard JSON files")
	tz := flag.String("tz", cfg.Timezone, "Application timezone (e.g. Asia/Jakarta)")
	authUser := flag.String("admin-user", cfg.AdminUser, "Admin username for dashboard modifications")
	authPass := flag.String("admin-password", cfg.AdminPassword, "Admin password for dashboard modifications")
	flag.Parse()

	cfg.ListenAddr = *listen
	cfg.Prometheus = *prom
	cfg.DashboardDir = *dash
	cfg.AdminUser = *authUser
	cfg.AdminPassword = *authPass

	normTz, loc := normalizeTimezone(*tz)
	cfg.Timezone = normTz
	time.Local = loc

	return cfg
}
