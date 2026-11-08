package settings

import (
	"context"
	"doubo/server/internal/core"
)

type State struct {
	Group
	Values         Values          `json:"values"`
	Secrets        map[string]bool `json:"secrets"`
	Version        int64           `json:"version"`
	AppliedVersion int64           `json:"appliedVersion"`
	Source         string          `json:"source"`
	PendingRestart bool            `json:"pendingRestart"`
	Validation     string          `json:"validation,omitempty"`
}

func (m *Manager) states(values Values, records map[string]core.Record, production bool) []State {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]State, 0, len(definitions))
	for _, g := range definitions {
		s := State{Group: g, Values: Values{}, Secrets: map[string]bool{}, Version: records[g.ID].Version,
			AppliedVersion: m.applied[g.ID], Source: "environment"}
		if s.Version != 0 {
			s.Source = "database"
		}
		s.PendingRestart = s.Version != s.AppliedVersion
		for _, f := range g.Fields {
			if f.Kind == "secret" {
				s.Secrets[f.Key] = values[f.Key] != ""
			}
			// Product decision: super administrators see configured secrets in plain text.
			// The API handler returns states only to super administrators.
			s.Values[f.Key] = values[f.Key]
		}
		if err := validate(g, values, production); err != nil {
			s.Validation = err.Error()
		}
		out = append(out, s)
	}
	return out
}

func (m *Manager) States(ctx context.Context, production bool) ([]State, error) {
	values, records, err := m.snapshot(ctx)
	if err != nil {
		return nil, err
	}
	return m.states(values, records, production), nil
}
