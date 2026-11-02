package payments

import (
	"bytes"
	"context"
	"crypto"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
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

func notifyClient(t *testing.T) (*Client, *rsa.PrivateKey) {
	t.Helper()
	key, e := rsa.GenerateKey(rand.Reader, 2048)
	if e != nil {
		t.Fatal(e)
	}
	dir := t.TempDir()
	private := filepath.Join(dir, "merchant.pem")
	public := filepath.Join(dir, "wechat.pem")
	privateBytes, e := x509.MarshalPKCS8PrivateKey(key)
	if e != nil {
		t.Fatal(e)
	}
	if e = os.WriteFile(private, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privateBytes}), 0600); e != nil {
		t.Fatal(e)
	}
	pub, e := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if e != nil {
		t.Fatal(e)
	}
	if e = os.WriteFile(public, pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: pub}), 0600); e != nil {
		t.Fatal(e)
	}
	c, e := New(context.Background(), Config{AppID: "wx-fixture", MerchantID: "merchant", CertificateSerial: "0123456789ABCDEF", APIv3Key: "12345678901234567890123456789012", PrivateKeyPath: private, PublicKeyPath: public, PublicKeyID: "PUB_KEY_ID_fixture", NotifyURL: "https://example.test/pay", RefundNotifyURL: "https://example.test/refund"})
	if e != nil {
		t.Fatal(e)
	}
	return c, key
}
func signedNotification(t *testing.T, p *Client, key *rsa.PrivateKey, event string, payload any) *http.Request {
	t.Helper()
	plain, _ := json.Marshal(payload)
	block, e := aes.NewCipher([]byte(p.Config.APIv3Key))
	if e != nil {
		t.Fatal(e)
	}
	gcm, e := cipher.NewGCM(block)
	if e != nil {
		t.Fatal(e)
	}
	nonce := "123456789012"
	associated := "transaction"
	encrypted := gcm.Seal(nil, []byte(nonce), plain, []byte(associated))
	body, _ := json.Marshal(map[string]any{"id": "event-fixture", "event_type": event, "resource_type": "encrypt-resource", "resource": map[string]string{"algorithm": "AEAD_AES_256_GCM", "nonce": nonce, "associated_data": associated, "ciphertext": base64.StdEncoding.EncodeToString(encrypted)}})
	stamp := strconv.FormatInt(time.Now().Unix(), 10)
	headerNonce := "header-nonce"
	sum := sha256.Sum256([]byte(stamp + "\n" + headerNonce + "\n" + string(body) + "\n"))
	sign, e := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	if e != nil {
		t.Fatal(e)
	}
	r := httptest.NewRequest("POST", "https://example.test/notify", bytes.NewReader(body))
	r.Header.Set("Wechatpay-Timestamp", stamp)
	r.Header.Set("Wechatpay-Nonce", headerNonce)
	r.Header.Set("Wechatpay-Serial", p.Config.PublicKeyID)
	r.Header.Set("Wechatpay-Signature", base64.StdEncoding.EncodeToString(sign))
	return r
}
func TestSignedPaymentNotificationAndTamperRejection(t *testing.T) {
	p, key := notifyClient(t)
	payload := map[string]any{"appid": "wx-fixture", "mchid": "merchant", "out_trade_no": "order", "transaction_id": "transaction", "trade_state": "SUCCESS", "success_time": time.Now().Format(time.RFC3339), "payer": map[string]string{"openid": "payer"}, "amount": map[string]any{"total": 100, "currency": "CNY"}}
	result, e := p.PaymentNotification(signedNotification(t, p, key, "TRANSACTION.SUCCESS", payload))
	if e != nil || result.AmountFen != 100 || result.OpenID != "payer" {
		t.Fatal(result, e)
	}
	r := signedNotification(t, p, key, "TRANSACTION.SUCCESS", payload)
	r.Header.Set("Wechatpay-Nonce", "tampered")
	if _, e = p.PaymentNotification(r); e == nil {
		t.Fatal("tampered signature accepted")
	}
	r = signedNotification(t, p, key, "TRANSACTION.SUCCESS", payload)
	r.Header.Set("Wechatpay-Serial", "unknown-key")
	if _, e = p.PaymentNotification(r); e == nil {
		t.Fatal("untrusted key accepted")
	}
	payload["mchid"] = "other-merchant"
	if _, e = p.PaymentNotification(signedNotification(t, p, key, "TRANSACTION.SUCCESS", payload)); e == nil {
		t.Fatal("wrong merchant accepted")
	}
}
func TestSignedRefundNotification(t *testing.T) {
	p, key := notifyClient(t)
	payload := map[string]any{"mchid": "merchant", "out_trade_no": "order", "out_refund_no": "refund", "refund_id": "wx-refund", "refund_status": "SUCCESS", "success_time": time.Now().Format(time.RFC3339), "amount": map[string]int{"refund": 100}}
	result, e := p.RefundNotification(signedNotification(t, p, key, "REFUND.SUCCESS", payload))
	if e != nil || result.ID != "refund" || result.AmountFen != 100 {
		t.Fatal(result, e)
	}
	if _, e = p.RefundNotification(signedNotification(t, p, key, "REFUND.CLOSED", payload)); e == nil {
		t.Fatal("event/status mismatch accepted")
	}
}
func TestMissingPaymentConfigurationStaysDisabled(t *testing.T) {
	p, e := New(context.Background(), Config{AppID: "wx-app"})
	if e != nil || p.Ready() {
		t.Fatal("unconfigured gateway became ready", e)
	}
}
