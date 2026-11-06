package virtualpay

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

var ErrMessage = errors.New("虚拟支付消息验证失败")

type envelope struct {
	XMLName   xml.Name `json:"-" xml:"xml"`
	Encrypt   string   `json:"Encrypt" xml:"Encrypt"`
	Signature string   `json:"MsgSignature,omitempty" xml:"MsgSignature,omitempty"`
	Timestamp string   `json:"TimeStamp,omitempty" xml:"TimeStamp,omitempty"`
	Nonce     string   `json:"Nonce,omitempty" xml:"Nonce,omitempty"`
}
type Event struct {
	Fingerprint string   `json:"-" xml:"-"`
	Payload     string   `json:"-" xml:"-"`
	XMLName     xml.Name `json:"-" xml:"xml"`
	MsgType     string   `json:"MsgType" xml:"MsgType"`
	Name        string   `json:"Event" xml:"Event"`
	OpenID      string   `json:"OpenId" xml:"OpenId"`
	OrderID     string   `json:"OutTradeNo" xml:"OutTradeNo"`
	Env         *int     `json:"Env" xml:"Env"`
	Goods       *struct {
		ProductID   string `json:"ProductId" xml:"ProductId"`
		Quantity    int64  `json:"Quantity" xml:"Quantity"`
		OrigPrice   int64  `json:"OrigPrice" xml:"OrigPrice"`
		ActualPrice int64  `json:"ActualPrice" xml:"ActualPrice"`
		Attach      string `json:"Attach" xml:"Attach"`
	} `json:"GoodsInfo" xml:"GoodsInfo"`
	RefundOrderID string `json:"MchOrderId" xml:"MchOrderId"`
	RefundID      string `json:"MchRefundId" xml:"MchRefundId"`
	RefundWXID    string `json:"WxRefundId" xml:"WxRefundId"`
	PayWXID       string `json:"WxOrderId" xml:"WxOrderId"`
	RefundFee     int64  `json:"RefundFee" xml:"RefundFee"`
	RetCode       *int   `json:"RetCode" xml:"RetCode"`
	RefundTime    int64  `json:"RefundSuccTimestamp" xml:"RefundSuccTimestamp"`
	IOSOrderID    string `json:"pay_order_id" xml:"pay_order_id"`
}

func digest(parts ...string) string {
	sort.Strings(parts)
	v := sha1.Sum([]byte(strings.Join(parts, "")))
	return hex.EncodeToString(v[:])
}
func signatureOK(token string, q url.Values, encrypted string) bool {
	timestamp, nonce := q.Get("timestamp"), q.Get("nonce")
	if token == "" || nonce == "" || len(nonce) > 256 {
		return false
	}
	if _, e := strconv.ParseInt(timestamp, 10, 64); e != nil {
		return false
	}
	signature := q.Get("signature")
	parts := []string{token, timestamp, nonce}
	if encrypted != "" {
		signature = q.Get("msg_signature")
		parts = append(parts, encrypted)
	}
	return subtle.ConstantTimeCompare([]byte(signature), []byte(digest(parts...))) == 1
}
func (c *Client) decrypt(encoded string) ([]byte, error) {
	key, e := base64.StdEncoding.DecodeString(c.Config.EncodingAESKey + "=")
	if e != nil || len(key) != 32 {
		return nil, ErrMessage
	}
	raw, e := base64.StdEncoding.DecodeString(encoded)
	if e != nil || len(raw) == 0 || len(raw)%aes.BlockSize != 0 {
		return nil, ErrMessage
	}
	block, e := aes.NewCipher(key)
	if e != nil {
		return nil, ErrMessage
	}
	cipher.NewCBCDecrypter(block, key[:16]).CryptBlocks(raw, raw)
	pad := int(raw[len(raw)-1])
	if pad < 1 || pad > 32 || pad > len(raw) {
		return nil, ErrMessage
	}
	if !bytes.Equal(raw[len(raw)-pad:], bytes.Repeat([]byte{byte(pad)}, pad)) {
		return nil, ErrMessage
	}
	raw = raw[:len(raw)-pad]
	if len(raw) < 20 {
		return nil, ErrMessage
	}
	n := int(binary.BigEndian.Uint32(raw[16:20]))
	if n < 1 || n > len(raw)-20 || string(raw[20+n:]) != c.Config.AppID {
		return nil, ErrMessage
	}
	return raw[20 : 20+n], nil
}
func (c *Client) VerifyURL(q url.Values) (string, error) {
	if !c.Ready() || len(q.Get("echostr")) > 16384 {
		return "", ErrMessage
	}
	if q.Get("msg_signature") != "" {
		if !signatureOK(c.Config.Token, q, q.Get("echostr")) {
			return "", ErrMessage
		}
		plain, e := c.decrypt(q.Get("echostr"))
		return string(plain), e
	}
	if !signatureOK(c.Config.Token, q, "") {
		return "", ErrMessage
	}
	return q.Get("echostr"), nil
}
func decodeMessage(raw []byte, out any) error {
	if len(bytes.TrimSpace(raw)) == 0 {
		return ErrMessage
	}
	if bytes.TrimSpace(raw)[0] == '<' {
		return xml.Unmarshal(raw, out)
	}
	return json.Unmarshal(raw, out)
}
func (c *Client) Decode(q url.Values, raw []byte) (Event, error) {
	var env envelope
	var event Event
	if !c.Ready() || decodeMessage(raw, &env) != nil || env.Encrypt == "" || !signatureOK(c.Config.Token, q, env.Encrypt) {
		return event, ErrMessage
	}
	plain, e := c.decrypt(env.Encrypt)
	if e != nil || decodeMessage(plain, &event) != nil || event.MsgType != "event" || event.Name == "" {
		return event, ErrMessage
	}
	checksum := sha256.Sum256(plain)
	event.Fingerprint = hex.EncodeToString(checksum[:])
	event.Payload = string(plain)
	return event, nil
}

// Reply encrypts responses with business data (e.g. Apple refund evidence).
func (c *Client) Reply(body []byte, asXML bool) ([]byte, error) {
	key, e := base64.StdEncoding.DecodeString(c.Config.EncodingAESKey + "=")
	if e != nil || len(key) != 32 {
		return nil, ErrMessage
	}
	raw := make([]byte, 20)
	if _, e = rand.Read(raw[:16]); e != nil {
		return nil, e
	}
	binary.BigEndian.PutUint32(raw[16:], uint32(len(body)))
	raw = append(raw, body...)
	raw = append(raw, []byte(c.Config.AppID)...)
	pad := 32 - len(raw)%32
	raw = append(raw, bytes.Repeat([]byte{byte(pad)}, pad)...)
	block, e := aes.NewCipher(key)
	if e != nil {
		return nil, e
	}
	cipher.NewCBCEncrypter(block, key[:16]).CryptBlocks(raw, raw)
	nonce := make([]byte, 8)
	if _, e = rand.Read(nonce); e != nil {
		return nil, e
	}
	v := envelope{Encrypt: base64.StdEncoding.EncodeToString(raw), Timestamp: strconv.FormatInt(time.Now().Unix(), 10), Nonce: hex.EncodeToString(nonce)}
	v.Signature = digest(c.Config.Token, v.Timestamp, v.Nonce, v.Encrypt)
	if asXML {
		return xml.Marshal(v)
	}
	return json.Marshal(v)
}
