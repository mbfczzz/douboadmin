package api

import (
	"bytes"
	"doubo/server/internal/core"
	"encoding/json"
	"mime/multipart"
	"net/http/httptest"
	"testing"
)

var mp4Head = append([]byte("\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"), make([]byte, 64)...)

func workUpload(a *Server, token, user, title string, data []byte) *httptest.ResponseRecorder {
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	_ = w.WriteField("user", user)
	_ = w.WriteField("title", title)
	part, _ := w.CreateFormFile("file", "clip.mp4")
	_, _ = part.Write(data)
	_ = w.Close()
	r := httptest.NewRequest("POST", "/api/admin/works", &body)
	r.Header.Set("Content-Type", w.FormDataContentType())
	r.Header.Set("Authorization", "Bearer "+token)
	out := httptest.NewRecorder()
	a.Handler().ServeHTTP(out, r)
	return out
}

func TestAdminUploadedWorkLooksLikeAFinishedVideo(t *testing.T) {
	a, user, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	ctx := t.Context()
	_, _ = a.Store.Put(ctx, "users", core.Record{ID: "user-a", Data: core.Data(map[string]string{"name": "A", "phone": "13800000001"})}, 0)
	_, _ = a.Store.Put(ctx, "users", core.Record{ID: "user-off", Data: core.Data(map[string]any{"name": "B", "disabled": true})}, 0)
	_, _ = a.Store.Put(ctx, "phone_owners", core.Record{ID: "13800000001", Data: core.Data(phoneOwner{User: "user-a"})}, 0)

	if w := workUpload(a, user, "user-a", "片头", mp4Head); w.Code != 403 {
		t.Fatal("a mini-program user uploaded a work", w.Code)
	}
	for _, c := range []struct {
		user, title string
		data        []byte
	}{
		{"user-a", "", mp4Head},
		{"13900000000", "片头", mp4Head},
		{"user-off", "片头", mp4Head},
		{"missing", "片头", mp4Head},
		{"user-a", "片头", []byte("not a video at all")},
	} {
		if w := workUpload(a, admin, c.user, c.title, c.data); w.Code != 400 {
			t.Fatal("invalid upload accepted", c.user, c.title, w.Code, w.Body.String())
		}
	}
	w := workUpload(a, admin, "13800000001", "门店宣传片", mp4Head)
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body.String())
	}
	var job core.Job
	_ = json.Unmarshal(w.Body.Bytes(), &job)
	if job.UserID != "user-a" || job.Status != "succeeded" || job.Input.Kind != "video" || !job.Input.Uploaded() || job.Input.Prompt != "门店宣传片" || job.ModelName != "用户上传" || job.Result == "" {
		t.Fatalf("uploaded work %+v", job)
	}
	if _, e := a.Store.Claim(ctx); e == nil {
		t.Fatal("an uploaded work entered the generation queue")
	}
	if uses, _ := a.Store.JobModels(ctx, "user-a"); len(uses) != 0 {
		t.Fatal("uploaded work counted as a generation", uses)
	}
	var bill core.JobBilling
	row, _ := a.Store.Get(ctx, "job_billing", job.ID)
	if json.Unmarshal(row.Data, &bill) != nil || bill.State != "free" || bill.Units != 0 {
		t.Fatal("uploaded work billing", bill)
	}
	owner, _ := a.Sessions.Create(ctx, "user-a", "user")
	works := call(a, "GET", "/api/works?page=1&size=20&works=true", owner, "", nil)
	if works.Code != 200 || !bytes.Contains(works.Body.Bytes(), []byte(job.ID)) || !bytes.Contains(works.Body.Bytes(), []byte("用户上传")) {
		t.Fatal("work missing from the owner's list", works.Code, works.Body.String())
	}
	if call(a, "DELETE", "/api/works/"+job.ID, owner, "", nil).Code != 200 {
		t.Fatal("owner cannot delete the uploaded work")
	}
}
