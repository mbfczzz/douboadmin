package core

import "time"

type QueueHealth struct {
	Queued       int64      `json:"queued"`
	Running      int64      `json:"running"`
	FailedHour   int64      `json:"failedHour"`
	OldestQueued *time.Time `json:"oldestQueued,omitempty"`
}
type NodeHealth struct {
	ID         string    `json:"id"`
	Host       string    `json:"host"`
	Role       string    `json:"role"`
	StartedAt  time.Time `json:"startedAt"`
	SeenAt     time.Time `json:"seenAt"`
	HeapBytes  uint64    `json:"heapBytes"`
	Goroutines int       `json:"goroutines"`
	DBOpen     int       `json:"dbOpen"`
	DBInUse    int       `json:"dbInUse"`
	GoVersion  string    `json:"goVersion"`
}
type ErrorLog struct {
	Level   string `json:"level"`
	Message string `json:"message"`
	Detail  string `json:"detail"`
	Node    string `json:"node"`
	// Repeats of the same entry within an hour fold into one row.
	Count  int       `json:"count,omitempty"`
	LastAt time.Time `json:"lastAt,omitzero"`
}
type Alert struct {
	Kind         string `json:"kind"`
	Message      string `json:"message"`
	Acknowledged bool   `json:"acknowledged"`
	Actor        string `json:"actor,omitempty"`
}
