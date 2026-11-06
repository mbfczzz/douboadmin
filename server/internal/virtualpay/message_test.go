package virtualpay

import (
	"doubo/server/internal/core"
	"encoding/json"
	"encoding/xml"
	"net/url"
	"strings"
	"testing"
)

func queryFor(raw []byte) url.Values {
	var e envelope
	_ = decodeMessage(raw, &e)
	return url.Values{"timestamp": {e.Timestamp}, "nonce": {e.Nonce}, "msg_signature": {e.Signature}}
}
func TestSecureMessageJSONAndXML(t *testing.T) {
	c, _ := New(testConfig())
	env := 1
	event := Event{MsgType: "event", Name: "xpay_goods_deliver_notify", OrderID: "fixture-order", OpenID: "openid", Env: &env}
	for _, asXML := range []bool{false, true} {
		body := core.Data(event)
		if asXML {
			body, _ = xml.Marshal(event)
		}
		raw, e := c.Reply(body, asXML)
		if e != nil {
			t.Fatal(e)
		}
		decoded, e := c.Decode(queryFor(raw), raw)
		if e != nil || decoded.OrderID != event.OrderID || decoded.Env == nil || *decoded.Env != 1 {
			t.Fatal(decoded, e)
		}
		bad := queryFor(raw)
		bad.Set("msg_signature", strings.Repeat("0", 40))
		if _, e = c.Decode(bad, raw); e == nil {
			t.Fatal("bad MAC accepted")
		}
		cfg := c.Config
		cfg.AppID = "other-app"
		other, _ := New(cfg)
		if _, e = other.Decode(queryFor(raw), raw); e == nil {
			t.Fatal("wrong app accepted")
		}
	}
}
func TestPlaintextAndMalformedMessagesAreRejected(t *testing.T) {
	c, _ := New(testConfig())
	raw := []byte(`{"MsgType":"event","Event":"xpay_refund_notify"}`)
	q := url.Values{"timestamp": {"1"}, "nonce": {"nonce"}}
	q.Set("signature", digest(c.Config.Token, "1", "nonce"))
	if _, e := c.Decode(q, raw); e == nil {
		t.Fatal("plaintext accepted in safe-only mode")
	}
	for _, raw := range []string{`null`, `[]`, `{}`, `{"Encrypt":"x"}`} {
		if _, e := c.Decode(q, []byte(raw)); e == nil {
			t.Fatal(raw)
		}
	}
}
func TestURLHandshakeAndEncryptedEcho(t *testing.T) {
	c, _ := New(testConfig())
	q := url.Values{"timestamp": {"1"}, "nonce": {"n"}, "echostr": {"echo"}}
	q.Set("signature", digest(c.Config.Token, "1", "n"))
	echo, e := c.VerifyURL(q)
	if e != nil || echo != "echo" {
		t.Fatal(echo, e)
	}
	raw, _ := c.Reply([]byte("encrypted-echo"), false)
	var env envelope
	_ = json.Unmarshal(raw, &env)
	q = queryFor(raw)
	q.Set("echostr", env.Encrypt)
	echo, e = c.VerifyURL(q)
	if e != nil || echo != "encrypted-echo" {
		t.Fatal(echo, e)
	}
}
