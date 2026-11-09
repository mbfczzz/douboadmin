package sms

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

// The example from Alibaba Cloud's RPC signature documentation.
func TestSignMatchesDocumentedExample(t *testing.T) {
	q := url.Values{
		"AccessKeyId": {"testid"}, "Action": {"DescribeRegions"}, "Format": {"XML"},
		"SignatureMethod": {"HMAC-SHA1"}, "SignatureNonce": {"3ee8c1b8-83d3-44af-a94f-4e0ad82fd6cf"},
		"SignatureVersion": {"1.0"}, "Timestamp": {"2016-02-23T12:46:24Z"}, "Version": {"2014-05-26"},
	}
	if got := Sign("GET", "testsecret", q); got != "OLeaidS1JvxuMvnyHOwuJ+uX5qY=" {
		t.Fatal(got)
	}
}

func TestSendPostsSignedTemplateRequest(t *testing.T) {
	var form url.Values
	reply := `{"Code":"OK","Message":"OK"}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		form = r.PostForm
		_, _ = w.Write([]byte(reply))
	}))
	defer srv.Close()
	c := &Aliyun{KeyID: "id", Secret: "secret", SignName: "豆播AI", Template: "SMS_1", Endpoint: srv.URL}
	if err := c.Send(context.Background(), "13800138000", "123456"); err != nil {
		t.Fatal(err)
	}
	sig := form.Get("Signature")
	form.Del("Signature")
	if form.Get("PhoneNumbers") != "13800138000" || form.Get("TemplateParam") != `{"code":"123456"}` || form.Get("SignName") != "豆播AI" || sig != Sign("POST", "secret", form) {
		t.Fatal(form, sig)
	}
	reply = `{"Code":"isv.BUSINESS_LIMIT_CONTROL","Message":"触发分钟级流控"}`
	if err := c.Send(context.Background(), "13800138000", "1"); !errors.Is(err, ErrRateLimited) {
		t.Fatal(err)
	}
	reply = `{"Code":"isv.SMS_SIGNATURE_ILLEGAL","Message":"签名不合法"}`
	if err := c.Send(context.Background(), "13800138000", "1"); err == nil || err.Error() != "短信发送失败：isv.SMS_SIGNATURE_ILLEGAL 签名不合法" {
		t.Fatal(err)
	}
}
