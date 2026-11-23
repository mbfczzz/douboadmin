package systemtools

import (
	"context"
	"io"
	"os/exec"
	"time"
)

// Available reports whether the current API process can execute both tools.
// It runs only fixed local version commands and never accepts user input.
func Available(ctx context.Context) bool {
	return available(ctx, exec.LookPath, runVersion)
}

func available(ctx context.Context, lookup func(string) (string, error), run func(context.Context, string) error) bool {
	for _, name := range []string{"ffmpeg", "ffprobe"} {
		path, err := lookup(name)
		if err != nil {
			return false
		}
		runCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		err = run(runCtx, path)
		cancel()
		if err != nil {
			return false
		}
	}
	return true
}

func runVersion(ctx context.Context, path string) error {
	cmd := exec.CommandContext(ctx, path, "-version")
	cmd.WaitDelay = 250 * time.Millisecond
	cmd.Stdout, cmd.Stderr = io.Discard, io.Discard
	return cmd.Run()
}
