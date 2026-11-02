package mixing

import (
	"context"
	"fmt"
	"io"
	"os/exec"
)

func sceneCommand(ctx context.Context, exe string, args []string) func() (string, error) {
	return func() (string, error) {
		cmd := exec.CommandContext(ctx, exe, args...)
		hideWindow(cmd)
		out := &boundedOutput{limit: 1 << 20}
		cmd.Stderr = out
		cmd.Stdout = io.Discard
		if e := cmd.Run(); e != nil {
			if ctx.Err() != nil {
				return "", ctx.Err()
			}
			return "", fmt.Errorf("自动镜头分析失败")
		}
		return out.String(), nil
	}
}
