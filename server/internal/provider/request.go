package provider

import (
	"doubo/server/internal/core"
	"fmt"
)

// Request maps the shared editor into the relay's documented modality contracts.
func Request(in core.JobInput, key string, assets []core.Reference) (string, map[string]any, error) {
	images, videos, audios := []string{}, []string{}, []string{}
	for _, a := range assets {
		switch a.Type {
		case "image":
			images = append(images, a.URL)
		case "video":
			videos = append(videos, a.URL)
		case "audio":
			audios = append(audios, a.URL)
		}
	}
	body := map[string]any{"model": key, "prompt": in.Prompt}
	put := func(k, v string) {
		if v != "" {
			body[k] = v
		}
	}
	switch in.Kind {
	case "audio":
		body := map[string]any{"model": key, "input": in.Prompt}
		if in.Voice != "" {
			body["voice"] = in.Voice
		}
		return "/v1/audio/speech", body, nil
	case "chat":
		content := any(in.Prompt)
		if len(assets) > 0 {
			parts := []any{map[string]string{"type": "text", "text": in.Prompt}}
			for _, u := range images {
				parts = append(parts, map[string]any{"type": "image_url", "image_url": map[string]string{"url": u}})
			}
			content = parts
		}
		return "/v1/chat/completions", map[string]any{"model": key, "stream": false, "messages": []any{map[string]any{"role": "user", "content": content}}}, nil
	case "image":
		put("resolution", in.Resolution)
		put("aspect_ratio", in.Ratio)
		put("quality", in.Quality)
		if len(assets) > 0 {
			body["image_urls"] = images
			return "/v1/images/edits", body, nil
		}
		return "/v1/images/generations", body, nil
	case "video":
		mode := in.Mode
		if mode == "" {
			mode = "t2v"
			if len(images) == 1 && len(videos) == 0 && len(audios) == 0 {
				mode = "i2v"
			}
			if len(assets) > 1 || len(videos) > 0 || len(audios) > 0 {
				mode = "omni_ref"
			}
		}
		body["mode"] = mode
		put("resolution", in.Resolution)
		put("ratio", in.Ratio)
		if in.Duration > 0 {
			body["duration"] = in.Duration
		}
		if mode == "i2v" && len(images) > 0 {
			body["image_url"] = images[0]
		} else if len(assets) > 0 {
			body["image_urls"] = images
		}
		if len(videos) > 0 {
			body["video_urls"] = videos
		}
		if len(audios) > 0 {
			body["audio_urls"] = audios
		}
		return "/openapi/v1/generations", body, nil
	default:
		return "", nil, fmt.Errorf("此生成类型尚未接入")
	}
}
