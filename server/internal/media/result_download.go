package media

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
)

// Never include the underlying error text: URL errors can contain signed URLs.
func resultDownloadError(err error, size int64) error {
	var timeout net.Error
	if errors.Is(err, context.DeadlineExceeded) || errors.As(err, &timeout) && timeout.Timeout() {
		return fmt.Errorf("生成结果下载超时（已接收 %.2f MiB）", float64(size)/(1<<20))
	}
	if errors.Is(err, context.Canceled) {
		return fmt.Errorf("生成结果下载已中断：任务执行被取消")
	}
	var fileError *os.PathError
	if errors.As(err, &fileError) {
		return fmt.Errorf("生成结果写入临时文件失败，请检查服务器临时目录空间和权限")
	}
	if errors.Is(err, io.ErrUnexpectedEOF) {
		return fmt.Errorf("生成结果下载不完整：连接提前结束（已接收 %.2f MiB）", float64(size)/(1<<20))
	}
	return fmt.Errorf("生成结果下载中断（已接收 %.2f MiB）", float64(size)/(1<<20))
}

func copyGeneratedResult(dst io.Writer, body io.Reader, expected, limit int64) (int64, error) {
	if expected > limit {
		return 0, fmt.Errorf("生成结果大小 %.2f MiB 超过 %.0f MiB 上限", float64(expected)/(1<<20), float64(limit)/(1<<20))
	}
	size, err := io.Copy(dst, io.LimitReader(body, limit+1))
	if size > limit {
		return size, fmt.Errorf("生成结果超过 %.0f MiB 上限（已接收 %.2f MiB）", float64(limit)/(1<<20), float64(size)/(1<<20))
	}
	if err != nil {
		return size, resultDownloadError(err, size)
	}
	if expected > 0 && size != expected {
		return size, fmt.Errorf("生成结果下载不完整（已接收 %d 字节，预期 %d 字节）", size, expected)
	}
	if size == 0 {
		return 0, fmt.Errorf("生成结果下载内容为空")
	}
	return size, nil
}
