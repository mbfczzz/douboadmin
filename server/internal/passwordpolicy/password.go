// Package passwordpolicy defines the shared rule for application login passwords.
package passwordpolicy

import (
	"crypto/rand"
	"errors"
	"math/big"
)

const Message = "密码必须为8位，仅限英文字母和数字，且同时包含大写和小写字母"

func Valid(value string) bool {
	if len(value) != 8 {
		return false
	}
	upper, lower := false, false
	for _, c := range value {
		switch {
		case c >= 'A' && c <= 'Z':
			upper = true
		case c >= 'a' && c <= 'z':
			lower = true
		case c >= '0' && c <= '9':
		default:
			return false
		}
	}
	return upper && lower
}
func Validate(value string) error {
	if !Valid(value) {
		return errors.New(Message)
	}
	return nil
}

func Generate() (string, error) {
	const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"
	const lower = "abcdefghijkmnpqrstuvwxyz"
	const alphabet = upper + lower + "23456789"
	b := make([]byte, 8)
	for i := range b {
		pool := alphabet
		if i == 0 {
			pool = upper
		}
		if i == 1 {
			pool = lower
		}
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(pool))))
		if err != nil {
			return "", err
		}
		b[i] = pool[n.Int64()]
	}
	for i := len(b) - 1; i > 0; i-- {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		if err != nil {
			return "", err
		}
		j := int(n.Int64())
		b[i], b[j] = b[j], b[i]
	}
	return string(b), nil
}
