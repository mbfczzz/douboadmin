package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
	"doubo/server/internal/provider"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

// One generation, as an administrator needs to audit it: the input
// materials by type, the presented result, the upstream execution and the
// raw request/response of the model calls made for it.

type genInput struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"` // image, video, audio or file
	Mime  string `json:"mime"`
	Size  int64  `json:"size"`
	URL   string `json:"url"`
	Label string `json:"label"`
}

type genExecution struct {
	Phase      string    `json:"phase"`
	TaskID     string    `json:"taskId,omitempty"`
	ModelKey   string    `json:"modelKey,omitempty"`
	Note       string    `json:"note,omitempty"`
	ErrorCause string    `json:"errorCause,omitempty"`
	StartedAt  time.Time `json:"startedAt"`
}

var inputWords = map[string]string{"image": "图片", "video": "视频", "audio": "音频", "file": "文件"}

func (a *Server) generationInputs(ctx context.Context, ids []string) []genInput {
	out, seen := []genInput{}, map[string]int{}
	for _, id := range ids {
		in := genInput{ID: id, Kind: "file"}
		if row, e := a.Store.Get(ctx, "assets", id); e == nil {
			var asset media.Asset
			if json.Unmarshal(row.Data, &asset) == nil {
				in.Mime, in.Size, in.URL = asset.Type, asset.Size, asset.URL
				if kind, _, _ := strings.Cut(asset.Type, "/"); inputWords[kind] != "" {
					in.Kind = kind
				}
			}
			if a.Media != nil { // signed object-storage URL when configured
				if u, e := a.Media.URL(ctx, "asset:"+id); e == nil {
					in.URL = u
				}
			}
		}
		seen[in.Kind]++
		in.Label = inputWords[in.Kind] + " " + strconv.Itoa(seen[in.Kind])
		out = append(out, in)
	}
	return out
}

// generationCalls returns every submission and failed status query in full,
// plus the latest successful status query; the routine polls in between are
// only counted (polls; more reports that there were over 100).
func (a *Server) generationCalls(ctx context.Context, job string) (calls []core.AuditEntry, polls int, more bool, err error) {
	calls = []core.AuditEntry{}
	logs, ok := a.Store.(store.AuditLogs)
	if !ok {
		return
	}
	q := core.AuditQuery{Categories: []string{core.LogModel}, Target: job, Method: http.MethodPost, Limit: 20}
	posts, err := logs.Logs(ctx, q)
	if err != nil {
		return
	}
	q.Method, q.Limit = http.MethodGet, 100
	gets, err := logs.Logs(ctx, q)
	if err != nil {
		return
	}
	keep, latest, failed := []core.AuditEntry{}, false, 0
	for _, it := range gets.Items { // newest first
		if it.TargetID != job {
			continue
		}
		polls++
		bad := it.Status >= 400 || it.Error != ""
		if (!bad && !latest) || (bad && failed < 5) {
			keep = append(keep, it)
			latest = latest || !bad
			if bad {
				failed++
			}
		}
	}
	for _, it := range posts.Items {
		if it.TargetID == job {
			keep = append(keep, it)
		}
	}
	sort.Slice(keep, func(i, j int) bool { return keep[i].ID < keep[j].ID }) // ids are time-ordered
	for _, it := range keep {
		if full, e := logs.Log(ctx, it.ID); e == nil {
			calls = append(calls, full)
		}
	}
	return calls, polls, gets.Next != "", nil
}

func (a *Server) generationDetail(w http.ResponseWriter, r *http.Request, user string) {
	id := r.PathValue("job")
	if id == "" {
		id = r.PathValue("id")
	}
	j, e := a.Store.Job(r.Context(), id)
	if e == nil && user != "" && j.UserID != user {
		e = core.ErrNotFound
	}
	if e != nil {
		dbError(w, e)
		return
	}
	inputs := a.generationInputs(r.Context(), j.Input.Assets)
	a.presentJob(r.Context(), &j)
	var exec *genExecution
	if row, e := a.Store.Get(r.Context(), "executions", j.ID); e == nil {
		var x provider.Execution
		if json.Unmarshal(row.Data, &x) == nil {
			exec = &genExecution{x.Phase, x.TaskID, x.ModelKey, x.Note, x.ErrorCause, x.StartedAt}
		}
	} else if !errors.Is(e, core.ErrNotFound) {
		dbError(w, e)
		return
	}
	calls, polls, more, e := a.generationCalls(r.Context(), j.ID)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, map[string]any{"job": j, "inputs": inputs, "execution": exec, "calls": calls, "polls": polls, "morePolls": more})
}

// GET /api/admin/users/{id}/jobs/{job}: from the user's 模型记录.
func (a *Server) userGeneration(w http.ResponseWriter, r *http.Request) {
	a.generationDetail(w, r, r.PathValue("id"))
}

// GET /api/admin/jobs/{id}/detail: from 生成任务.
func (a *Server) jobGeneration(w http.ResponseWriter, r *http.Request) {
	a.generationDetail(w, r, "")
}
