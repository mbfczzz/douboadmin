// Package settings stores operator-managed integration credentials separately from public business rules.
package settings

type Field struct {
	Key     string   `json:"key"`
	Label   string   `json:"label"`
	Kind    string   `json:"kind"`
	Hint    string   `json:"hint,omitempty"`
	Default string   `json:"-"`
	Options []Option `json:"options,omitempty"`
	Columns []Column `json:"columns,omitempty"`
	Limit   int      `json:"limit,omitempty"`
}

type Column struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	Max     int    `json:"max"`
	Pattern string `json:"pattern,omitempty"`
	Scale   int    `json:"scale,omitempty"`
}
type Option struct {
	Value string `json:"value"`
	Label string `json:"label"`
}
type Group struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Hint   string  `json:"hint"`
	Fields []Field `json:"fields"`
}

var definitions = []Group{
	{ID: "wechat", Name: "微信登录", Hint: "AppID 必须与小程序项目一致。更换小程序时需同时填写对应的 AppSecret，并重新编译小程序。", Fields: []Field{
		{Key: "WECHAT_APP_ID", Label: "小程序 AppID", Kind: "text"},
		{Key: "WECHAT_APP_SECRET", Label: "小程序密钥 AppSecret", Kind: "secret"},
	}},
	{ID: "relay", Name: "AI 中转站", Hint: "填写当前模型服务的地址和密钥。更换供应商前应先完成在途生成任务。", Fields: []Field{
		{Key: "RELAY_BASE_URL", Label: "API 基础地址", Kind: "url", Default: "https://relay.tcmzhan.com", Hint: "例如 https://relay.tcmzhan.com，不追加 /v1/models。"},
		{Key: "RELAY_API_KEY", Label: "API Key", Kind: "secret"},
	}},
	{ID: "sms", Name: "短信验证码", Hint: "小程序用户注册时验证手机号，使用阿里云短信服务。模板须包含 ${code} 变量；RAM 账号需授予短信发送权限。保存后重启服务生效。", Fields: []Field{
		{Key: "SMS_VERIFICATION_ENABLED", Label: "开启短信验证", Kind: "bool", Hint: "关闭后仅填写姓名和手机号，不发送或校验验证码；开启后必须完成短信验证。保存后重启服务生效。"},
		{Key: "SMS_ACCESS_KEY_ID", Label: "AccessKey ID", Kind: "secret"},
		{Key: "SMS_ACCESS_KEY_SECRET", Label: "AccessKey Secret", Kind: "secret"},
		{Key: "SMS_SIGN_NAME", Label: "短信签名", Kind: "text", Hint: "与阿里云短信控制台审核通过的签名一致。"},
		{Key: "SMS_TEMPLATE_CODE", Label: "验证码模板 CODE", Kind: "text", Hint: "例如 SMS_123456789。"},
	}},
	{ID: "oss", Name: "阿里云 OSS", Hint: "API 和 Worker 需使用同一个存储配置。更换地域或存储桶前，需要迁移已有媒体文件。", Fields: []Field{
		{Key: "OSS_REGION", Label: "地域 Region", Kind: "text", Hint: "填写 cn-shanghai 这样的地域 ID，不填写 oss-cn-shanghai.aliyuncs.com 或 HTTPS 地址。"},
		{Key: "OSS_BUCKET", Label: "存储桶 Bucket", Kind: "text"},
		{Key: "OSS_ACCESS_KEY_ID", Label: "AccessKey ID", Kind: "secret"},
		{Key: "OSS_ACCESS_KEY_SECRET", Label: "AccessKey Secret", Kind: "secret"},
	}},
	{ID: "virtual", Name: "微信虚拟支付", Hint: "管理支付接入及积分商品；暂停新充值可关闭虚拟支付通道，保存后重启服务。商品 ID 和单价须与微信后台已发布商品一致。", Fields: []Field{
		{Key: "PAYMENT_CHANNEL", Label: "支付通道", Kind: "select", Default: "wechat_jsapi", Options: []Option{{"wechat_virtual", "微信虚拟支付"}, {"wechat_jsapi", "普通微信支付（凭证由服务器配置）"}}},
		{Key: "WECHAT_VIRTUAL_ENABLED", Label: "加载虚拟支付通道", Kind: "bool", Default: "false"},
		{Key: "WECHAT_VIRTUAL_ENV", Label: "微信支付环境", Kind: "select", Default: "1", Options: []Option{{"0", "现网（真实付款）"}, {"1", "沙箱"}}},
		{Key: "WECHAT_VIRTUAL_OFFER_ID", Label: "支付应用 OfferID", Kind: "text"},
		{Key: "WECHAT_VIRTUAL_APP_KEY", Label: "现网 AppKey", Kind: "secret"},
		{Key: "WECHAT_VIRTUAL_SANDBOX_APP_KEY", Label: "沙箱 AppKey", Kind: "secret", Hint: "生产环境必须清空。"},
		{Key: "WECHAT_VIRTUAL_TOKEN", Label: "消息推送 Token", Kind: "secret"},
		{Key: "WECHAT_VIRTUAL_ENCODING_AES_KEY", Label: "消息加密 EncodingAESKey", Kind: "secret", Hint: "43位，与微信后台消息推送配置一致，使用安全模式。"},
		{Key: "WECHAT_VIRTUAL_PRODUCTS", Label: "积分套餐", Kind: "products", Default: "[]", Limit: 100, Columns: []Column{
			{Key: "id", Label: "商品 ID", Max: 128},
			{Key: "name", Label: "套餐名称", Max: 80},
			{Key: "amountFen", Label: "售价（元）", Max: 12, Pattern: `[0-9]+(\.[0-9]{1,2})?`, Scale: 100},
			{Key: "pointsUnits", Label: "到账积分", Max: 18, Pattern: `[0-9]+(\.[0-9]{1,2})?`, Scale: 100},
		}},
		{Key: "WECHAT_VIRTUAL_CUSTOM_PRODUCT_ID", Label: "自定义金额基础商品", Kind: "product", Hint: "留空只开放套餐购买；选择后按商品单价换算购买份数。"},
		{Key: "WECHAT_VIRTUAL_IOS_ALLOWED", Label: "允许 iPhone 充值", Kind: "bool", Default: "false", Hint: "微信后台开通 IAP 并验收后启用。"},
	}},
	{ID: "hot", Name: "热门视频接口", Hint: "未填写 API Key 时，热门视频查询功能不可用。", Fields: []Field{
		{Key: "TIKHUB_BASE_URL", Label: "TikHub API 地址", Kind: "url", Default: "https://api.tikhub.io"},
		{Key: "TIKHUB_API_KEY", Label: "TikHub API Key", Kind: "secret"},
		{Key: "HOT_FEED_SOURCE", Label: "创作页视频来源", Kind: "select", Default: "billboard", Options: []Option{{"billboard", "抖音视频热榜（按标签筛选，「热门」为整个榜单）"}, {"search", "关键词搜索"}}, Hint: "保存后重启服务生效。"},
		{Key: "HOT_FEED_KEYWORDS", Label: "创作页关键词", Kind: "text", Default: DefaultFeedKeywords, Hint: "创作页视频流的标签，按顺序显示，第一个默认选中；视频来源为热榜时按标签筛选近 7 天视频热榜（「热门」为整个榜单）；为关键词搜索时按标签搜索抖音视频。用逗号或顿号分隔，最多 12 个、每个不超过 20 字。保存后重启服务生效。"},
		{Key: "HOT_CACHE_FEED_MINUTES", Label: "创作页视频流缓存（分钟）", Kind: "text", Default: "60", Hint: "所有人共用的创作页视频，到期前 1 分钟后台自动刷新。5–1440，保存后重启服务生效。"},
		{Key: "HOT_CACHE_SEARCH_MINUTES", Label: "搜索结果缓存（分钟）", Kind: "text", Default: "5", Hint: "同一关键词、排序和页码在这段时间内不再请求 TikHub。1–1440，保存后重启服务生效。"},
		{Key: "HOT_CACHE_WORDS_MINUTES", Label: "热门搜索词缓存（分钟）", Kind: "text", Default: "10", Hint: "热门视频页的抖音热词。1–1440，保存后重启服务生效。"},
		{Key: "HOT_CACHE_VIDEO_MINUTES", Label: "视频详情与链接解析缓存（分钟）", Kind: "text", Default: "30", Hint: "视频详情页和粘贴链接读取的视频；播放地址会过期，建议不超过 120。导入素材和一键复刻取原视频时总是实时读取。1–720，保存后重启服务生效。"},
	}},
	{ID: "vision", Name: "视频理解", Hint: "一键复刻用它看懂原视频（钩子、分镜、卖点）。默认火山方舟豆包视觉模型，也可填写兼容 OpenAI 接口并支持视频输入的服务。未填写 API Key 时复刻只参考视频文案。保存后重启服务生效。", Fields: []Field{
		{Key: "VISION_BASE_URL", Label: "API 基础地址", Kind: "url", Default: "https://ark.cn-beijing.volces.com/api/v3"},
		{Key: "VISION_API_KEY", Label: "API Key", Kind: "secret"},
		{Key: "VISION_MODEL", Label: "模型 ID", Kind: "text", Default: "doubao-seed-1-6-vision-250815", Hint: "须支持视频输入，例如 doubao-seed-1-6-vision-250815；也可填方舟推理接入点 ID。"},
	}},
	{ID: "chat", Name: "对话模型", Hint: "创作助手（Agent）和「AI写剧本」直接调用 DeepSeek、豆包（火山方舟）。填写的每个模型会出现在「模型管理」里，按输入、输出 token 计费，单价在模型的生成能力里设置。保存后重启服务生效。", Fields: []Field{
		{Key: "CHAT_DEEPSEEK_BASE_URL", Label: "DeepSeek API 地址", Kind: "url", Default: "https://api.deepseek.com"},
		{Key: "CHAT_DEEPSEEK_API_KEY", Label: "DeepSeek API Key", Kind: "secret"},
		{Key: "CHAT_DEEPSEEK_MODELS", Label: "DeepSeek 模型", Kind: "text", Default: DefaultDeepSeekModels, Hint: "模型 ID，多个用逗号分隔，例如 deepseek-flash、deepseek-v4-pro。deepseek-flash 能识别图片，deepseek-v4-pro 不能。"},
		{Key: "CHAT_ARK_BASE_URL", Label: "火山方舟 API 地址", Kind: "url", Default: "https://ark.cn-beijing.volces.com/api/v3"},
		{Key: "CHAT_ARK_API_KEY", Label: "火山方舟 API Key", Kind: "secret", Hint: "留空时使用「视频理解」的 API Key。"},
		{Key: "CHAT_ARK_MODELS", Label: "豆包模型", Kind: "text", Default: DefaultArkChatModels, Hint: "方舟控制台已开通的模型 ID 或推理接入点 ID，多个用逗号分隔。"},
	}},
	{ID: "notifications", Name: "完成订阅通知", Hint: "需先配置微信登录，并在微信后台取得订阅消息模板。", Fields: []Field{
		{Key: "WECHAT_COMPLETION_TEMPLATE_ID", Label: "订阅模板 ID", Kind: "text"},
		{Key: "WECHAT_COMPLETION_FIELDS", Label: "模板字段映射", Kind: "mapping", Default: "{}", Hint: "例如 thing1 对应 {{title}}；字段名以微信模板为准。", Limit: 30, Columns: []Column{
			{Key: "name", Label: "微信字段名", Max: 40, Pattern: `[A-Za-z][A-Za-z0-9_]{0,39}`},
			{Key: "content", Label: "字段内容", Max: 2000},
		}},
	}},
	{ID: "site", Name: "站点地址", Hint: "这里的地址设置不会修改 Nginx、证书或小程序代码。发布小程序前仍需配置 HTTPS 合法域名。", Fields: []Field{
		{Key: "PUBLIC_BASE_URL", Label: "公网访问地址", Kind: "url", Hint: "分享链接使用此地址；虚拟支付回调路径为 /api/payments/virtual/notify。"},
		{Key: "WEB_ORIGIN", Label: "允许的后台来源", Kind: "origins", Default: "http://localhost:5174,http://127.0.0.1:5174", Hint: "包含协议和端口，多个地址用英文逗号分隔；清空后仅允许同源访问。"},
	}},
	{ID: "alerts", Name: "外部告警", Hint: "选填，未配置时仍保留后台告警和错误记录。", Fields: []Field{
		{Key: "ALERT_WEBHOOK_URL", Label: "告警 Webhook 地址", Kind: "secret"},
	}},
}

func group(id string) (Group, bool) {
	for _, g := range definitions {
		if g.ID == id {
			return g, true
		}
	}
	return Group{}, false
}

func defaults(g Group) Values {
	v := Values{}
	for _, f := range g.Fields {
		v[f.Key] = f.Default
	}
	return v
}
