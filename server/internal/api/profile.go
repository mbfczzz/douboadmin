package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

func (a *Server) me(w http.ResponseWriter, r *http.Request) {
	id := identity(r).ID
	row, e := a.Store.Get(r.Context(), "users", id)
	if e != nil {
		dbError(w, e)
		return
	}
	jobs, e := a.Store.Jobs(r.Context(), id)
	if e != nil {
		dbError(w, e)
		return
	}
	fav, e := a.Store.List(r.Context(), "favorites", id)
	if e != nil {
		dbError(w, e)
		return
	}
	works, running, count := 0, 0, 0
	for _, j := range jobs {
		if !core.IsWork(j.Input.Kind) {
			continue
		}
		if j.Status == "succeeded" {
			var meta core.WorkMeta
			if row, e := a.Store.Get(r.Context(), "work_meta", j.ID); e == nil {
				_ = json.Unmarshal(row.Data, &meta)
			}
			if !meta.Deleted {
				works++
			}
		}
		if j.Status == "queued" || j.Status == "running" {
			running++
		}
	}
	visible, e := a.visibleTemplates(r)
	if e != nil {
		dbError(w, e)
		return
	}
	for _, f := range fav {
		var v struct {
			Active     bool   `json:"active"`
			TemplateID string `json:"templateId"`
		}
		_ = json.Unmarshal(f.Data, &v)
		// Count only favorites the user can still open.
		if v.Active && visible[v.TemplateID] {
			count++
		}
	}
	var profile map[string]any
	if e = json.Unmarshal(row.Data, &profile); e != nil {
		dbError(w, e)
		return
	}
	// The reason an administrator gave for disabling the account is internal.
	delete(profile, "statusReason")
	if avatarID, ok := profile["avatarId"].(string); ok && avatarID != "" {
		asset, err := a.Store.Get(r.Context(), "assets", avatarID)
		if err != nil && !errors.Is(err, core.ErrNotFound) {
			dbError(w, err)
			return
		}
		if err == nil && asset.Owner == id {
			var data struct {
				Key string `json:"key"`
				URL string `json:"url"`
			}
			if e = json.Unmarshal(asset.Data, &data); e != nil {
				dbError(w, e)
				return
			}
			if a.Objects != nil {
				data.URL, e = a.Objects.URL(r.Context(), data.Key)
				if e != nil {
					dbError(w, e)
					return
				}
			}
			profile["avatarUrl"] = data.URL
		}
	}
	row.Data = core.Data(profile)
	reply(w, 200, map[string]any{"profile": row, "works": works, "running": running, "favorites": count})
}

func (a *Server) updateMe(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Version  int64   `json:"version"`
		Nickname string  `json:"nickname"`
		Bio      *string `json:"bio"` // omitted keeps the current bio
		AvatarID *string `json:"avatarId"`
		Name     *string `json:"name"`
		Phone    *string `json:"phone"`
	}
	if !decode(w, r, &v) {
		return
	}
	v.Nickname = strings.TrimSpace(v.Nickname)
	if len([]rune(v.Nickname)) < 1 || len([]rune(v.Nickname)) > 30 || (v.Bio != nil && len([]rune(*v.Bio)) > 120) {
		fail(w, 400, "昵称或简介长度无效")
		return
	}
	id := identity(r).ID
	old, e := a.Store.Get(r.Context(), "users", id)
	if e != nil {
		dbError(w, e)
		return
	}
	var profile map[string]any
	if e = json.Unmarshal(old.Data, &profile); e != nil {
		dbError(w, e)
		return
	}
	if v.AvatarID != nil && *v.AvatarID != "" {
		asset, err := a.Store.Get(r.Context(), "assets", *v.AvatarID)
		if err != nil && !errors.Is(err, core.ErrNotFound) {
			dbError(w, err)
			return
		}
		if errors.Is(err, core.ErrNotFound) || asset.Owner != id {
			fail(w, 400, "请选择本人上传的头像")
			return
		}
		var data struct {
			Type string `json:"type"`
			Size int64  `json:"size"`
		}
		if json.Unmarshal(asset.Data, &data) != nil || !strings.HasPrefix(data.Type, "image/") || data.Size > 5<<20 {
			fail(w, 400, "头像必须是 5 MB 以内的图片")
			return
		}
	}
	profile["nickname"] = v.Nickname
	if v.Bio != nil {
		profile["bio"] = *v.Bio
	}
	if v.Name != nil {
		value := strings.TrimSpace(*v.Name)
		if len([]rune(value)) > 50 {
			fail(w, 400, "姓名不能超过 50 字")
			return
		}
		if value == "" && a.registrationRequired() {
			fail(w, 400, "请填写姓名")
			return
		}
		profile["name"] = value
	}
	if current, _ := profile["phone"].(string); v.Phone != nil && strings.TrimSpace(*v.Phone) != current {
		// With SMS registration the phone is set by verification only.
		value := strings.TrimSpace(*v.Phone)
		if a.registrationRequired() {
			fail(w, 400, "手机号已通过短信验证，不能在此修改")
			return
		}
		if value != "" && !validPhone.MatchString(value) {
			fail(w, 400, "请填写有效手机号")
			return
		}
		profile["phone"] = value
	}
	if v.AvatarID != nil {
		profile["avatarId"] = *v.AvatarID
	}
	delete(profile, "avatarUrl")
	row, e := a.Store.Put(r.Context(), "users", core.Record{ID: id, Owner: id, Data: core.Data(profile)}, v.Version)
	if e != nil {
		dbError(w, e)
		return
	}
	// Same rule as GET /api/me: the admin's status reason stays internal.
	delete(profile, "statusReason")
	row.Data = core.Data(profile)
	reply(w, 200, row)
}
