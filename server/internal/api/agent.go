package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"
)

// Agent 创作项目: a skill, its materials, and the jobs carrying its id. The
// conversation is GET /api/jobs?session=id (chat turns and generations).

func (a *Server) agentSkills(w http.ResponseWriter, r *http.Request) {
	reply(w, 200, core.AgentSkills)
}

func (a *Server) agentSessions(w http.ResponseWriter, r *http.Request) {
	rows, err := store.AllRecords(r.Context(), a.Store, "agent_sessions", identity(r).ID)
	if err != nil {
		dbError(w, err)
		return
	}
	type item struct {
		ID      string            `json:"id"`
		Version int64             `json:"version"`
		Data    core.AgentSession `json:"data"`
	}
	out := []item{}
	for _, row := range rows {
		var s core.AgentSession
		if json.Unmarshal(row.Data, &s) == nil && !s.Deleted {
			out = append(out, item{row.ID, row.Version, s})
		}
	}
	slices.SortFunc(out, func(x, y item) int { return y.Data.ActiveAt.Compare(x.Data.ActiveAt) })
	if len(out) > 50 {
		out = out[:50]
	}
	reply(w, 200, out)
}

func (a *Server) createAgentSession(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Skill string `json:"skill"`
		Title string `json:"title"`
	}
	if !decode(w, r, &in) {
		return
	}
	skill, ok := core.AgentSkillByID(in.Skill)
	if !ok {
		fail(w, 400, "请选择创作类型")
		return
	}
	title := strings.TrimSpace(in.Title)
	if title == "" {
		title = skill.Name
	}
	s := core.AgentSession{Title: clip(title, 30), Skill: skill.ID, Assets: []string{}, ActiveAt: time.Now().UTC()}
	row, err := a.Store.Put(r.Context(), "agent_sessions", core.Record{ID: core.NewID(), Owner: identity(r).ID, Data: core.Data(s)}, 0)
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 201, row)
}

// A project with its materials signed for thumbnails.
func (a *Server) agentSession(w http.ResponseWriter, r *http.Request) {
	row, s, ok := a.ownSession(w, r)
	if !ok {
		return
	}
	assets := []core.Record{}
	for _, id := range s.Assets {
		if asset, err := a.Store.Get(r.Context(), "assets", id); err == nil && asset.Owner == row.Owner {
			if asset, err = a.signedAsset(r.Context(), asset); err == nil {
				assets = append(assets, asset)
			}
		}
	}
	reply(w, 200, map[string]any{"id": row.ID, "version": row.Version, "data": s, "assets": assets})
}

// Rename, replace the materials, or delete (data.deleted) with a version check.
func (a *Server) updateAgentSession(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Version int64     `json:"version"`
		Title   *string   `json:"title"`
		Assets  *[]string `json:"assets"`
		Deleted bool      `json:"deleted"`
	}
	if !decode(w, r, &in) {
		return
	}
	row, s, ok := a.ownSession(w, r)
	if !ok {
		return
	}
	if in.Title != nil {
		if s.Title = clip(strings.TrimSpace(*in.Title), 30); s.Title == "" {
			fail(w, 400, "请输入项目名称")
			return
		}
	}
	if in.Assets != nil {
		if err := a.sessionAssets(r.Context(), row.Owner, *in.Assets); err != nil {
			fail(w, 400, err.Error())
			return
		}
		s.Assets = *in.Assets
	}
	s.Deleted = in.Deleted
	s.ActiveAt = time.Now().UTC()
	out, err := a.Store.Put(r.Context(), "agent_sessions", core.Record{ID: row.ID, Owner: row.Owner, Data: core.Data(s)}, in.Version)
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, out)
}

func (a *Server) ownSession(w http.ResponseWriter, r *http.Request) (core.Record, core.AgentSession, bool) {
	var s core.AgentSession
	row, err := a.Store.Get(r.Context(), "agent_sessions", r.PathValue("id"))
	if err == nil && (row.Owner != identity(r).ID || json.Unmarshal(row.Data, &s) != nil || s.Deleted) {
		err = core.ErrNotFound
	}
	if err != nil {
		if errors.Is(err, core.ErrNotFound) {
			fail(w, 404, "创作项目不存在或已删除")
		} else {
			dbError(w, err)
		}
		return row, s, false
	}
	return row, s, true
}

func (a *Server) sessionAssets(ctx context.Context, user string, ids []string) error {
	if len(ids) > core.MaxAgentAssets {
		return fmt.Errorf("每个项目最多 %d 个素材", core.MaxAgentAssets)
	}
	seen := map[string]bool{}
	for _, id := range ids {
		row, err := a.Store.Get(ctx, "assets", id)
		var v struct {
			Type string `json:"type"`
		}
		if err != nil || row.Owner != user || seen[id] || json.Unmarshal(row.Data, &v) != nil {
			return fmt.Errorf("素材不可用")
		}
		if t := strings.Split(v.Type, "/")[0]; t != "image" && t != "video" {
			return fmt.Errorf("项目素材只支持图片和视频")
		}
		seen[id] = true
	}
	return nil
}

// Jobs naming a project must name one of the caller's; chat in a project is
// always an Agent turn (its history comes from the project).
func (a *Server) checkSession(ctx context.Context, user string, in *core.JobInput) error {
	if in.SessionID == "" {
		return nil
	}
	row, err := a.Store.Get(ctx, "agent_sessions", in.SessionID)
	var s core.AgentSession
	if err != nil || row.Owner != user || json.Unmarshal(row.Data, &s) != nil || s.Deleted {
		return fmt.Errorf("创作项目不存在或已删除")
	}
	if in.Kind == "chat" {
		in.Purpose = "agent"
	}
	if len(in.Revises) > 64 || in.Revises != "" && in.Kind != "chat" {
		return fmt.Errorf("要修改的消息无效")
	}
	return nil
}

// touchSession moves a project to the top of the list when it gets a job.
func (a *Server) touchSession(ctx context.Context, id string) {
	if id == "" {
		return
	}
	row, err := a.Store.Get(ctx, "agent_sessions", id)
	var s core.AgentSession
	if err != nil || json.Unmarshal(row.Data, &s) != nil {
		return
	}
	s.ActiveAt = time.Now().UTC()
	_, _ = a.Store.Put(ctx, "agent_sessions", core.Record{ID: row.ID, Owner: row.Owner, Data: core.Data(s)}, row.Version)
}

func clip(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}
