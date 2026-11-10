package store

// Provider tree (分公司 → S1 → S2 → 会员), codes, registrations and commission.
func init() {
	register(
		Table{Name: "partners", Comment: "服务商节点（分公司 / S1 / S2）", Owner: "上级服务商 id（顶层为 root）", Cols: []Col{
			c("name", Short), c("role", Key), c("status", Key), c("parentId", Key), c("path", JSON),
			c("ownerUser", Key), c("retailPer100Fen", Int), c("childMarginBps", Int),
		}, Indexes: []string{"owner_user"}},
		Table{Name: "partner_owners", Comment: "小程序用户负责的服务商；id = 用户 id", Owner: "用户", Cols: []Col{
			c("partnerId", Key), c("status", Key),
		}},
		Table{Name: "registrations", Comment: "扫码登记，待总部审核；id = 用户 id，created_at = 首次扫码时间", Owner: "用户", Cols: []Col{
			c("role", Key), c("status", Key), c("partnerId", Key), c("parentId", Key), c("referrer", Key),
			c("codeKind", Key), c("code", Key), c("method", Key), c("name", Short), c("phone", Key),
			c("registeredAt", Time), c("reason", Text), c("decidedBy", Key), c("decidedAt", Time),
		}, Indexes: []string{"status", "partner_id"}},
		Table{Name: "code_uses", Comment: "二维码使用记录；同一用户同一码一条，审批状态同步", Owner: "发码服务商", Cols: []Col{
			c("userId", Key), c("nickname", Short), c("name", Short), c("phone", Key),
			c("code", Key), c("codeKind", Key), c("role", Key), c("partnerId", Key), c("referrer", Key),
			c("method", Key), c("status", Key), c("reason", Text), c("registeredAt", Time), c("decidedAt", Time),
		}, Indexes: []string{"code_kind", "user_id,code"}},
		Table{Name: "memberships", Comment: "会员归属与开通状态；id = 用户 id", Owner: "用户", Cols: []Col{
			c("partnerId", Key), c("status", Key), c("codeId", Key), c("method", Key), c("referrer", Key),
			c("activatedAt", Time), c("changedAt", Time), c("reason", Text),
		}, Indexes: []string{"partner_id,status"}},
		Table{Name: "share_codes", Comment: "邀请码 / 开通码 / 绑定码 / 推广码；id = 码", Owner: "发码的服务商（推广码为用户）", Cols: []Col{
			c("partnerId", Key), c("kind", Key), c("status", Key), c("user", Key), c("actor", Key),
		}},
		codeTable("partner_share_codes", "服务商当前的会员开通码；id = 服务商 id"),
		codeTable("partner_s1_codes", "分公司当前的 S1 邀请码；id = 服务商 id"),
		codeTable("partner_s2_codes", "服务商当前的 S2 邀请码；id = 服务商 id"),
		Table{Name: "partner_bind_codes", Comment: "后台创建服务商的当前绑定码及绑定用户；id = 服务商 id", Owner: "服务商", Cols: []Col{
			c("code", Key), c("user", Key),
		}},
		codeTable("user_promo_codes", "会员当前的推广码；id = 用户 id"),
		Table{Name: "partner_audit", Comment: "服务商操作记录；data 随 kind 不同", Owner: "相关用户或服务商", Cols: []Col{
			c("kind", Key), c("actor", Key), c("reason", Text), c("data", JSON),
		}, Indexes: []string{"kind"}},
		Table{Name: "partner_commands", Comment: "后台命令幂等结果；id = 摘要(操作人:幂等键)", Owner: "操作人", Cols: []Col{
			c("hash", Key), c("result", JSON),
		}},
		Table{Name: "partner_control", Comment: "锁行：串行化服务商树变更（id = tree）"},
		Table{Name: "distribution_policy", Comment: "总账号价格与分佣规则（单行，id = distribution）", Cols: []Col{
			c("enabled", Bool), c("costPer100Fen", Int), c("rootMarginBps", Int),
		}},
		Table{Name: "commission_accounts", Comment: "服务商佣金账户；id = 服务商 id", Owner: "服务商", Cols: []Col{
			c("balanceFen", Int), c("heldFen", Int), c("paidOutFen", Int),
		}},
		Table{Name: "commission_ledger", Comment: "佣金流水", Owner: "服务商", Cols: []Col{
			c("partnerId", Key), c("kind", Key), c("orderId", Key), c("refundId", Key), c("amountFen", Int),
			c("heldDelta", Int), c("balanceAfter", Int), c("actor", Key), c("note", Text),
		}},
		Table{Name: "commission_payouts", Comment: "佣金提现", Owner: "服务商", Cols: []Col{
			c("partnerId", Key), c("status", Key), c("amountFen", Int), c("reference", Short), c("actor", Key), c("note", Text),
		}},
		Table{Name: "commission_settlements", Comment: "订单佣金结算（held = 各服务商冻结额）；id = 订单 id", Owner: "下单用户", Cols: []Col{
			c("status", Key), c("refundId", Key), c("held", JSON),
		}},
	)
}

func codeTable(name, comment string) Table {
	return Table{Name: name, Comment: comment, Owner: "同 id", Cols: []Col{c("code", Key)}}
}
