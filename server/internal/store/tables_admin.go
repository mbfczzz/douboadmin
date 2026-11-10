package store

// Admin accounts, integration settings, monitoring and traffic.
func init() {
	register(
		Table{Name: "admin_accounts", Comment: "后台账号；id = 摘要(用户名)", Cols: []Col{
			c("username", Short), c("name", Short), c("phone", Key), c("role", Key), c("partnerId", Key),
			c("passwordHash", Short), c("disabled", Bool), c("archived", Bool), c("createdBy", Key),
			c("lastLoginAt", Time), c("passwordChangedAt", Time),
		}, Indexes: []string{"partner_id"}},
		Table{Name: "admin_logins", Comment: "后台账号最近登录时间；id = 账号 id", Owner: "账号", Cols: []Col{
			c("at", Time),
		}},
		Table{Name: "admin_roles", Comment: "后台角色与菜单权限", Cols: []Col{
			c("name", Short), c("scope", Key), c("menus", JSON), c("system", Bool), c("deleted", Bool),
		}},
		Table{Name: "provider_logins", Comment: "服务商后台登录密码（加密保存）；id = 服务商 id", Owner: "服务商", Cols: []Col{
			c("sealed", Text), c("changedAt", Time),
		}},
		Table{Name: "integration_settings", Comment: "接入配置（整体加密）；id = 配置分组", Cols: []Col{
			c("format", Int), c("keyId", Key), c("ciphertext", Long),
		}},
		Table{Name: "integration_audit", Comment: "接入配置修改记录", Owner: "操作人", Cols: []Col{
			c("group", Key), c("actor", Key), c("fields", JSON), {Field: "version", Kind: Int, Name: "settings_version"},
		}},
		Table{Name: "settings_control", Comment: "锁行：串行化接入配置与支付准入（id = integrations）"},
		Table{Name: "leases", Comment: "后台对账任务租约；after 为对账游标", Cols: []Col{
			c("until", Time), c("after", JSON),
		}},
		Table{Name: "wechat_tokens", Comment: "微信接口 access_token 缓存；id = 摘要(appid)", Cols: []Col{
			c("token", Text), c("expires", Time),
		}},
		Table{Name: "instances", Comment: "服务进程心跳", Cols: []Col{
			{Field: "id", Kind: Key, Name: "node_id"}, c("host", Short), c("role", Key), c("goVersion", Key),
			c("startedAt", Time), c("seenAt", Time), c("heapBytes", Int), c("goroutines", Int), c("dbOpen", Int), c("dbInUse", Int),
		}},
		Table{Name: "alerts", Comment: "后台告警；id = 摘要(类型:10 分钟时段)", Cols: []Col{
			c("kind", Key), c("message", Text), c("acknowledged", Bool), c("actor", Key),
		}},
		Table{Name: "error_logs", Comment: "错误日志（同节点同内容每小时合并计数）", Cols: []Col{
			c("level", Key), c("message", Text), c("detail", Text), c("node", Key), c("count", Int), c("lastAt", Time),
		}},
		Table{Name: "visits", Comment: "小程序访问会话", Cols: []Col{
			c("visitor", Key), c("day", Key), c("client", Key), c("source", Key), c("platform", Key),
			c("scene", Int), c("entry", Short), c("pages", Int), c("counts", JSON), c("firstAt", Time), c("lastAt", Time),
		}, Indexes: []string{"day"}},
		Table{Name: "visitors", Comment: "访问设备（首次访问）", Cols: []Col{
			c("firstDay", Key), c("client", Key),
		}},
	)
}
