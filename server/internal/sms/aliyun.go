// Package sms sends verification codes through Alibaba Cloud SMS (dysmsapi).
package sms

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var (
	ErrRateLimited  = errors.New("短信发送过于频繁，请稍后再试")
	ErrInvalidPhone = errors.New("手机号无效，请检查后重试")
)

// Aliyun calls SendSms with the RPC signature (HMAC-SHA1, version 1.0).
type Aliyun struct {
	KeyID, Secret, SignName, Template string
	Endpoint                          string // defaults to https://dysmsapi.aliyuncs.com/
	HTTP                              *http.Client
}

func (c *Aliyun) Ready() bool {
	return c != nil && c.KeyID != "" && c.Secret != "" && c.SignName != "" && c.Template != ""
}

// Send delivers the code into the template's ${code} variable.
func (c *Aliyun) Send(ctx context.Context, phone, code string) error {
	param, _ := json.Marshal(map[string]string{"code": code})
	nonce := make([]byte, 16)
	_, _ = rand.Read(nonce)
	q := url.Values{
		"AccessKeyId": {c.KeyID}, "Action": {"SendSms"}, "Format": {"JSON"}, "Version": {"2017-05-25"},
		"RegionId": {"cn-hangzhou"}, "PhoneNumbers": {phone}, "SignName": {c.SignName},
		"TemplateCode": {c.Template}, "TemplateParam": {string(param)},
		"SignatureMethod": {"HMAC-SHA1"}, "SignatureVersion": {"1.0"}, "SignatureNonce": {hex.EncodeToString(nonce)},
		"Timestamp": {time.Now().UTC().Format("2006-01-02T15:04:05Z")},
	}
	q.Set("Signature", Sign(http.MethodPost, c.Secret, q))
	endpoint := c.Endpoint
	if endpoint == "" {
		endpoint = "https://dysmsapi.aliyuncs.com/"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(q.Encode()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := c.HTTP
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	res, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("短信服务连接失败")
	}
	defer res.Body.Close()
	var out struct{ Code, Message string }
	if err = json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&out); err != nil {
		return fmt.Errorf("短信服务返回异常（HTTP %d）", res.StatusCode)
	}
	switch {
	case out.Code == "OK":
		return nil
	case strings.Contains(out.Code, "LIMIT_CONTROL") || strings.Contains(out.Code, "DAY_LIMIT"):
		return ErrRateLimited
	case out.Code == "isv.MOBILE_NUMBER_ILLEGAL":
		return ErrInvalidPhone
	}
	return fmt.Errorf("短信发送失败：%s %s", out.Code, out.Message)
}

func encode(s string) string {
	s = url.QueryEscape(s)
	return strings.NewReplacer("+", "%20", "*", "%2A", "%7E", "~").Replace(s)
}

// Sign implements the Alibaba Cloud RPC signature over the sorted parameters.
func Sign(method, secret string, q url.Values) string {
	canonical := strings.NewReplacer("+", "%20", "*", "%2A", "%7E", "~").Replace(q.Encode())
	mac := hmac.New(sha1.New, []byte(secret+"&"))
	mac.Write([]byte(method + "&" + encode("/") + "&" + encode(canonical)))
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}
