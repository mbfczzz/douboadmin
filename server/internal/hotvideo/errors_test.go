package hotvideo

import "testing"

func TestUpstreamError(t *testing.T) {
	cases := map[string]struct {
		status int
		body   string
	}{
		"TikHub 账户余额不足，请充值":                 {402, `{"detail":{"code":402,"message":"Insufficient balance","message_zh":"余额不足"}}`},
		"TikHub API Key 无效，请在后台检查":          {401, `{"detail":"bad"}`},
		"抖音数据服务出错（500）：服务器内部错误":             {500, `{"code":500,"message_zh":"服务器内部错误"}`},
		"TikHub API Key 没有该接口的权限：Forbidden": {403, `{"message":"Forbidden"}`},
	}
	for want, c := range cases {
		if got := upstreamError(c.status, []byte(c.body)).Error(); got != want {
			t.Fatalf("%d: got %q want %q", c.status, got, want)
		}
	}
}
