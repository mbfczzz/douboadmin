package mixing

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
)

func (e *Engine) advance(ctx context.Context, j core.Job, row *core.Record, s *State, dir string) (string, error) {
	options := j.Input.Mix
	if options == nil {
		return "", fmt.Errorf("缺少混剪参数")
	}
	paths, err := e.inputs(ctx, j, dir)
	if err != nil {
		return "", err
	}
	switch s.Step {
	case "analyze":
		e.progress(ctx, j, 5, "分析素材与镜头")
		for _, id := range j.Input.Assets {
			record, er := e.Store.Get(ctx, "assets", id)
			if er != nil {
				return "", er
			}
			var asset struct {
				Type string `json:"type"`
			}
			_ = json.Unmarshal(record.Data, &asset)
			info, er := e.Runner.Probe(ctx, paths[id])
			if er != nil {
				return "", er
			}
			source := Source{ID: id, Image: strings.HasPrefix(asset.Type, "image/"), Info: info}
			if !source.Image && options.AutoScenes {
				source.Scenes, er = e.Runner.Scenes(ctx, paths[id], info.Duration)
				if er != nil {
					return "", er
				}
			}
			s.Sources = append(s.Sources, source)
		}
		s.Cuts, err = Plan(s.Sources, s.Duration, j.Input.Style)
		if err != nil {
			return "", err
		}
		s.Step = "transcribe"
	case "transcribe":
		if options.Transcribe {
			e.progress(ctx, j, 15, "识别原声文案")
			if err = e.transcribe(ctx, j, s, dir, paths); err != nil {
				return "", err
			}
		}
		s.Step = "rewrite"
	case "rewrite":
		if options.Rewrite {
			e.progress(ctx, j, 25, "AI 改写文案")
			prompt := "请将以下内容改写为简洁的短视频旁白，保留事实，直接输出文案，不要标题或解释。\n" + s.Script
			child := childJob(j, "rewrite", "chat", options.RewriteModel, prompt)
			value, er := e.generateChild(ctx, child, s)
			if er != nil {
				return "", er
			}
			s.Script = strings.TrimSpace(value)
		}
		s.Step = "voice"
	case "voice":
		if options.Narration {
			e.progress(ctx, j, 35, "生成 AI 配音")
			if strings.TrimSpace(s.Script) == "" {
				return "", fmt.Errorf("配音需要有效文案")
			}
			child := childJob(j, "voice", "audio", options.TTSModel, s.Script)
			child.Input.Voice = options.Voice
			value, er := e.generateChild(ctx, child, s)
			if er != nil {
				return "", er
			}
			s.VoiceResult = value
		}
		s.Step = "render"
	case "render":
		e.progress(ctx, j, 40, "合成字幕、音乐与画面")
		render := RenderOptions{Ratio: j.Input.Ratio, Resolution: j.Input.Resolution, Style: j.Input.Style, Duration: s.Duration, MusicVolume: options.MusicVolume, KeepOriginal: options.KeepOriginalAudio}
		if s.VoiceResult != "" {
			voice, er := e.Media.Local(ctx, j.UserID, strings.TrimPrefix(s.VoiceResult, "asset:"), dir)
			if er != nil {
				return "", er
			}
			render.Voice = voice.Path
			probe, er := e.Runner.Probe(ctx, voice.Path)
			if er != nil {
				return "", er
			}
			render.Duration = math.Max(s.Duration, math.Ceil(probe.Duration+.2))
			if render.Duration > 120 {
				return "", fmt.Errorf("配音超过两分钟，请缩短文案")
			}
		}
		if options.MusicID != "" {
			render.Music, err = e.music(ctx, j, dir)
			if err != nil {
				return "", err
			}
		}
		if options.Captions {
			if strings.TrimSpace(s.Script) == "" {
				return "", fmt.Errorf("字幕需要文案或语音识别结果")
			}
			captions := s.Captions
			if options.Rewrite || options.Narration || len(captions) == 0 {
				captions = CaptionText(s.Script, render.Duration)
				s.Timing = "estimated"
			} else {
				s.Timing = "asr"
			}
			if err = os.WriteFile(filepath.Join(dir, "captions.srt"), []byte(Subtitle(captions)), 0600); err != nil {
				return "", err
			}
			render.Subtitle = "captions.srt"
		}
		cuts, er := Plan(s.Sources, render.Duration, j.Input.Style)
		if er != nil {
			return "", er
		}
		file, er := e.Runner.Render(ctx, dir, s.Sources, paths, cuts, render, func(p int) { e.progress(ctx, j, 40+p*55/100, "正在渲染视频") })
		if er != nil {
			return "", er
		}
		s.Duration = render.Duration
		s.Result, err = e.Media.SaveLocal(ctx, j, file)
		if err != nil {
			return "", recoverable{err}
		}
		s.Step = "done"
		s.Phase = "succeeded"
		if e.save(ctx, row, *s) != nil {
			return "", provider.ErrPending
		}
		return s.Result, nil
	default:
		return "", fmt.Errorf("混剪处理阶段无效")
	}
	if e.save(ctx, row, *s) != nil {
		return "", provider.ErrPending
	}
	return "", provider.ErrPending
}
