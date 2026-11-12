package settings

import "strings"

var smsCredentials = []string{
	"SMS_ACCESS_KEY_ID", "SMS_ACCESS_KEY_SECRET", "SMS_SIGN_NAME", "SMS_TEMPLATE_CODE",
}

// Old groups have no switch: retain verification when all credentials exist.
// Once explicitly saved, false stays false even with valid credentials.
func normalizeSMS(v Values) {
	if v["SMS_VERIFICATION_ENABLED"] != "" {
		return
	}
	v["SMS_VERIFICATION_ENABLED"] = "true"
	for _, key := range smsCredentials {
		if strings.TrimSpace(v[key]) == "" {
			v["SMS_VERIFICATION_ENABLED"] = "false"
			return
		}
	}
}

func validateSMS(v Values) error {
	if v["SMS_VERIFICATION_ENABLED"] != "true" {
		return nil
	}
	for _, key := range smsCredentials {
		if strings.TrimSpace(v[key]) == "" {
			return invalid("SMS_VERIFICATION_ENABLED", "开启短信验证前需完整填写 AccessKey、短信签名和验证码模板 CODE")
		}
	}
	return nil
}
