package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"math/rand/v2"
	"net/http"
	"sort"
	"strings"
)

// AI试衣: the clothing library users browse and pick from. Outfits are
// admin uploads; picking one (use) gives the user an asset of their own
// pointing at the same file, so 试穿 is an ordinary image job with two
// references (the person, then the outfit) and every existing check holds.

type outfitView struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Category    string `json:"category"`
	Description string `json:"description"`
	Image       string `json:"image"`
}

// outfitImage: a resized copy whose signature is reused (30 min, handed out
// for 20), like template covers, so phones cache the pictures; the page
// refreshes its addresses after 10 minutes (pages/tryon/gallery.ts).
func (a *Server) outfitImage(ctx context.Context, key string) string {
	if key == "" { // a default outfit still being drawn
		return ""
	}
	if a.Objects == nil {
		return "/media/" + key
	}
	if s, ok := a.Objects.(interface {
		ImageURL(context.Context, string, int) (string, error)
	}); ok {
		if u, err := s.ImageURL(ctx, key, 720); err == nil {
			return u
		}
	}
	u, _ := a.Objects.URL(ctx, key)
	return u
}

func (a *Server) outfitViews(ctx context.Context, rows []core.Record) []outfitView {
	out := []outfitView{}
	for _, row := range rows {
		var o core.Outfit
		if json.Unmarshal(row.Data, &o) == nil {
			out = append(out, outfitView{row.ID, o.Title, o.Category, o.Description, a.outfitImage(ctx, o.ImageKey)})
		}
	}
	return out
}

// outfitQuery: published outfits, by 排序 (or newest first), one category.
func outfitQuery(w http.ResponseWriter, r *http.Request) (core.RecordQuery, bool) {
	q, ok := listQuery(w, r, "outfits")
	if !ok {
		return q, false
	}
	q.SearchFields = []string{"title", "description", "category"}
	q.Fields["deleted"], q.Fields["published"] = "false", "true"
	if c := r.URL.Query().Get("category"); c != "" {
		q.Fields["category"] = c
	}
	if r.URL.Query().Get("sort") != "newest" {
		q.SortField = "sort"
	}
	return q, true
}

// outfits lists a page; ids=a,b (收藏, at most 100) lists just those.
func (a *Server) outfits(w http.ResponseWriter, r *http.Request) {
	q, ok := outfitQuery(w, r)
	if !ok {
		return
	}
	if raw := r.URL.Query().Get("ids"); r.URL.Query().Has("ids") {
		q.IDs = []string{}
		for _, id := range strings.Split(raw, ",") {
			if id = strings.TrimSpace(id); id != "" && len(id) <= 64 && len(q.IDs) < 100 {
				q.IDs = append(q.IDs, id)
			}
		}
	}
	page, err := a.Store.RecordPage(r.Context(), q)
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, map[string]any{"items": a.outfitViews(r.Context(), page.Items), "page": page.Page, "size": page.Size, "total": page.Total})
}

// randomOutfit: 随机一个 (within the category, when one is chosen).
func (a *Server) randomOutfit(w http.ResponseWriter, r *http.Request) {
	q, ok := outfitQuery(w, r)
	if !ok {
		return
	}
	q.Page, q.Size = 1, 1
	first, err := a.Store.RecordPage(r.Context(), q)
	if err != nil || first.Total == 0 {
		if err != nil {
			dbError(w, err)
		} else {
			fail(w, 404, "暂无服装")
		}
		return
	}
	q.Page = rand.IntN(first.Total) + 1
	page, err := a.Store.RecordPage(r.Context(), q)
	if err != nil || len(page.Items) == 0 {
		page = first
	}
	reply(w, 200, a.outfitViews(r.Context(), page.Items)[0])
}

type outfitCategory struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
	// Image: the category's first outfit, shown on its chip (users only).
	Image string `json:"image,omitempty"`
}

// outfitCategories counts outfits per category (published ones for users).
func (a *Server) outfitCategories(w http.ResponseWriter, r *http.Request) {
	rows, err := store.AllRecords(r.Context(), a.Store, "outfits", "")
	if err != nil {
		dbError(w, err)
		return
	}
	admin := strings.Contains(r.URL.Path, "/admin/")
	// In the order of their first outfit (排序), so 春季 comes before 冬季.
	counts, first, cover := map[string]int{}, map[string]int{}, map[string]string{}
	for _, row := range rows {
		var o core.Outfit
		if json.Unmarshal(row.Data, &o) == nil && !o.Deleted && (o.Published || admin) && o.Category != "" {
			if n, seen := first[o.Category]; !seen || o.Sort < n || o.Sort == n && cover[o.Category] == "" {
				first[o.Category] = o.Sort
				cover[o.Category] = o.ImageKey
			}
			counts[o.Category]++
		}
	}
	out := []outfitCategory{}
	for name, n := range counts {
		c := outfitCategory{Name: name, Count: n}
		if !admin {
			c.Image = a.outfitImage(r.Context(), cover[name])
		}
		out = append(out, c)
	}
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i], out[j]
		return first[a.Name] < first[b.Name] || first[a.Name] == first[b.Name] && a.Name < b.Name
	})
	reply(w, 200, out)
}

// useOutfit returns the user's own asset for a published outfit; the same
// one every time (its id is derived from the user and the outfit).
func (a *Server) useOutfit(w http.ResponseWriter, r *http.Request) {
	ctx, user := r.Context(), identity(r).ID
	row, err := a.Store.Get(ctx, "outfits", r.PathValue("id"))
	var o core.Outfit
	if err != nil || json.Unmarshal(row.Data, &o) != nil || !o.Published || o.Deleted || o.ImageKey == "" {
		fail(w, 404, "这件服装已下架")
		return
	}
	id := core.Digest(user + ":outfit:" + row.ID + ":" + o.ImageKey)[:32]
	asset, err := a.Store.Get(ctx, "assets", id)
	if err != nil {
		data := map[string]any{"name": o.Title, "url": "", "key": o.ImageKey, "type": o.ImageType, "size": o.ImageSize}
		if a.Objects == nil {
			data["url"] = "/media/" + o.ImageKey
		}
		asset, err = a.Store.Put(ctx, "assets", core.Record{ID: id, Owner: user, Data: core.Data(data)}, 0)
		if err == core.ErrConflict {
			asset, err = a.Store.Get(ctx, "assets", id)
		}
	}
	if err == nil {
		asset, err = a.signedAsset(ctx, asset)
	}
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, asset)
}
