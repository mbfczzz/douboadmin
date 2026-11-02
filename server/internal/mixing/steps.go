package mixing

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"doubo/server/internal/speech"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

func (e *Engine) progress(ctx context.Context, j core.Job, p int, stage string) {
	_ = e.Store.Progress(ctx, j, p, stage)
}

func (e *Engine) music(ctx context.Context, j core.Job, dir string) (string, error) {
	id := j.Input.Mix.MusicID
	owner := j.UserID
	if strings.HasPrefix(id, "asset:") {
		id = strings.TrimPrefix(id, "asset:")
	} else {
		row, err := e.Store.Get(ctx, "music", id)
		if err != nil {
			return "", err
		}
		var track struct {
			AssetID   string `json:"assetId"`
			Published bool   `json:"published"`
		}
		if json.Unmarshal(row.Data, &track) != nil || !track.Published {
			return "", fmt.Errorf("背景音乐已下架")
		}
		id = track.AssetID
		owner = row.Owner
	}
	asset, err := e.Media.Local(ctx, owner, id, dir)
	if err != nil {
		return "", err
	}
	return asset.Path, nil
}

func (e *Engine) transcribe(ctx context.Context, j core.Job, s *State, dir string, paths map[string]string) error {
	if !e.ASR.Ready() {
		return fmt.Errorf("语音识别服务尚未配置")
	}
	id := core.Digest("mix-step:" + j.ID + ":asr")[:32]
	row, err := e.Store.Get(ctx, "asr_runs", id)
	if err == nil {
		var data struct {
			Status   string    `json:"status"`
			Text     string    `json:"text"`
			Segments []Caption `json:"segments"`
			Error    string    `json:"error"`
		}
		if json.Unmarshal(row.Data, &data) != nil {
			return fmt.Errorf("语音识别记录异常")
		}
		if data.Status != "succeeded" {
			if data.Status == "failed" {
				return errors.New(data.Error)
			}
			return provider.ErrUncertain
		}
		s.Script = data.Text
		s.Captions = data.Segments
		return nil
	} else if !errors.Is(err, core.ErrNotFound) {
		return err
	}
	file, err := e.Runner.Audio(ctx, dir, s.Sources, paths, s.Cuts)
	if err != nil {
		return err
	}
	row, err = e.Store.Put(ctx, "asr_runs", core.Record{ID: id, Owner: j.UserID, Data: core.Data(map[string]string{"status": "submitting"})}, 0)
	if err != nil {
		return provider.ErrPending
	}
	result, err := e.ASR.Transcribe(ctx, file)
	if err != nil {
		var rejected *speech.Rejected
		if errors.As(err, &rejected) {
			row.Data = core.Data(map[string]any{"status": "failed", "error": err.Error()})
			_, _ = e.Store.Put(ctx, "asr_runs", row, row.Version)
			return err
		}
		return provider.ErrUncertain
	}
	s.Script = result.Text
	for _, segment := range result.Segments {
		if segment.Start < 0 || segment.End <= segment.Start || segment.End > s.Duration+1 {
			continue
		}
		s.Captions = append(s.Captions, Caption{Start: segment.Start, End: segment.End, Text: segment.Text})
	}
	row.Data = core.Data(map[string]any{"status": "succeeded", "text": s.Script, "segments": s.Captions})
	if _, err = e.Store.Put(ctx, "asr_runs", row, row.Version); err != nil {
		return provider.ErrPending
	}
	return nil
}
