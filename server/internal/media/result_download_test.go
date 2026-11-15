package media

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/url"
	"os"
	"strings"
	"testing"
)

type failedReader struct{ err error }

func (r failedReader) Read([]byte) (int, error) { return 0, r.err }

func TestResultDownloadDistinguishesBodyFailuresWithoutLeakingURLs(t *testing.T) {
	for _, tt := range []struct {
		name string
		err  error
		want string
	}{
		{"timeout", &url.Error{Op: "Get", URL: "https://private.test/image?sig=secret", Err: context.DeadlineExceeded}, "下载超时"},
		{"canceled", context.Canceled, "执行被取消"},
		{"truncated", io.ErrUnexpectedEOF, "连接提前结束"},
		{"network", errors.New("network failure https://private.test/?sig=secret"), "下载中断"},
		{"disk", &os.PathError{Op: "write", Path: "/private/tmp/result", Err: errors.New("disk full")}, "临时文件失败"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			body := io.MultiReader(strings.NewReader("partial"), failedReader{tt.err})
			size, err := copyGeneratedResult(io.Discard, body, -1, 1024)
			if size != 7 || err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatal(size, err)
			}
			if strings.Contains(err.Error(), "secret") || strings.Contains(err.Error(), "private") {
				t.Fatal("private details leaked", err)
			}
		})
	}
}

func TestResultDownloadReportsOversizeEmptyAndLengthMismatch(t *testing.T) {
	for _, tt := range []struct {
		body            string
		expected, limit int64
		want            string
	}{
		{"not read", 31 << 20, 30 << 20, "大小 31.00 MiB 超过 30 MiB"},
		{"abcdef", -1, 5, "超过"},
		{"abc", 5, 10, "已接收 3 字节，预期 5 字节"},
		{"", -1, 10, "内容为空"},
	} {
		_, err := copyGeneratedResult(io.Discard, strings.NewReader(tt.body), tt.expected, tt.limit)
		if err == nil || !strings.Contains(err.Error(), tt.want) {
			t.Fatal(tt, err)
		}
	}
	var out bytes.Buffer
	if n, err := copyGeneratedResult(&out, strings.NewReader("complete"), 8, 8); err != nil || n != 8 || out.String() != "complete" {
		t.Fatal(n, err, out.String())
	}
}
