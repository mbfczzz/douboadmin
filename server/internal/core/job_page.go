package core

import "time"

type JobQuery struct {
	User, Search, Status, Kind, Model, Deleted string
	Session                                    string // Agent project
	NoSession                                  bool   // only jobs outside projects
	Works, ExcludeChat, ExcludeImport, Ended   bool
	CreatedFrom, CreatedBefore                 time.Time
	Page, Size                                 int
}

func (q JobQuery) Valid() bool {
	validRange := q.CreatedFrom.IsZero() || q.CreatedBefore.IsZero() || q.CreatedFrom.Before(q.CreatedBefore)
	return q.Page > 0 && q.Page <= 1000000 && q.Size > 0 && q.Size <= 100 && len([]rune(q.Search)) <= 100 && len(q.Status) < 20 && len(q.Kind) < 20 && len(q.Model) <= 64 && len(q.Session) <= 64 && validRange && (q.Deleted == "" || q.Deleted == "active" || q.Deleted == "deleted")
}

type JobPage struct {
	Items []Job `json:"items"`
	Page  int   `json:"page"`
	Size  int   `json:"size"`
	Total int   `json:"total"`
}

type JobModelUse struct {
	Model       string    `json:"model"`
	Name        string    `json:"name"`
	Kind        string    `json:"kind"`
	Calls       int       `json:"calls"`
	Succeeded   int       `json:"succeeded"`
	Failed      int       `json:"failed"`
	Active      int       `json:"active"`
	PointsUnits int64     `json:"pointsUnits"`
	LastAt      time.Time `json:"lastAt"`
}

type JobStats struct{ Works, Running, Failed int }
