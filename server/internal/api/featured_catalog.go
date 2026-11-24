package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

// A deliberately small public DTO: no owner, prompt, input assets or billing details.
type featuredWorkView struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	Kind         string    `json:"kind"`
	Result       string    `json:"result"`
	Results      []string  `json:"results,omitempty"`
	ThumbnailURL string    `json:"thumbnailUrl,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
}

func (a *Server) featuredView(r *http.Request, j core.Job, meta core.WorkMeta) (featuredWorkView, error) {
	if err := a.featuredResultsAvailable(r.Context(), j); err != nil {
		return featuredWorkView{}, err
	}
	out := featuredWorkView{ID: j.ID, Kind: j.Input.Kind, Title: meta.Title, CreatedAt: j.CreatedAt}
	if out.Kind == "mix" {
		out.Kind = "video"
	}
	// Admin uploads use an operator-reviewed title rather than a private user
	// prompt. Existing uploads gain their real title without a data migration.
	if out.Title == "" && j.Input.Uploaded() {
		out.Title = strings.TrimSpace(j.Input.Prompt)
	}
	if out.Title == "" {
		if out.Kind == "image" {
			out.Title = "优秀图片作品"
		} else {
			out.Title = "优秀视频作品"
		}
	}
	refs, err := core.ResultRefs(j.Result)
	if err != nil || len(refs) == 0 {
		return out, core.ErrNotFound
	}
	if j.Input.Kind == "image" {
		out.Results = refs
		if a.Media != nil {
			out.Results, err = a.Media.ResultURLs(r.Context(), j.Result)
		}
		if err != nil || len(out.Results) == 0 {
			return out, core.ErrNotFound
		}
		out.Result = out.Results[0]
	} else {
		out.Result = j.Result
		if a.Media != nil {
			out.Result, err = a.Media.URL(r.Context(), j.Result)
		}
		if err != nil {
			return out, err
		}
	}
	if a.Media != nil {
		out.ThumbnailURL, _ = a.Media.Thumbnail(r.Context(), refs[0], j.Input.Kind)
	}
	return out, nil
}

func (a *Server) featuredWork(w http.ResponseWriter, r *http.Request) {
	row, err := a.Store.Get(r.Context(), "work_meta", r.PathValue("id"))
	var meta core.WorkMeta
	if err != nil || json.Unmarshal(row.Data, &meta) != nil || !meta.Featured || meta.Deleted {
		fail(w, 404, "作品已下架或不可用")
		return
	}
	j, err := a.Store.Job(r.Context(), row.ID)
	if err != nil || a.checkShareAccess(r.Context(), j) != nil {
		fail(w, 404, "作品已下架或不可用")
		return
	}
	out, err := a.featuredView(r, j, meta)
	if err != nil {
		fail(w, 404, "作品暂不可用")
		return
	}
	reply(w, 200, out)
}

func (a *Server) featuredWorks(w http.ResponseWriter, r *http.Request) {
	page, size := 1, 20
	if v := r.URL.Query().Get("page"); v != "" {
		page, _ = strconv.Atoi(v)
	}
	if v := r.URL.Query().Get("size"); v != "" {
		size, _ = strconv.Atoi(v)
	}
	kind := r.URL.Query().Get("kind")
	if page < 1 || page > 1000000 || size < 1 || size > 100 || (kind != "" && kind != "image" && kind != "video") {
		fail(w, 400, "分页或类型参数无效")
		return
	}
	type candidate struct {
		job  core.Job
		meta core.WorkMeta
	}
	items := []candidate{}
	q := core.RecordQuery{Namespace: "work_meta", Page: 1, Size: 100, ByID: true, Fields: map[string]string{"featured": "true", "deleted": "false"}}
	for {
		rows, err := a.Store.RecordPage(r.Context(), q)
		if err != nil {
			dbError(w, err)
			return
		}
		for _, row := range rows.Items {
			var meta core.WorkMeta
			if json.Unmarshal(row.Data, &meta) != nil {
				continue
			}
			j, err := a.Store.Job(r.Context(), row.ID)
			if errors.Is(err, core.ErrNotFound) {
				continue
			}
			if err != nil {
				dbError(w, err)
				return
			}
			if kind != "" && j.Input.Kind != kind && !(kind == "video" && j.Input.Kind == "mix") {
				continue
			}
			err = a.checkShareAccess(r.Context(), j)
			if errors.Is(err, core.ErrNotFound) || errors.Is(err, core.ErrConflict) {
				continue
			}
			if err != nil {
				dbError(w, err)
				return
			}
			err = a.featuredResultsAvailable(r.Context(), j)
			if errors.Is(err, core.ErrNotFound) {
				continue
			}
			if err != nil {
				dbError(w, err)
				return
			}
			if j.Result != "" {
				items = append(items, candidate{j, meta})
			}
		}
		if len(rows.Items) < 100 {
			break
		}
		q.AfterID = rows.Items[len(rows.Items)-1].ID
	}
	sort.Slice(items, func(i, j int) bool {
		x, y := items[i].job.CreatedAt, items[j].job.CreatedAt
		if items[i].meta.FeaturedAt != nil {
			x = *items[i].meta.FeaturedAt
		}
		if items[j].meta.FeaturedAt != nil {
			y = *items[j].meta.FeaturedAt
		}
		if !x.Equal(y) {
			return x.After(y)
		}
		return items[i].job.ID > items[j].job.ID
	})
	out := []featuredWorkView{}
	start := (page - 1) * size
	for i := start; i < min(start+size, len(items)); i++ {
		item, err := a.featuredView(r, items[i].job, items[i].meta)
		if err != nil {
			dbError(w, err)
			return
		}
		out = append(out, item)
	}
	reply(w, 200, map[string]any{"items": out, "total": len(items), "page": page, "size": size})
}
