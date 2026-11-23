package systemtools

import (
	"context"
	"errors"
	"os/exec"
	"testing"
	"time"
)

func TestAvailableRequiresBothExecutableVersionCommands(t *testing.T) {
	for _, tc := range []struct {
		name       string
		lookupFail string
		runFail    string
		want       bool
	}{
		{name: "both ready", want: true},
		{name: "ffmpeg missing", lookupFail: "ffmpeg"},
		{name: "ffprobe missing", lookupFail: "ffprobe"},
		{name: "ffmpeg failed", runFail: "/fixture/ffmpeg"},
		{name: "ffprobe failed", runFail: "/fixture/ffprobe"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			seen := []string{}
			got := available(t.Context(), func(name string) (string, error) {
				seen = append(seen, name)
				if name == tc.lookupFail {
					return "", exec.ErrNotFound
				}
				return "/fixture/" + name, nil
			}, func(ctx context.Context, path string) error {
				deadline, ok := ctx.Deadline()
				if !ok || time.Until(deadline) > 2*time.Second {
					t.Fatal("version command has no deadline")
				}
				if path == tc.runFail {
					return errors.New("failed")
				}
				return nil
			})
			if got != tc.want || len(seen) == 0 || seen[0] != "ffmpeg" {
				t.Fatal(got, seen)
			}
		})
	}
}

func TestInstalledMediaToolsAreAvailable(t *testing.T) {
	for _, name := range []string{"ffmpeg", "ffprobe"} {
		if _, err := exec.LookPath(name); err != nil {
			t.Skip("media tools not present in this test process PATH")
		}
	}
	if !Available(t.Context()) {
		t.Fatal("installed media tools failed their version commands")
	}
}
