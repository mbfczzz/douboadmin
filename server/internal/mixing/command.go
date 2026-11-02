package mixing

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"
	"sync"
)

type boundedOutput struct {
	mu    sync.Mutex
	data  []byte
	limit int
}

func (b *boundedOutput) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.data = append(b.data, p...)
	if len(b.data) > b.limit {
		b.data = b.data[len(b.data)-b.limit:]
	}
	return len(p), nil
}
func (b *boundedOutput) String() string { b.mu.Lock(); defer b.mu.Unlock(); return string(b.data) }

type Runner struct {
	FFmpeg, FFprobe string
	Threads         int
}

func (r Runner) Ready() bool {
	_, e1 := exec.LookPath(r.FFmpeg)
	_, e2 := exec.LookPath(r.FFprobe)
	return r.FFmpeg != "" && r.FFprobe != "" && e1 == nil && e2 == nil
}

func (r Runner) Run(ctx context.Context, dir string, args []string, duration float64, onProgress func(int)) error {
	base := []string{"-hide_banner", "-nostdin", "-y", "-threads", "2", "-filter_threads", "1", "-filter_complex_threads", "1", "-progress", "pipe:1", "-stats_period", "1"}
	cmd := exec.CommandContext(ctx, r.FFmpeg, append(base, args...)...)
	hideWindow(cmd)
	cmd.Dir = dir
	var stderr = boundedOutput{limit: 24 << 10}
	cmd.Stderr = &stderr
	stdout, e := cmd.StdoutPipe()
	if e != nil {
		return e
	}
	if e = cmd.Start(); e != nil {
		return fmt.Errorf("无法启动视频处理程序")
	}
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "out_time_us=") && duration > 0 && onProgress != nil {
			v, _ := strconv.ParseFloat(strings.TrimPrefix(line, "out_time_us="), 64)
			p := int(v / 1e6 / duration * 100)
			if p > 99 {
				p = 99
			}
			if p >= 0 {
				onProgress(p)
			}
		}
	}
	if e = cmd.Wait(); e != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return fmt.Errorf("视频处理失败：%s", compactError(stderr.String()))
	}
	return scanner.Err()
}
func compactError(raw string) string {
	lines := strings.Split(strings.TrimSpace(raw), "\n")
	if len(lines) > 4 {
		lines = lines[len(lines)-4:]
	}
	s := strings.Join(lines, " ")
	if len(s) > 700 {
		s = s[len(s)-700:]
	}
	return s
}

func commandOutput(ctx context.Context, exe string, args []string) ([]byte, error) {
	cmd := exec.CommandContext(ctx, exe, args...)
	hideWindow(cmd)
	out := &boundedOutput{limit: 1 << 20}
	errOut := &boundedOutput{limit: 16 << 10}
	cmd.Stdout = out
	cmd.Stderr = errOut
	if e := cmd.Run(); e != nil {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("素材分析失败：%s", compactError(errOut.String()))
	}
	return []byte(out.String()), nil
}

var _ io.Writer = (*boundedOutput)(nil)
