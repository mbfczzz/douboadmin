package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
	"net/http"
	"strings"
)

const workUploadLimit = 50 << 20

// uploadWork stores a video an administrator uploads for a user as a finished
// work. It reuses the ordinary job shape (kind video, succeeded, asset result)
// so released mini-program builds list, play, share and delete it unchanged.
func (a *Server) uploadWork(w http.ResponseWriter, r *http.Request) {
	if a.Config.Production && a.Objects == nil {
		fail(w, 503, "请先在后台系统设置中配置 OSS 存储")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, workUploadLimit+(1<<20))
	if e := r.ParseMultipartForm(2 << 20); e != nil {
		if r.MultipartForm != nil {
			_ = r.MultipartForm.RemoveAll()
		}
		fail(w, 400, "上传失败，视频不能超过 50 MB")
		return
	}
	defer r.MultipartForm.RemoveAll()
	title := strings.TrimSpace(r.FormValue("title"))
	if title == "" || len([]rune(title)) > 60 {
		fail(w, 400, "请填写 60 字以内的作品标题")
		return
	}
	owner, msg := a.workOwner(r.Context(), strings.TrimSpace(r.FormValue("user")))
	if msg != "" {
		fail(w, 400, msg)
		return
	}
	file, header, e := r.FormFile("file")
	if e != nil {
		fail(w, 400, "请选择视频文件")
		return
	}
	defer file.Close()
	head := make([]byte, 512)
	n, _ := file.Read(head)
	_, _ = file.Seek(0, 0)
	if header.Size > workUploadLimit || http.DetectContentType(head[:n]) != "video/mp4" {
		fail(w, 400, "作品仅支持 50 MB 以内的 MP4 视频")
		return
	}
	asset, e := a.saveAsset(r.Context(), owner, file, header.Filename, "video/mp4", header.Size)
	if e != nil {
		if errors.Is(e, errSaveFile) {
			fail(w, 503, "文件保存失败")
		} else {
			dbError(w, e)
		}
		return
	}
	job := core.Job{ID: core.NewID(), UserID: owner, Status: "succeeded", Progress: 100, Result: "asset:" + asset.ID,
		Input: core.JobInput{Kind: "video", Prompt: title, Assets: []string{}, Source: "upload"}}
	if e = store.CreateUploadedWork(r.Context(), a.Store, job); e != nil {
		dbError(w, e)
		return
	}
	if job, e = a.Store.Job(r.Context(), job.ID); e != nil {
		dbError(w, e)
		return
	}
	a.presentJob(r.Context(), &job)
	reply(w, 201, job)
}

// workOwner resolves a mini-program user from a phone number or user ID.
func (a *Server) workOwner(ctx context.Context, ref string) (string, string) {
	if ref == "" {
		return "", "请填写用户手机号或用户编号"
	}
	id := ref
	if mainlandPhone.MatchString(ref) {
		_, o, e := recordOf[phoneOwner](ctx, a.Store, "phone_owners", ref)
		if e != nil || o.User == "" {
			return "", "没有找到使用该手机号的用户"
		}
		id = o.User
	}
	f, e := a.userState(ctx, id)
	switch {
	case e != nil:
		return "", "用户不存在"
	case f.Archived:
		return "", "该用户已删除"
	case f.Disabled:
		return "", "该用户已停用"
	}
	return id, ""
}
