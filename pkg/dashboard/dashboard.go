package dashboard

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

type Summary struct {
	ID          string   `json:"id"`
	Filename    string   `json:"filename"`
	Title       string   `json:"title"`
	Description string   `json:"description,omitempty"`
	Tags        []string `json:"tags,omitempty"`
	PanelsCount int      `json:"panelsCount"`
}

type BackupInfo struct {
	ID        string    `json:"id"`
	Filename  string    `json:"filename"`
	Timestamp time.Time `json:"timestamp"`
	Size      int64     `json:"size"`
}

type Service struct {
	dir string
	mu  sync.RWMutex
}

func NewService(dir string) *Service {
	return &Service{dir: dir}
}

func (s *Service) List() ([]Summary, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, fmt.Errorf("read dashboard dir: %w", err)
	}

	var results []Summary
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".json") {
			continue
		}

		fullPath := filepath.Join(s.dir, entry.Name())
		data, err := os.ReadFile(fullPath)
		if err != nil {
			continue
		}

		var raw map[string]any
		if err := json.Unmarshal(data, &raw); err != nil {
			continue
		}

		id := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
		title, _ := raw["title"].(string)
		if title == "" {
			title = id
		}
		desc, _ := raw["description"].(string)

		var tags []string
		if rawTags, ok := raw["tags"].([]any); ok {
			for _, t := range rawTags {
				if str, ok := t.(string); ok {
					tags = append(tags, str)
				}
			}
		}

		panelCount := 0
		if elements, ok := raw["elements"].(map[string]any); ok {
			panelCount = len(elements)
		} else if panels, ok := raw["panels"].([]any); ok {
			panelCount = len(panels)
		}

		results = append(results, Summary{
			ID:          id,
			Filename:    entry.Name(),
			Title:       title,
			Description: desc,
			Tags:        tags,
			PanelsCount: panelCount,
		})
	}

	return results, nil
}

func (s *Service) Get(id string) ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	cleanPath := s.resolveFilePath(id)
	data, err := os.ReadFile(cleanPath)
	if err != nil {
		return nil, fmt.Errorf("read dashboard file %q: %w", id, err)
	}

	return data, nil
}

func (s *Service) Save(id string, data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var dummy any
	if err := json.Unmarshal(data, &dummy); err != nil {
		return fmt.Errorf("invalid json format: %w", err)
	}

	targetPath := s.resolveFilePath(id)

	if oldData, err := os.ReadFile(targetPath); err == nil {
		backupDir := filepath.Join(s.dir, "backups", id)
		if err := os.MkdirAll(backupDir, 0755); err != nil {
			return fmt.Errorf("create backup directory: %w", err)
		}

		timestampStr := time.Now().Format("20060102-150405")
		backupPath := filepath.Join(backupDir, fmt.Sprintf("%s-%s.json", id, timestampStr))
		if err := os.WriteFile(backupPath, oldData, 0644); err != nil {
			return fmt.Errorf("write backup file: %w", err)
		}
	}

	tmpPath := targetPath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0644); err != nil {
		return fmt.Errorf("write temp file: %w", err)
	}

	if err := os.Rename(tmpPath, targetPath); err != nil {
		return fmt.Errorf("commit dashboard file: %w", err)
	}

	return nil
}

func (s *Service) ListBackups(id string) ([]BackupInfo, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	backupDir := filepath.Join(s.dir, "backups", id)
	entries, err := os.ReadDir(backupDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []BackupInfo{}, nil
		}
		return nil, fmt.Errorf("read backups: %w", err)
	}

	var backups []BackupInfo
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		backups = append(backups, BackupInfo{
			ID:        id,
			Filename:  entry.Name(),
			Timestamp: info.ModTime(),
			Size:      info.Size(),
		})
	}

	sort.Slice(backups, func(i, j int) bool {
		return backups[i].Timestamp.After(backups[j].Timestamp)
	})

	return backups, nil
}

func (s *Service) Rollback(id string, backupFilename string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cleanFilename := filepath.Clean("/" + backupFilename)
	backupPath := filepath.Join(s.dir, "backups", id, filepath.Base(cleanFilename))

	backupData, err := os.ReadFile(backupPath)
	if err != nil {
		return fmt.Errorf("read backup %q: %w", backupFilename, err)
	}

	var dummy any
	if err := json.Unmarshal(backupData, &dummy); err != nil {
		return fmt.Errorf("corrupted backup file: %w", err)
	}

	targetPath := s.resolveFilePath(id)

	if currentData, err := os.ReadFile(targetPath); err == nil {
		backupDir := filepath.Join(s.dir, "backups", id)
		_ = os.MkdirAll(backupDir, 0755)
		safetyPath := filepath.Join(backupDir, fmt.Sprintf("%s-pre-rollback-%s.json", id, time.Now().Format("20060102-150405")))
		_ = os.WriteFile(safetyPath, currentData, 0644)
	}

	tmpPath := targetPath + ".tmp"
	if err := os.WriteFile(tmpPath, backupData, 0644); err != nil {
		return fmt.Errorf("write rollback file: %w", err)
	}

	if err := os.Rename(tmpPath, targetPath); err != nil {
		return fmt.Errorf("apply rollback file: %w", err)
	}

	return nil
}

func (s *Service) resolveFilePath(id string) string {
	filename := id
	if !strings.HasSuffix(strings.ToLower(filename), ".json") {
		filename += ".json"
	}
	return filepath.Join(s.dir, filepath.Clean("/"+filename))
}
