package systemtools

import (
	"bytes"
	"context"
	"errors"
	"io/fs"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestProbeReportsExecutableFailuresAndSafeVersion(t *testing.T) {
	for _, tc := range []struct {
		name, raw, status, version string
		lookupErr, runErr          error
	}{
		{"ffmpeg", "ffmpeg version 7.1.1-build Copyright\nconfiguration: extra", "ready", "7.1.1-build", nil, nil},
		{"ffprobe", "ffprobe version n8.0\r\nconfiguration: extra", "ready", "n8.0", nil, nil},
		{"ffmpeg", "", "missing", "", exec.ErrNotFound, nil},
		{"ffmpeg", "", "failed", "", fs.ErrPermission, nil},
		{"ffmpeg", "private-provider-token", "failed", "", nil, errors.New("private-provider-token")},
		{"ffmpeg", "", "timeout", "", nil, context.DeadlineExceeded},
		{"ffmpeg", "unexpected private-provider-token", "failed", "", nil, nil},
		{"ffmpeg", "ffprobe version 7", "failed", "", nil, nil},
	} {
		t.Run(tc.name+"-"+tc.status+"-"+tc.version, func(t *testing.T) {
			result := inspect(t.Context(), tc.name, func(name string) (string, error) {
				if name != tc.name {
					t.Fatal("unexpected executable", name)
				}
				return "/fixture/tool", tc.lookupErr
			}, func(ctx context.Context, path string) ([]byte, error) {
				deadline, ok := ctx.Deadline()
				if path != "/fixture/tool" || !ok || time.Until(deadline) > 2*time.Second {
					t.Fatal("unchecked path or missing execution deadline")
				}
				return []byte(tc.raw), tc.runErr
			})
			if result.Status != tc.status || result.Version != tc.version || strings.Contains(result.Error, "private-provider-token") {
				t.Fatal(result)
			}
		})
	}
}

func TestProbeHonorsCancellationDeadlineAndBoundsOutput(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Millisecond)
	defer cancel()
	out := inspect(ctx, "ffmpeg", func(string) (string, error) { return "/fixture/tool", nil }, func(ctx context.Context, _ string) ([]byte, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	})
	if out.Status != "timeout" {
		t.Fatal(out)
	}
	var buffer boundedOutput
	data := bytes.Repeat([]byte("x"), 100000)
	n, err := buffer.Write(data)
	if err != nil || n != len(data) || len(buffer.data) != 8<<10 {
		t.Fatal("output was not bounded", n, len(buffer.data), err)
	}
}

func TestInstalledMediaToolsVersionCommands(t *testing.T) {
	for _, name := range []string{"ffmpeg", "ffprobe"} {
		t.Run(name, func(t *testing.T) {
			if _, err := exec.LookPath(name); err != nil {
				t.Skip("media tool not present in this test process PATH")
			}
			out := probe(t.Context(), name)
			if out.Status != "ready" || out.Version == "" || out.Path == "" {
				t.Fatal(out)
			}
		})
	}
}
