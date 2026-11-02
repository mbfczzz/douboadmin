package mixing

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type RenderOptions struct {
	Ratio, Resolution, Style, Music, Voice, Subtitle string
	Duration, MusicVolume                            float64
	KeepOriginal                                     bool
}

func decimal(n float64) string { return strconv.FormatFloat(n, 'f', 3, 64) }
func (r Runner) Render(ctx context.Context, dir string, sources []Source, paths map[string]string, cuts []Cut, o RenderOptions, progress func(int)) (string, error) {
	width, height := dimensions(o.Ratio, o.Resolution)
	parts := []string{}
	info := map[string]Source{}
	for _, s := range sources {
		info[s.ID] = s
	}
	for i, cut := range cuts {
		s := info[cut.AssetID]
		input := paths[cut.AssetID]
		if input == "" {
			return "", fmt.Errorf("镜头素材缺失")
		}
		args := []string{"-protocol_whitelist", "file,pipe"}
		if s.Image {
			args = append(args, "-loop", "1", "-framerate", "25")
		} else {
			args = append(args, "-ss", decimal(cut.Start))
		}
		args = append(args, "-i", input, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo")
		filter := fmt.Sprintf("scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,setsar=1,fps=25", width, height, width, height)
		if s.Image {
			filter += fmt.Sprintf(",zoompan=z='min(zoom+0.001,1.12)':d=1:s=%dx%d:fps=25", width, height)
		}
		if o.Style == "cinematic" {
			filter += ",eq=contrast=1.05:saturation=0.88:brightness=-0.015"
		}
		audio := "1:a:0"
		if o.KeepOriginal && s.Info.HasAudio && !s.Image {
			audio = "0:a:0"
		}
		part := fmt.Sprintf("part-%03d.mp4", i)
		args = append(args, "-map", "0:v:0", "-map", audio, "-vf", filter, "-af", "aresample=48000,aformat=channel_layouts=stereo,apad", "-t", decimal(cut.Duration), "-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-pix_fmt", "yuv420p", "-threads", "2", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", part)
		if err := r.Run(ctx, dir, args, cut.Duration, nil); err != nil {
			return "", err
		}
		parts = append(parts, "file '"+part+"'")
		if progress != nil {
			progress((i + 1) * 65 / len(cuts))
		}
	}
	if err := os.WriteFile(filepath.Join(dir, "concat.txt"), []byte(strings.Join(parts, "\n")), 0600); err != nil {
		return "", err
	}
	if err := r.Run(ctx, dir, []string{"-f", "concat", "-safe", "1", "-i", "concat.txt", "-c", "copy", "joined.mp4"}, 0, nil); err != nil {
		return "", err
	}
	return r.finish(ctx, dir, o, func(p int) {
		if progress != nil {
			progress(65 + p*35/100)
		}
	})
}

func (r Runner) finish(ctx context.Context, dir string, o RenderOptions, progress func(int)) (string, error) {
	args := []string{"-i", "joined.mp4"}
	index := 1
	filters := []string{"[0:a]volume=1,apad[a0]"}
	audioInputs := []string{"[a0]"}
	if o.Voice != "" {
		args = append(args, "-i", o.Voice)
		filters = append(filters, fmt.Sprintf("[%d:a]aresample=48000,apad[voice]", index))
		audioInputs = append(audioInputs, "[voice]")
		index++
	}
	if o.Music != "" {
		args = append(args, "-stream_loop", "-1", "-i", o.Music)
		filters = append(filters, fmt.Sprintf("[%d:a]aresample=48000,volume=%s[bgm]", index, decimal(o.MusicVolume)))
		audioInputs = append(audioInputs, "[bgm]")
	}
	filters = append(filters, fmt.Sprintf("%samix=inputs=%d:duration=longest:normalize=0,alimiter=limit=0.95[outa]", strings.Join(audioInputs, ""), len(audioInputs)))
	video := "tpad=stop_mode=clone:stop_duration=2"
	if o.Subtitle != "" {
		video += ",subtitles=filename=captions.srt:force_style='FontName=Noto Sans CJK SC,FontSize=20,Outline=1,Shadow=0,MarginV=28'"
	}
	args = append(args, "-filter_complex", strings.Join(filters, ";"), "-map", "0:v:0", "-map", "[outa]", "-vf", video, "-t", decimal(o.Duration), "-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-threads", "2", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "result.mp4")
	if err := r.Run(ctx, dir, args, o.Duration, progress); err != nil {
		return "", err
	}
	return filepath.Join(dir, "result.mp4"), nil
}
