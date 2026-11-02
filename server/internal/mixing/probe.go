package mixing

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"time"
)

type Probe struct {
	Duration float64 `json:"duration"`
	Width    int     `json:"width"`
	Height   int     `json:"height"`
	HasAudio bool    `json:"hasAudio"`
}

func (r Runner) Probe(ctx context.Context, path string) (Probe, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	raw, e := commandOutput(ctx, r.FFprobe, []string{"-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries", "format=duration:stream=codec_type,width,height,duration", "-of", "json", path})
	if e != nil {
		return Probe{}, e
	}
	var data struct {
		Format struct {
			Duration string `json:"duration"`
		} `json:"format"`
		Streams []struct {
			Type          string `json:"codec_type"`
			Width, Height int
			Duration      string `json:"duration"`
		} `json:"streams"`
	}
	if e = json.Unmarshal(raw, &data); e != nil {
		return Probe{}, fmt.Errorf("无法读取素材信息")
	}
	var out Probe
	out.Duration, _ = strconv.ParseFloat(data.Format.Duration, 64)
	for _, s := range data.Streams {
		if s.Type == "video" && out.Width == 0 {
			out.Width = s.Width
			out.Height = s.Height
		}
		if s.Type == "audio" {
			out.HasAudio = true
		}
		if d, e := strconv.ParseFloat(s.Duration, 64); e == nil && d > out.Duration {
			out.Duration = d
		}
	}
	if out.Width > 8192 || out.Height > 8192 || int64(out.Width)*int64(out.Height) > 16777216 {
		return out, fmt.Errorf("请将素材压缩到 4K 以内")
	}
	return out, nil
}

var sceneTime = regexp.MustCompile(`pts_time:([0-9.]+)`)

func (r Runner) Scenes(ctx context.Context, path string, duration float64) ([]float64, error) {
	if duration > 120 {
		duration = 120
	}
	ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	// showinfo writes to stderr; only selected scene changes are retained.
	args := []string{"-hide_banner", "-nostdin", "-threads", "2", "-protocol_whitelist", "file,pipe", "-i", path, "-t", strconv.FormatFloat(duration, 'f', 3, 64), "-an", "-vf", "scale=320:-2,select='gt(scene,0.3)',showinfo", "-f", "null", "-"}
	cmd := sceneCommand(ctx, r.FFmpeg, args)
	raw, e := cmd()
	if e != nil {
		return nil, e
	}
	out := []float64{0}
	for _, m := range sceneTime.FindAllStringSubmatch(raw, 120) {
		v, _ := strconv.ParseFloat(m[1], 64)
		if v-out[len(out)-1] >= 0.8 {
			out = append(out, v)
		}
	}
	return out, nil
}
