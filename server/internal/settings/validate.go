package settings

import (
	"encoding/json"
	"net/url"
	"regexp"
	"strings"
)

type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"error"`
}

func (e *ValidationError) Error() string  { return e.Message }
func invalid(field, message string) error { return &ValidationError{field, message} }

var appIDPattern = regexp.MustCompile(`^wx[0-9a-fA-F]{16}$`)
var mappingField = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_]{0,39}$`)

func validURL(value string, query bool) bool {
	u, err := url.Parse(value)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Hostname() != "" &&
		u.User == nil && u.Fragment == "" && (query || u.RawQuery == "")
}

func validate(g Group, v Values, production bool) error {
	for _, f := range g.Fields {
		value := v[f.Key]
		limit := 4096
		if f.Kind == "products" || f.Kind == "mapping" || f.Kind == "origins" {
			limit = 65536
		}
		if len(value) > limit || strings.ContainsRune(value, '\x00') {
			return invalid(f.Key, f.Label+"内容过长或格式无效")
		}
		if f.Kind == "secret" && strings.ContainsAny(value, "\r\n") {
			return invalid(f.Key, f.Label+"不能包含换行")
		}
		if f.Kind == "bool" && value != "true" && value != "false" {
			return invalid(f.Key, "请选择"+f.Label)
		}
		if f.Kind == "select" {
			ok := false
			for _, choice := range f.Options {
				ok = ok || choice.Value == value
			}
			if !ok {
				return invalid(f.Key, "请选择有效的"+f.Label)
			}
		}
		if f.Kind == "url" && value != "" && !validURL(value, false) {
			return invalid(f.Key, f.Label+"须为不带账号密码、参数或片段的 HTTP/HTTPS 地址")
		}
		if f.Kind == "origins" {
			for _, origin := range strings.Split(value, ",") {
				if origin = strings.TrimSpace(origin); origin != "" {
					u, err := url.Parse(origin)
					if err != nil || !validURL(origin, false) || (u.Path != "" && u.Path != "/") {
						return invalid(f.Key, "后台来源须为协议、主机及可选端口，多个地址用英文逗号分隔")
					}
				}
			}
		}
	}
	if g.ID == "wechat" && v["WECHAT_APP_ID"] != "" && !appIDPattern.MatchString(v["WECHAT_APP_ID"]) {
		return invalid("WECHAT_APP_ID", "请填写有效的小程序 AppID")
	}
	if g.ID == "virtual" {
		cfg, err := v.Virtual()
		if err != nil {
			return err
		}
		if production && (cfg.SandboxAppKey != "" || (cfg.Enabled && cfg.Env != 0)) {
			return invalid("WECHAT_VIRTUAL_ENV", "生产环境仅支持现网，且须清空沙箱 AppKey")
		}
		if cfg.CustomProductID != "" {
			if _, ok := cfg.Product(cfg.CustomProductID); !ok {
				return invalid("WECHAT_VIRTUAL_CUSTOM_PRODUCT_ID", "请从当前积分套餐中重新选择基础商品")
			}
		}
		if err = cfg.Validate(); err != nil {
			return invalid("WECHAT_VIRTUAL_PRODUCTS", err.Error())
		}
	}
	if g.ID == "notifications" && v["WECHAT_COMPLETION_FIELDS"] != "" {
		var fields map[string]string
		if json.Unmarshal([]byte(v["WECHAT_COMPLETION_FIELDS"]), &fields) != nil || fields == nil || len(fields) > 30 {
			return invalid("WECHAT_COMPLETION_FIELDS", "请填写有效的模板字段映射，最多30项")
		}
		for key, value := range fields {
			if !mappingField.MatchString(key) || strings.TrimSpace(value) == "" || len(value) > 2000 {
				return invalid("WECHAT_COMPLETION_FIELDS", "模板字段名或内容无效")
			}
		}
	}
	if g.ID == "alerts" && v["ALERT_WEBHOOK_URL"] != "" && !validURL(v["ALERT_WEBHOOK_URL"], true) {
		return invalid("ALERT_WEBHOOK_URL", "告警地址须为有效的 HTTP/HTTPS URL")
	}
	if g.ID == "sms" {
		set := 0
		for _, f := range g.Fields {
			if strings.TrimSpace(v[f.Key]) != "" {
				set++
			}
		}
		if set != 0 && set != len(g.Fields) {
			return invalid("SMS_SIGN_NAME", "短信配置需完整填写 AccessKey、签名和模板 CODE")
		}
	}
	if g.ID == "relay" && v["RELAY_API_KEY"] != "" && v["RELAY_BASE_URL"] == "" {
		return invalid("RELAY_BASE_URL", "填写 API Key 时须同时填写 API 地址")
	}
	return nil
}
