package mixing

import (
	"context"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestPlanAndCaptions(t *testing.T) {
	plan, e := Plan([]Source{{ID: "image", Image: true}, {ID: "video", Info: Probe{Duration: 8}, Scenes: []float64{0, 3, 6}}}, 15, "clean")
	if e != nil {
		t.Fatal(e)
	}
	sum := 0.0
	for _, cut := range plan {
		if cut.Duration <= 0 || cut.Start < 0 {
			t.Fatal(cut)
		}
		sum += cut.Duration
	}
	if sum < 14.99 || sum > 15.01 {
		t.Fatal(sum)
	}
	caption := CaptionText("第一句话。第二句话。", 10)
	if len(caption) != 2 || caption[1].End != 10 {
		t.Fatal(caption)
	}
}

func TestRealFFmpegRenderAndSceneDetection(t *testing.T) {
	if os.Getenv("FFMPEG_INTEGRATION") != "true" {
		t.Skip("set FFMPEG_INTEGRATION=true with FFmpeg/FFprobe paths")
	}
	r := Runner{FFmpeg: os.Getenv("FFMPEG_PATH"), FFprobe: os.Getenv("FFPROBE_PATH")}
	if !r.Ready() {
		t.Fatal("FFmpeg tools unavailable")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	dir := t.TempDir()
	imagePath := filepath.Join(dir, "image.png")
	file, e := os.Create(imagePath)
	if e != nil {
		t.Fatal(e)
	}
	img := image.NewRGBA(image.Rect(0, 0, 320, 180))
	for y := 0; y < 180; y++ {
		for x := 0; x < 320; x++ {
			img.Set(x, y, color.RGBA{uint8(x % 255), uint8(y), 100, 255})
		}
	}
	if e = png.Encode(file, img); e != nil {
		t.Fatal(e)
	}
	file.Close()
	args := []string{"-f", "lavfi", "-i", "color=c=red:s=320x180:r=25:d=1", "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=25:d=1", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-c:v", "libx264", "-threads", "2", "scene.mp4"}
	if e = r.Run(ctx, dir, args, 0, nil); e != nil {
		t.Fatal(e)
	}
	videoPath := filepath.Join(dir, "scene.mp4")
	probe, e := r.Probe(ctx, videoPath)
	if e != nil || probe.Duration < 1.9 {
		t.Fatal(probe, e)
	}
	scenes, e := r.Scenes(ctx, videoPath, probe.Duration)
	if e != nil || len(scenes) < 2 {
		t.Fatal("scene cut was not detected", scenes, e)
	}
	sources := []Source{{ID: "image", Image: true}, {ID: "video", Info: probe, Scenes: scenes}}
	cuts, e := Plan(sources, 3, "rhythm")
	if e != nil {
		t.Fatal(e)
	}
	if e = os.WriteFile(filepath.Join(dir, "captions.srt"), []byte(Subtitle(CaptionText("豆播混剪测试。", 3))), 0600); e != nil {
		t.Fatal(e)
	}
	out, e := r.Render(ctx, dir, sources, map[string]string{"image": imagePath, "video": videoPath}, cuts, RenderOptions{Ratio: "16:9", Resolution: "720p", Duration: 3, Subtitle: "captions.srt"}, nil)
	if e != nil {
		t.Fatal(e)
	}
	result, e := r.Probe(ctx, out)
	if e != nil || result.Width != 1280 || result.Height != 720 || result.Duration < 2.9 || result.Duration > 3.2 || !result.HasAudio {
		t.Fatal(result, e)
	}
}
