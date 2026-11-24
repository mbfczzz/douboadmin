package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
)

var jobFilterZone = time.FixedZone("CST", 8*60*60)

func jobDay(value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, nil
	}
	return time.ParseInLocation("2006-01-02", value, jobFilterZone)
}

func jobQuery(w http.ResponseWriter, r *http.Request) (core.JobQuery, bool) {
	v := r.URL.Query()
	q := core.JobQuery{Page: 1, Size: 20, Search: v.Get("q"), Status: v.Get("status"), Kind: v.Get("kind"), Model: v.Get("model"), Deleted: v.Get("deleted"), Works: v.Get("works") == "true", ExcludeChat: v.Get("excludeChat") == "true", Ended: v.Get("ended") == "true"}
	q.ExcludeImport = v.Get("excludeImport") == "true"
	q.Session = v.Get("session")
	if v.Has("page") {
		q.Page, _ = strconv.Atoi(v.Get("page"))
	}
	if v.Has("size") {
		q.Size, _ = strconv.Atoi(v.Get("size"))
	}
	var err error
	if q.CreatedFrom, err = jobDay(v.Get("from")); err != nil {
		fail(w, 400, "时间筛选无效")
		return q, false
	}
	if q.CreatedBefore, err = jobDay(v.Get("to")); err != nil {
		fail(w, 400, "时间筛选无效")
		return q, false
	}
	if !q.CreatedBefore.IsZero() {
		q.CreatedBefore = q.CreatedBefore.AddDate(0, 0, 1)
	}
	if !q.Valid() {
		fail(w, 400, "分页参数无效")
		return q, false
	}
	return q, true
}

func (a *Server) pagedJobs(w http.ResponseWriter, r *http.Request, works bool) {
	q, ok := jobQuery(w, r)
	if !ok {
		return
	}
	if identity(r).Role != "admin" {
		q.User = identity(r).ID
		if works || q.Works {
			q.Deleted = "active"
		}
	}
	q.Works = q.Works || works
	out, e := a.Store.JobPage(r.Context(), q)
	if e != nil {
		dbError(w, e)
		return
	}
	if identity(r).Role == "admin" {
		if e = a.presentJobUsers(r, out.Items); e != nil {
			dbError(w, e)
			return
		}
	}
	for i := range out.Items {
		a.presentJob(r.Context(), &out.Items[i])
	}
	reply(w, 200, out)
}

func (a *Server) presentJobUsers(r *http.Request, jobs []core.Job) error {
	ids, seen := make([]string, 0, len(jobs)), map[string]bool{}
	for _, job := range jobs {
		if job.UserID != "" && !seen[job.UserID] {
			ids, seen[job.UserID] = append(ids, job.UserID), true
		}
	}
	if len(ids) == 0 {
		return nil
	}
	page, err := a.Store.RecordPage(r.Context(), core.RecordQuery{
		Namespace: "users", IDs: ids, Page: 1, Size: len(ids),
	})
	if err != nil {
		return err
	}
	type userLabel struct {
		Nickname string `json:"nickname"`
		Name     string `json:"name"`
		Phone    string `json:"phone"`
	}
	users := map[string]userLabel{}
	for _, row := range page.Items {
		var user userLabel
		if json.Unmarshal(row.Data, &user) == nil {
			users[row.ID] = user
		}
	}
	for i := range jobs {
		user := users[jobs[i].UserID]
		jobs[i].UserName = strings.TrimSpace(user.Name)
		if jobs[i].UserName == "" {
			jobs[i].UserName = strings.TrimSpace(user.Nickname)
		}
		jobs[i].UserPhone = strings.TrimSpace(user.Phone)
	}
	return nil
}
