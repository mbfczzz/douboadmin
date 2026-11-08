package settings

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
)

type envelope struct {
	Format int    `json:"format"`
	KeyID  string `json:"keyId"`
	Data   string `json:"ciphertext"`
}

func keyID(key []byte) string {
	hash := sha256.Sum256(key)
	return hex.EncodeToString(hash[:8])
}

func aead(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

func seal(id string, values Values, key []byte) ([]byte, error) {
	c, err := aead(key)
	if err != nil {
		return nil, err
	}
	plain, err := json.Marshal(values)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, c.NonceSize())
	if _, err = rand.Read(nonce); err != nil {
		return nil, err
	}
	encoded := c.Seal(nonce, nonce, plain, []byte("doubo-integrations/v1/"+id))
	return json.Marshal(envelope{1, keyID(key), base64.RawStdEncoding.EncodeToString(encoded)})
}

func open(id string, raw, key []byte) (Values, error) {
	var stored envelope
	if json.Unmarshal(raw, &stored) != nil || stored.Format != 1 || stored.KeyID != keyID(key) {
		return nil, fmt.Errorf("接入配置加密密钥不匹配，请恢复原密钥文件")
	}
	c, err := aead(key)
	if err != nil {
		return nil, err
	}
	data, err := base64.RawStdEncoding.DecodeString(stored.Data)
	if err != nil || len(data) < c.NonceSize() {
		return nil, fmt.Errorf("接入配置密文无效")
	}
	plain, err := c.Open(nil, data[:c.NonceSize()], data[c.NonceSize():], []byte("doubo-integrations/v1/"+id))
	if err != nil {
		return nil, fmt.Errorf("接入配置解密失败，请检查密钥与数据库备份是否匹配")
	}
	var values Values
	if json.Unmarshal(plain, &values) != nil || values == nil {
		return nil, fmt.Errorf("接入配置数据无效")
	}
	return values, nil
}
