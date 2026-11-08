package settings

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// The key lives on persistent storage, separately from encrypted database records.
func loadKey(path string, required bool) ([]byte, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		if required {
			return nil, fmt.Errorf("接入配置加密密钥文件丢失，请恢复原密钥文件")
		}
		if err = createKey(path); err != nil {
			return nil, err
		}
		raw, err = os.ReadFile(path)
	}
	if err != nil {
		return nil, fmt.Errorf("无法读取接入配置加密密钥文件")
	}
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		return nil, fmt.Errorf("接入配置加密密钥文件无效")
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0077 != 0 {
		return nil, fmt.Errorf("接入配置加密密钥文件权限须为0600")
	}
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(raw)))
	if err != nil || len(key) != 32 {
		return nil, fmt.Errorf("接入配置加密密钥文件无效，请恢复原文件")
	}
	return key, nil
}

func createKey(path string) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("无法创建接入配置密钥目录，请检查共享数据目录权限")
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return fmt.Errorf("无法生成接入配置加密密钥")
	}
	f, err := os.CreateTemp(dir, ".integration-key-*")
	if err != nil {
		return fmt.Errorf("无法写入接入配置密钥目录")
	}
	defer os.Remove(f.Name())
	defer f.Close()
	if err = f.Chmod(0600); err == nil {
		_, err = f.WriteString(base64.StdEncoding.EncodeToString(key) + "\n")
	}
	if err == nil {
		err = f.Sync()
	}
	if closeErr := f.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return fmt.Errorf("无法保存接入配置加密密钥")
	}
	// A complete file is linked atomically, so simultaneous API/Worker startup shares one key.
	if err = os.Link(f.Name(), path); err != nil && !errors.Is(err, os.ErrExist) {
		return fmt.Errorf("无法创建持久化加密密钥文件")
	}
	return nil
}
