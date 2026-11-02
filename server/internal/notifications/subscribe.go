package notifications

import (
	"bytes"
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"doubo/server/internal/wechat"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type Sender struct {
	mu         sync.Mutex
	after      string
	Store      store.Store
	WeChat     *wechat.Client
	TemplateID string
	Fields     map[string]string
}

func (s *Sender) Ready() bool {
	return s != nil && s.TemplateID != "" && len(s.Fields) > 0 && s.WeChat != nil && s.WeChat.AppID != "" && s.WeChat.Secret != ""
}
func (s *Sender) token(ctx context.Context) (string, error) {
	id := core.Digest(s.WeChat.AppID)[:32]
	old, _ := s.Store.Get(ctx, "wechat_tokens", id)
	var cached struct {
		Token   string    `json:"token"`
		Expires time.Time `json:"expires"`
	}
	_ = json.Unmarshal(old.Data, &cached)
	if cached.Token != "" && cached.Expires.After(time.Now().Add(time.Minute)) {
		return cached.Token, nil
	}
	body := core.Data(map[string]any{"grant_type": "client_credential", "appid": s.WeChat.AppID, "secret": s.WeChat.Secret, "force_refresh": false})
	req, e := http.NewRequestWithContext(ctx, "POST", "https://api.weixin.qq.com/cgi-bin/stable_token", bytes.NewReader(body))
	if e != nil {
		return "", e
	}
	req.Header.Set("Content-Type", "application/json")
	res, e := s.WeChat.HTTP.Do(req)
	if e != nil {
		return "", fmt.Errorf("获取微信通知凭证失败")
	}
	defer res.Body.Close()
	var response struct {
		Token   string `json:"access_token"`
		Expires int    `json:"expires_in"`
		Error   int    `json:"errcode"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, 65536)).Decode(&response) != nil || response.Error != 0 || response.Token == "" {
		return "", fmt.Errorf("微信通知凭证不可用")
	}
	cached.Token = response.Token
	cached.Expires = time.Now().UTC().Add(time.Duration(response.Expires) * time.Second)
	_, _ = s.Store.Put(ctx, "wechat_tokens", core.Record{ID: id, Data: core.Data(cached)}, old.Version)
	return cached.Token, nil
}
func (s *Sender) send(ctx context.Context, token, openid string, n core.Notification) error {
	data := map[string]any{}
	values := strings.NewReplacer("{{title}}", n.Title, "{{jobId}}", n.TargetID, "{{state}}", "已完成", "{{time}}", time.Now().Format("2006-01-02 15:04:05"))
	for k, v := range s.Fields {
		data[k] = map[string]string{"value": values.Replace(v)}
	}
	body := core.Data(map[string]any{"touser": openid, "template_id": s.TemplateID, "page": "pages/task-detail/index?id=" + n.TargetID, "data": data})
	req, e := http.NewRequestWithContext(ctx, "POST", "https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token="+url.QueryEscape(token), bytes.NewReader(body))
	if e != nil {
		return e
	}
	req.Header.Set("Content-Type", "application/json")
	res, e := s.WeChat.HTTP.Do(req)
	if e != nil {
		return fmt.Errorf("微信通知发送结果未知")
	}
	defer res.Body.Close()
	var response struct {
		Code *int `json:"errcode"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, 65536)).Decode(&response) != nil || response.Code == nil || res.StatusCode != http.StatusOK {
		return fmt.Errorf("微信通知响应无效")
	}
	if *response.Code != 0 {
		return fmt.Errorf("微信通知未送达，错误码 %d", *response.Code)
	}
	return nil
}
