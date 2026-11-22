package systemtools

import (
	"context"
	"doubo/server/internal/core"
	"errors"
	"io/fs"
	"os/exec"
	"strings"
	"time"
)

// Only fixed, local executables and -version are used. No shell, URLs, media
// inputs, installation or client-supplied commands are involved.
func probe(ctx context.Context, name string) core.ToolCheck {
	return inspect(ctx, name, exec.LookPath, runVersion)
}

func inspect(ctx context.Context, name string, lookup func(string) (string, error), run func(context.Context, string) ([]byte, error)) core.ToolCheck {
	path, err := lookup(name)
	if err != nil {
		if errors.Is(err, exec.ErrNotFound) || errors.Is(err, fs.ErrNotExist) {
			return core.ToolCheck{Status: "missing", Error: "未在服务进程的 PATH 中找到，请安装并检查服务环境。"}
		}
		return core.ToolCheck{Status: "failed", Error: "无法定位可执行文件，请检查服务账号权限和 PATH。"}
	}
	out := core.ToolCheck{Path: path}
	runCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	raw, err := run(runCtx, path)
	if err != nil {
		if errors.Is(runCtx.Err(), context.DeadlineExceeded) || errors.Is(err, context.DeadlineExceeded) {
			out.Status, out.Error = "timeout", "版本检查超时，请检查可执行文件及服务运行环境。"
		} else {
			out.Status, out.Error = "failed", "版本命令执行失败，请检查权限或缺失的动态库。"
		}
		return out
	}
	line, _, _ := strings.Cut(string(raw), "\n")
	parts := strings.Fields(line)
	if len(parts) < 3 || parts[0] != name || parts[1] != "version" || len(parts[2]) > 120 {
		out.Status, out.Error = "failed", "无法识别版本信息，请检查可执行文件是否有效。"
		return out
	}
	out.Status, out.Version = "ready", parts[2]
	return out
}

type boundedOutput struct{ data []byte }

func (b *boundedOutput) Write(data []byte) (int, error) {
	if left := (8 << 10) - len(b.data); left > 0 {
		b.data = append(b.data, data[:min(left, len(data))]...)
	}
	return len(data), nil
}

func runVersion(ctx context.Context, path string) ([]byte, error) {
	var output boundedOutput
	cmd := exec.CommandContext(ctx, path, "-version")
	cmd.WaitDelay = 250 * time.Millisecond
	cmd.Stdout, cmd.Stderr = &output, &output
	err := cmd.Run()
	return output.data, err
}
