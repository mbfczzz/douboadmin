package arkvideo

import (
	"doubo/server/internal/core"
	"fmt"
	"strings"
)

// Mode is the generation mode of a video job: the one the editor chose, else
// what its references imply (the same rule as the relay request).
func Mode(in core.JobInput, refs []core.Reference) string {
	if mode := core.NormalizeGenerationMode(in.Mode); mode != "" {
		return mode
	}
	images, others := 0, 0
	for _, r := range refs {
		if r.Type == "image" {
			images++
		} else {
			others++
		}
	}
	switch {
	case images == 1 && others == 0:
		return "i2v"
	case len(refs) > 0:
		return "omni_ref"
	}
	return "t2v"
}

// Body is the 创建视频生成任务 request. References keep their order within each
// kind, so @图片1 / @视频1 in the prompt name the first of each.
func Body(modelID string, in core.JobInput, refs []core.Reference) (map[string]any, error) {
	mode := Mode(in, refs)
	content := []any{map[string]any{"type": "text", "text": in.Prompt}}
	images := 0
	for _, r := range refs {
		switch r.Type {
		case "image":
			role := "reference_image"
			switch {
			case mode == "i2v" && images == 0, mode == "keyframe" && images == 0:
				role = "first_frame"
			case mode == "keyframe" && images == 1:
				role = "last_frame"
			case mode != "omni_ref":
				return nil, fmt.Errorf("首帧、首尾帧只能上传一到两张图片")
			}
			images++
			content = append(content, map[string]any{"type": "image_url", "image_url": map[string]string{"url": r.URL}, "role": role})
		case "video", "audio":
			if mode != "omni_ref" {
				return nil, fmt.Errorf("参考视频和音频需使用全能参考")
			}
			content = append(content, map[string]any{"type": r.Type + "_url", r.Type + "_url": map[string]string{"url": r.URL}, "role": "reference_" + r.Type})
		}
	}
	if (mode == "i2v" && images != 1) || (mode == "keyframe" && images != 2) {
		return nil, fmt.Errorf("参考图片数量与生成方式不匹配")
	}
	ratio := in.Ratio
	if mode == "i2v" || mode == "keyframe" {
		ratio = "adaptive" // first-frame tasks follow the picture (2.5 requires it)
	}
	// 方舟 drops a task unfinished after an hour (its minimum), within our
	// video job's own hour, so it is never billed for a job that timed out.
	body := map[string]any{"model": modelID, "content": content, "resolution": strings.ToLower(in.Resolution), "duration": in.Duration, "watermark": false,
		"execution_expires_after": 3600}
	if ratio != "" {
		body["ratio"] = ratio
	}
	return body, nil
}
