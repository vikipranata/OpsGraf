package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/vikipranata/opsgraf/pkg/auth"
	"github.com/vikipranata/opsgraf/pkg/config"
	"github.com/vikipranata/opsgraf/pkg/dashboard"
	"github.com/vikipranata/opsgraf/pkg/proxy"
	"github.com/vikipranata/opsgraf/ui"
)

func main() {
	cfg := config.Load()

	log.Printf("Starting OpsGraf on %s", cfg.ListenAddr)
	log.Printf("Prometheus upstream: %s", cfg.Prometheus)
	log.Printf("Timezone configured: %s", cfg.Timezone)
	log.Printf("Dashboard folder: %s", cfg.DashboardDir)
	log.Printf("Admin user configured: %s", cfg.AdminUser)

	dashSvc := dashboard.NewService(cfg.DashboardDir)
	authSvc := auth.NewService(cfg)

	promProxy, err := proxy.NewPrometheusProxy(cfg.Prometheus)
	if err != nil {
		log.Fatalf("Failed to initialize Prometheus proxy: %v", err)
	}

	fileServer := http.FileServer(http.FS(ui.Files))

	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"status":     "ok",
			"prometheus": cfg.Prometheus,
			"timezone":   cfg.Timezone,
			"timestamp":  time.Now().Unix(),
		})
	})

	mux.HandleFunc("/api/config", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"timezone":   cfg.Timezone,
			"prometheus": cfg.Prometheus,
		})
	})

	mux.HandleFunc("/api/auth/login", authSvc.Login)
	mux.HandleFunc("/api/auth/logout", authSvc.Logout)
	mux.HandleFunc("/api/auth/status", authSvc.Status)

	mux.HandleFunc("/api/dashboards", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			return
		}
		list, err := dashSvc.List()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(list)
	})

	mux.HandleFunc("/api/dashboards/", func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/api/dashboards/")
		if path == "" {
			http.NotFound(w, r)
			return
		}

		parts := strings.Split(strings.Trim(path, "/"), "/")
		id := parts[0]

		if len(parts) == 2 && parts[1] == "backups" {
			authSvc.RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodGet {
					http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
					return
				}
				backups, err := dashSvc.ListBackups(id)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(backups)
			})(w, r)
			return
		}

		if len(parts) == 2 && parts[1] == "rollback" {
			authSvc.RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodPost {
					http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
					return
				}
				var req struct {
					Filename string `json:"filename"`
				}
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					http.Error(w, "Invalid payload", http.StatusBadRequest)
					return
				}
				if err := dashSvc.Rollback(id, req.Filename); err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]any{"status": "ok", "message": "rolled back successfully"})
			})(w, r)
			return
		}

		if len(parts) == 1 {
			switch r.Method {
			case http.MethodGet:
				data, err := dashSvc.Get(id)
				if err != nil {
					http.Error(w, err.Error(), http.StatusNotFound)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				w.Write(data)

			case http.MethodPost, http.MethodPut:
				authSvc.RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
					body, err := io.ReadAll(r.Body)
					if err != nil {
						http.Error(w, "Cannot read request body", http.StatusBadRequest)
						return
					}
					if err := dashSvc.Save(id, body); err != nil {
						http.Error(w, err.Error(), http.StatusBadRequest)
						return
					}
					w.Header().Set("Content-Type", "application/json")
					json.NewEncoder(w).Encode(map[string]any{"status": "ok", "message": "dashboard saved and backed up"})
				})(w, r)

			default:
				http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
			}
			return
		}

		http.NotFound(w, r)
	})

	mux.Handle("/api/v1/", promProxy)

	mux.Handle("/", fileServer)

	server := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      logMiddleware(mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server listen failed: %v", err)
	}
}

func logMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		if strings.HasPrefix(r.URL.Path, "/api/") {
			log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
		}
	})
}
