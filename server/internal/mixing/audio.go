package mixing

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func (r Runner) Audio(ctx context.Context, dir string, sources []Source, paths map[string]string, cuts []Cut) (string, error) {
	info := map[string]Source{}
	for _, s := range sources {
		info[s.ID] = s
	}
	parts := []string{}
	hasVoice := false
	for i, cut := range cuts {
		input := paths[cut.AssetID]
		s := info[cut.AssetID]
		name := fmt.Sprintf("audio-%03d.wav", i)
		args := []string{}
		if s.Info.HasAudio && !s.Image {
			hasVoice = true
			args = append(args, "-protocol_whitelist", "file,pipe", "-ss", decimal(cut.Start), "-i", input, "-vn")
		} else {
			args = append(args, "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono")
		}
		args = append(args, "-af", "apad", "-t", decimal(cut.Duration), "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", name)
		if e := r.Run(ctx, dir, args, 0, nil); e != nil {
			return "", e
		}
		parts = append(parts, "file '"+name+"'")
	}
	if !hasVoice {
		return "", fmt.Errorf("素材中没有音轨，请关闭语音识别并手动填写文案")
	}
	if e := os.WriteFile(filepath.Join(dir, "audio-list.txt"), []byte(strings.Join(parts, "\n")), 0600); e != nil {
		return "", e
	}
	if e := r.Run(ctx, dir, []string{"-f", "concat", "-safe", "1", "-i", "audio-list.txt", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "transcript.wav"}, 0, nil); e != nil {
		return "", e
	}
	return filepath.Join(dir, "transcript.wav"), nil
}
