package api

import (
	"bytes"
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"doubo/server/internal/payments"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func paymentGateway(t *testing.T, a *Server) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	private, public := filepath.Join(dir, "merchant.pem"), filepath.Join(dir, "wechat.pem")
	privateBytes, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	publicBytes, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		t.Fatal(err)
	}
	for file, block := range map[string]*pem.Block{
		private: {Type: "PRIVATE KEY", Bytes: privateBytes},
		public:  {Type: "PUBLIC KEY", Bytes: publicBytes},
	} {
		if err = os.WriteFile(file, pem.EncodeToMemory(block), 0600); err != nil {
			t.Fatal(err)
		}
	}
	a.Pay, err = payments.New(t.Context(), payments.Config{
		AppID: "wx-test", MerchantID: "test-merchant", CertificateSerial: "TEST_SERIAL",
		APIv3Key: "12345678901234567890123456789012", PublicKeyID: "PUB_KEY_ID_test",
		PrivateKeyPath: private, PublicKeyPath: public,
		NotifyURL:       "https://example.test/api/payments/wechat/notify",
		RefundNotifyURL: "https://example.test/api/payments/wechat/refund-notify",
	})
	if err != nil {
		t.Fatal(err)
	}
	return key
}

func signedPayment(t *testing.T, a *Server, key *rsa.PrivateKey, id string, amount int64) *http.Request {
	t.Helper()
	plain, err := json.Marshal(map[string]any{
		"appid": "wx-test", "mchid": "test-merchant", "out_trade_no": id,
		"transaction_id": "payment-" + id, "trade_state": "SUCCESS",
		"success_time": time.Now().UTC().Format(time.RFC3339),
		"payer":        map[string]string{"openid": "test-openid"},
		"amount":       map[string]any{"total": amount, "currency": "CNY"},
	})
	if err != nil {
		t.Fatal(err)
	}
	block, err := aes.NewCipher([]byte(a.Pay.Config.APIv3Key))
	if err != nil {
		t.Fatal(err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatal(err)
	}
	nonce, associated := "123456789012", "transaction"
	body, err := json.Marshal(map[string]any{
		"id": "notification-test", "event_type": "TRANSACTION.SUCCESS", "resource_type": "encrypt-resource",
		"resource": map[string]string{"algorithm": "AEAD_AES_256_GCM", "nonce": nonce,
			"associated_data": associated,
			"ciphertext":      base64.StdEncoding.EncodeToString(gcm.Seal(nil, []byte(nonce), plain, []byte(associated)))},
	})
	if err != nil {
		t.Fatal(err)
	}
	stamp := strconv.FormatInt(time.Now().Unix(), 10)
	headerNonce := "payment-test-nonce"
	digest := sha256.Sum256([]byte(stamp + "\n" + headerNonce + "\n" + string(body) + "\n"))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodPost, "/api/payments/wechat/notify", bytes.NewReader(body))
	r.Header.Set("Wechatpay-Timestamp", stamp)
	r.Header.Set("Wechatpay-Nonce", headerNonce)
	r.Header.Set("Wechatpay-Serial", a.Pay.Config.PublicKeyID)
	r.Header.Set("Wechatpay-Signature", base64.StdEncoding.EncodeToString(signature))
	return r
}
