package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
	"doubo/server/internal/wechat"
	"encoding/json"
	"encoding/xml"
	"errors"
	"log/slog"
	"maps"
	"strings"
	"time"
)

// Files go to WeChat's mediaCheckAsync once saved; the result comes by
// message push (virtualNotify → mediaChecked). A video is judged by three
// of its frames (WeChat takes images and audio only).

type checkURLs interface {
	CheckURL(ctx context.Context, key, kind string, ms int) (string, error)
}

// secFile is one file to judge: a stored object, or an outside address.
type secFile struct {
	key, url, kind string
	ms             int
}

// contentCheck is a pending judgement (content_checks, id = trace id).
type contentCheck struct {
	Target   string `json:"target"` // asset | work
	TargetID string `json:"targetId"`
	Kind     string `json:"kind"`
	Status   string `json:"status"` // pending | done
	Suggest  string `json:"suggest,omitempty"`
	Label    int    `json:"label,omitempty"`
}

// assetFiles: an upload as WeChat can judge it.
func assetFiles(row core.Record) []secFile {
	var v media.Asset
	if json.Unmarshal(row.Data, &v) != nil || v.Key == "" {
		return nil
	}
	kind, _, _ := strings.Cut(v.Type, "/")
	switch kind {
	case "image", "audio":
		return []secFile{{key: v.Key, kind: kind}}
	case "video":
		ms := int(v.Duration * 1000)
		if ms <= 0 {
			return []secFile{{key: v.Key, kind: kind}}
		}
		return []secFile{{key: v.Key, kind: kind}, {key: v.Key, kind: kind, ms: ms / 2}, {key: v.Key, kind: kind, ms: ms * 9 / 10}}
	}
	return nil
}

// checkMedia submits files of a mini-program user in the background (with
// that user's openid); a risky one marks target.
func (a *Server) checkMedia(ctx context.Context, id Identity, scene int, target, targetID string, files []secFile) {
	signer, ok := a.Objects.(checkURLs)
	if !a.secReady() || !ok || id.Role != "user" || len(files) == 0 {
		return
	}
	openid := a.secOpenID(ctx, id)
	if openid == "" {
		return
	}
	background := context.WithoutCancel(ctx)
	go func() {
		ctx, cancel := context.WithTimeout(background, 30*time.Second)
		defer cancel()
		for _, f := range files {
			u, err := f.url, error(nil)
			if f.key != "" {
				u, err = signer.CheckURL(ctx, f.key, f.kind, f.ms)
			}
			if err != nil || u == "" {
				continue
			}
			mediaType := wechat.MediaImage
			if f.kind == "audio" {
				mediaType = wechat.MediaAudio
			}
			trace, call, err := a.WeChat.MediaCheckAsync(ctx, openid, scene, mediaType, u)
			if req, ok := call.Request.(map[string]any); ok {
				req["media_url"] = "（已签名的文件地址）" // the log never keeps a usable link
			}
			a.secLog(id.ID, "提交文件内容安全检测", target, targetID, call, wechat.Verdict{}, err, "")
			if err != nil {
				continue
			}
			c := contentCheck{Target: target, TargetID: targetID, Kind: f.kind, Status: "pending"}
			if _, err = a.Store.Put(ctx, "content_checks", core.Record{ID: trace, Owner: id.ID, Data: core.Data(c)}, 0); err != nil {
				slog.Warn("content check not kept", "trace", trace, "error", err)
			}
		}
	}()
}

// mediaChecked takes a wxa_media_check push; an error asks WeChat to send it
// again.
func (a *Server) mediaChecked(ctx context.Context, payload string) error {
	var m wechat.MediaResult
	if json.Unmarshal([]byte(payload), &m) != nil && xml.Unmarshal([]byte(payload), &m) != nil || m.Trace == "" {
		return nil // not ours to answer again
	}
	// The push can come before the submission saved its trace id.
	row, e := a.Store.Get(ctx, "content_checks", m.Trace)
	for wait := 0; errors.Is(e, core.ErrNotFound) && wait < 6; wait++ {
		time.Sleep(250 * time.Millisecond)
		row, e = a.Store.Get(ctx, "content_checks", m.Trace)
	}
	if errors.Is(e, core.ErrNotFound) {
		return nil // not one of ours
	} else if e != nil {
		return e
	}
	var c contentCheck
	if json.Unmarshal(row.Data, &c) != nil || c.Status != "pending" {
		return nil // judged already (a repeated push)
	}
	// The target is marked first: if that fails, the check stays pending and
	// WeChat's next delivery tries again.
	if m.Result.Suggest == "risky" {
		reason := secReason(m.Result)
		switch c.Target {
		case "asset":
			e = a.markRecord(ctx, "assets", c.TargetID, "", map[string]any{"secCheck": "risky", "secReason": reason})
		case "work":
			e = a.markRecord(ctx, "work_meta", c.TargetID, row.Owner, map[string]any{"blocked": true, "blockReason": reason})
		}
		if e != nil {
			return e
		}
	}
	c.Status, c.Suggest, c.Label = "done", m.Result.Suggest, m.Result.Label
	row.Data = core.Data(c)
	if _, e = a.Store.Put(ctx, "content_checks", row, row.Version); errors.Is(e, core.ErrConflict) {
		return nil // another delivery recorded it
	} else if e != nil {
		return e
	}
	done := map[string]string{"asset": "素材已禁止用于创作", "work": "作品已停止对外展示（分享、优秀作品）"}[c.Target]
	a.secLog(row.Owner, "文件内容安全检测结果", c.Target, c.TargetID, wechat.SecCall{Path: "wxa_media_check", Response: []byte(payload)}, m.Result, nil, done)
	return nil
}

// markRecord sets fields of a record; owner set creates a missing one.
func (a *Server) markRecord(ctx context.Context, ns, id, owner string, fields map[string]any) error {
	for range 3 {
		row, e := a.Store.Get(ctx, ns, id)
		if errors.Is(e, core.ErrNotFound) && owner != "" {
			row, e = core.Record{ID: id, Owner: owner, Data: core.Data(map[string]any{})}, nil
		}
		if errors.Is(e, core.ErrNotFound) {
			return nil
		} else if e != nil {
			return e
		}
		data := map[string]any{}
		_ = json.Unmarshal(row.Data, &data)
		maps.Copy(data, fields)
		row.Data = core.Data(data)
		if _, e = a.Store.Put(ctx, ns, row, row.Version); !errors.Is(e, core.ErrConflict) {
			return e
		}
	}
	return core.ErrConflict
}

// workFiles: a finished work's results as WeChat can judge them.
func (a *Server) workFiles(ctx context.Context, j core.Job) []secFile {
	refs, _ := core.ResultRefs(j.Result)
	var files []secFile
	for _, ref := range refs {
		if !strings.HasPrefix(ref, "asset:") {
			if j.Input.Kind == "image" && strings.HasPrefix(ref, "https://") {
				files = append(files, secFile{url: ref, kind: "image"})
			}
			continue
		}
		row, e := a.Store.Get(ctx, "assets", strings.TrimPrefix(ref, "asset:"))
		if e != nil {
			continue
		}
		// A generated video's length is the job's when its file does not say.
		var v media.Asset
		if json.Unmarshal(row.Data, &v) == nil && v.Duration == 0 && j.Input.Duration > 0 {
			v.Duration = float64(j.Input.Duration)
			row.Data = core.Data(v)
		}
		files = append(files, assetFiles(row)...)
	}
	return files
}
