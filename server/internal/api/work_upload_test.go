package api

import (
	"bytes"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

var mp4Head = append([]byte("\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"), make([]byte, 64)...)
var pngPixel = []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89")

func workUploadFile(a *Server, token, user, title, name string, data []byte) *httptest.ResponseRecorder {
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	_ = w.WriteField("user", user)
	_ = w.WriteField("title", title)
	part, _ := w.CreateFormFile("file", name)
	_, _ = part.Write(data)
	_ = w.Close()
	r := httptest.NewRequest("POST", "/api/admin/works", &body)
	r.Header.Set("Content-Type", w.FormDataContentType())
	r.Header.Set("Authorization", "Bearer "+token)
	out := httptest.NewRecorder()
	a.Handler().ServeHTTP(out, r)
	return out
}

func workUpload(a *Server, token, user, title string, data []byte) *httptest.ResponseRecorder {
	return workUploadFile(a, token, user, title, "clip.mp4", data)
}

func TestAdminUploadedWorkLooksLikeAFinishedVideo(t *testing.T) {
	a, user, _ := setup(t)
	a.Media = &media.Service{Store: a.Store, Dir: a.Config.MediaDir}
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
	if featured := call(a, "PUT", "/api/admin/works/"+job.ID+"/featured", admin, "", map[string]any{"featured": true, "version": 0}); featured.Code != 200 {
		t.Fatal(featured.Code, featured.Body.String())
	}
	public := call(a, "GET", "/api/featured-works/"+job.ID, "", "", nil)
	var view featuredWorkView
	if public.Code != 200 || json.Unmarshal(public.Body.Bytes(), &view) != nil || view.Title != "门店宣传片" {
		t.Fatal("uploaded title missing from public work", public.Code, public.Body.String())
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
	image := workUploadFile(a, admin, "user-a", "门店海报", "poster.png", pngPixel)
	var imageJob core.Job
	if image.Code != 201 || json.Unmarshal(image.Body.Bytes(), &imageJob) != nil || imageJob.Input.Kind != "image" {
		t.Fatal("image upload failed", image.Code, image.Body.String())
	}
	if featured := call(a, "PUT", "/api/admin/works/"+imageJob.ID+"/featured", admin, "", map[string]any{"featured": true, "version": 0}); featured.Code != 200 {
		t.Fatal(featured.Code, featured.Body.String())
	}
	publicImage := call(a, "GET", "/api/featured-works/"+imageJob.ID, "", "", nil)
	var imageView featuredWorkView
	if publicImage.Code != 200 || json.Unmarshal(publicImage.Body.Bytes(), &imageView) != nil || imageView.Kind != "image" || len(imageView.Results) != 1 {
		t.Fatal("uploaded image missing from public works", publicImage.Code, publicImage.Body.String())
	}
}

// A large upload outlasts the server-wide read timeout; the route extends it.
func TestWorkUploadOutlastsServerReadTimeout(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "Tt661ea2")
	_, _ = a.Store.Put(t.Context(), "users", core.Record{ID: "user-a", Data: core.Data(map[string]string{"name": "A"})}, 0)
	srv := httptest.NewUnstartedServer(a.Handler())
	srv.Config.ReadTimeout = 300 * time.Millisecond
	srv.Start()
	defer srv.Close()
	pr, pw := io.Pipe()
	mw := multipart.NewWriter(pw)
	go func() {
		_ = mw.WriteField("user", "user-a")
		_ = mw.WriteField("title", "慢速上传")
		part, _ := mw.CreateFormFile("file", "clip.mp4")
		_, _ = part.Write(mp4Head)
		for range 4 { // keep sending well past the 300 ms read timeout
			time.Sleep(250 * time.Millisecond)
			_, _ = part.Write(make([]byte, 1024))
		}
		_ = mw.Close()
		_ = pw.Close()
	}()
	req, _ := http.NewRequest("POST", srv.URL+"/api/admin/works", pr)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+admin)
	res, err := srv.Client().Do(req)
	if err != nil {
		t.Fatal("slow upload was cut off", err)
	}
	defer res.Body.Close()
	if res.StatusCode != 201 {
		body, _ := io.ReadAll(res.Body)
		t.Fatal(res.StatusCode, string(body))
	}
}
