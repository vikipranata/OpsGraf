package auth

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/vikipranata/opsgraf/pkg/config"
)

type Service struct {
	cfg      *config.Config
	sessions map[string]sessionInfo
	mu       sync.RWMutex
}

type sessionInfo struct {
	username string
	expires  time.Time
}

func NewService(cfg *config.Config) *Service {
	return &Service{
		cfg:      cfg,
		sessions: make(map[string]sessionInfo),
	}
}

func (s *Service) generateToken() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func (s *Service) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
		return
	}

	if req.Username != s.cfg.AdminUser || req.Password != s.cfg.AdminPassword {
		http.Error(w, `{"error":"invalid credentials"}`, http.StatusUnauthorized)
		return
	}

	token, err := s.generateToken()
	if err != nil {
		http.Error(w, "Token generation failed", http.StatusInternalServerError)
		return
	}

	s.mu.Lock()
	s.sessions[token] = sessionInfo{
		username: req.Username,
		expires:  time.Now().Add(24 * time.Hour),
	}
	s.mu.Unlock()

	http.SetCookie(w, &http.Cookie{
		Name:     "opsgraf_session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"authenticated": true,
		"username":      req.Username,
	})
}

func (s *Service) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie("opsgraf_session"); err == nil {
		s.mu.Lock()
		delete(s.sessions, cookie.Value)
		s.mu.Unlock()
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "opsgraf_session",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"authenticated": false,
	})
}

func (s *Service) Status(w http.ResponseWriter, r *http.Request) {
	user, authed := s.IsAuthenticated(r)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"authenticated": authed,
		"username":      user,
	})
}

func (s *Service) IsAuthenticated(r *http.Request) (string, bool) {
	cookie, err := r.Cookie("opsgraf_session")
	if err == nil && cookie.Value != "" {
		s.mu.RLock()
		sess, ok := s.sessions[cookie.Value]
		s.mu.RUnlock()
		if ok && time.Now().Before(sess.expires) {
			return sess.username, true
		}
	}

	u, p, ok := r.BasicAuth()
	if ok && u == s.cfg.AdminUser && p == s.cfg.AdminPassword {
		return u, true
	}

	return "", false
}

func (s *Service) RequireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		_, authed := s.IsAuthenticated(r)
		if !authed {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]any{
				"error": "admin authorization required",
			})
			return
		}
		next(w, r)
	}
}
