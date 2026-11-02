package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type sharedWork struct {
	Title     string    `json:"title"`
	Kind      string    `json:"kind"`
	Result    string    `json:"result"`
	Prompt    string    `json:"prompt,omitempty"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func (a *Server) createShare(w http.ResponseWriter, r *http.Request) {
	var v struct {
		JobID      string `json:"jobId"`
		Title      string `json:"title"`
		ShowPrompt bool   `json:"showPrompt"`
	}
	if !decode(w, r, &v) {
		return
	}
	j, e := a.Store.Job(r.Context(), v.JobID)
	if e != nil {
		dbError(w, e)
		return
	}
	if j.UserID != identity(r).ID {
		fail(w, 404, "作品不存在")
		return
	}
	if e = a.checkShareAccess(r.Context(), j); e != nil {
		switch {
		case errors.Is(e, core.ErrConflict):
			fail(w, 409, "作品审核通过后才可公开分享")
		case errors.Is(e, core.ErrNotFound):
			fail(w, 409, "此作品暂不可分享")
		default:
			dbError(w, e)
		}
		return
	}
	v.Title = strings.TrimSpace(v.Title)
	if v.Title == "" {
		v.Title = "豆播创作作品"
	}
	if len([]rune(v.Title)) > 60 {
		fail(w, 400, "分享标题不能超过 60 字")
		return
	}
	share := core.Share{JobID: j.ID, Title: v.Title, ShowPrompt: v.ShowPrompt, ExpiresAt: time.Now().UTC().Add(30 * 24 * time.Hour)}
	id := core.NewID()
	_, e = a.Store.Put(r.Context(), "shares", core.Record{ID: id, Owner: j.UserID, Data: core.Data(share)}, 0)
	if e != nil {
		dbError(w, e)
		return
	}
	base := strings.TrimRight(a.Config.PublicBaseURL, "/")
	reply(w, 201, map[string]any{"token": id, "path": "/pages/shared-work/index?token=" + id, "shortPath": "/s/" + id, "url": base + "/s/" + id, "publicDomainConfigured": base != "", "expiresAt": share.ExpiresAt})
}
func (a *Server) shared(r *http.Request) (sharedWork, error) {
	var out sharedWork
	token := r.PathValue("token")
	if len(token) != 32 {
		return out, core.ErrNotFound
	}
	row, e := a.Store.Get(r.Context(), "shares", token)
	if e != nil {
		return out, e
	}
	var share core.Share
	if json.Unmarshal(row.Data, &share) != nil || !share.ExpiresAt.After(time.Now()) {
		return out, core.ErrNotFound
	}
	j, e := a.Store.Job(r.Context(), share.JobID)
	if e != nil {
		return out, e
	}
	if e = a.checkShareAccess(r.Context(), j); e != nil {
		return out, e
	}
	if a.Media != nil && j.Result != "" {
		j.Result, e = a.Media.URL(r.Context(), j.Result)
		if e != nil {
			return out, e
		}
	}
	if j.Result == "" {
		return out, fmt.Errorf("作品结果暂不可用")
	}
	out = sharedWork{Title: share.Title, Kind: j.Input.Kind, Result: j.Result, ExpiresAt: share.ExpiresAt}
	if share.ShowPrompt {
		out.Prompt = j.Input.Prompt
	}
	return out, nil
}
func (a *Server) shareData(w http.ResponseWriter, r *http.Request) {
	data, e := a.shared(r)
	if e != nil {
		fail(w, 404, "分享已失效或作品不可用")
		return
	}
	reply(w, 200, data)
}
