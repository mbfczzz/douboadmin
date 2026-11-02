//go:build !windows

package mixing

import "os/exec"

func hideWindow(*exec.Cmd) {}
