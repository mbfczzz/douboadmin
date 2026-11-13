package store

// c declares a column for a JSON field.
func c(field string, k kind) Col { return Col{Field: field, Kind: k} }

// Mini-program users: profile, identity, SMS and per-user records.
func init() {
	register(
		Table{Name: "identity_control", Comment: "Serializes identity and phone updates"},
		Table{Name: "user_identities", Comment: "登录凭证到统一用户的映射", Owner: "User", Cols: []Col{c("userId", Key), c("provider", Key), c("subject", Key), c("appid", Key), c("phone", Key)}},
		Table{Name: "admin_user_links", Comment: "用户与后台授权账号关联", Owner: "User", Cols: []Col{c("accountId", Key)}},
		Table{Name: "phone_login_codes", Comment: "手机号登录验证码摘要", Cols: []Col{c("phone", Key), c("source", Key), c("challenge", Key), c("digest", Key), c("expiresAt", Time), c("attempts", Int)}},
		Table{Name: "users", Comment: "统一用户资料；id = 用户 id", Owner: "用户本人", Cols: []Col{
			c("nickname", Short), c("name", Short), c("phone", Key), c("verifiedPhone", Key),
			c("phoneVerifiedAt", Time), c("bio", Short), c("avatarId", Key), c("authProvider", Key),
			c("disabled", Bool), c("archived", Bool), c("statusReason", Text),
			c("source", Key), c("sources", JSON), c("lastLoginSource", Key), c("preprovisioned", Bool),
		}, Indexes: []string{"phone"}},
		Table{Name: "preferences", Comment: "用户偏好设置；id = 用户 id", Owner: "用户", Cols: []Col{
			c("inAppNotifications", Bool), c("completionSubscription", Bool), c("autoplay", Bool), c("analytics", Bool),
		}},
		Table{Name: "wechat_identities", Comment: "微信身份；id = 用户 id", Owner: "用户", Cols: []Col{
			c("openid", Key), c("appid", Key),
		}},
		Table{Name: "phone_owners", Comment: "手机号归属，保证一个号码只属于一个用户；id = 手机号", Cols: []Col{
			c("user", Key),
		}},
		Table{Name: "sms_codes", Comment: "短信验证码（摘要）与每日发送计数；id = 用户 id", Owner: "用户", Cols: []Col{
			c("phone", Key), c("digest", Key), c("expiresAt", Time), c("attempts", Int), c("day", Key), c("sent", Int),
		}},
		Table{Name: "sms_phones", Comment: "手机号每日短信发送计数；id = 手机号", Cols: []Col{
			c("day", Key), c("sent", Int),
		}},
		Table{Name: "user_audit", Comment: "后台对用户的操作记录", Owner: "被操作的用户", Cols: []Col{
			c("actor", Key), c("kind", Key), c("disabled", Bool), c("reason", Text),
		}},
		Table{Name: "feedback", Comment: "用户反馈", Owner: "提交的用户", Cols: []Col{
			c("content", Text),
		}},
		Table{Name: "favorites", Comment: "模板收藏；id = 摘要(用户:模板)", Owner: "用户", Cols: []Col{
			c("templateId", Key), c("active", Bool),
		}},
		Table{Name: "search_history", Comment: "热门视频搜索历史（清空时字段置空）", Owner: "用户", Cols: []Col{
			c("keyword", Short), c("searchedAt", Time),
		}},
		Table{Name: "notifications", Comment: "站内通知；id = 摘要(用户:事件)", Owner: "用户", Cols: notice},
		Table{Name: "subscription_queue", Comment: "待发送的微信订阅消息；id 同站内通知", Owner: "用户", Cols: notice},
		Table{Name: "subscription_delivery", Comment: "订阅消息发送结果；id = subscription_queue.id", Owner: "用户", Cols: []Col{
			c("status", Key), c("message", Text),
		}},
		Table{Name: "daily_activity", Comment: "每日活跃用户，每人每天一行；created_at 为当天首次活跃时间", Owner: "用户", Cols: []Col{
			c("day", Key),
		}, Indexes: []string{"day"}},
		Table{Name: "analytics", Comment: "用户行为事件（仅同意统计的用户）", Owner: "用户", Cols: []Col{
			c("name", Key), c("page", Short), c("targetId", Key),
		}},
	)
}

var notice = []Col{c("kind", Key), c("title", Short), c("content", Text), c("targetId", Key), c("read", Bool)}
