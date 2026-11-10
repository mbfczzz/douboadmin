package store

// Wallets, recharge orders, refunds and WeChat virtual payment.
func init() {
	register(
		Table{Name: "wallets", Comment: "用户积分钱包；id = 用户 id（所有资金事务先锁此行）", Owner: "用户", Cols: []Col{
			c("userId", Key), c("availableUnits", Int), c("heldUnits", Int),
		}},
		Table{Name: "wallet_ledger", Comment: "积分流水；id = 摘要(用户:业务引用)", Owner: "用户", Cols: []Col{
			c("userId", Key), c("reference", Short), c("kind", Key), c("availableDelta", Int), c("heldDelta", Int),
			c("availableAfter", Int), c("heldAfter", Int), c("actor", Key), c("note", Text),
		}},
		Table{Name: "orders", Comment: "充值订单", Owner: "用户", Cols: []Col{
			c("userId", Key), c("status", Key), c("channel", Key), c("amountFen", Int), c("pointsUnits", Int),
			c("appid", Key), c("merchantId", Key), c("openid", Key), c("transactionId", Key), c("prepayId", Short),
			c("refundId", Key), c("requestHash", Key), c("expiresAt", Time), c("paidAt", Time),
			c("virtual", JSON), c("distribution", JSON),
		}, Indexes: []string{"status", "paid_at", "transaction_id"}},
		Table{Name: "payment_transactions", Comment: "支付流水号 → 订单；id = 支付平台交易号，created_at = 确认到账时间", Owner: "用户", Cols: []Col{
			{Kind: Key, Name: "order_id"},
		}},
		Table{Name: "refunds", Comment: "退款", Owner: "用户", Cols: []Col{
			c("orderId", Key), c("userId", Key), c("status", Key), c("channel", Key), c("amountFen", Int),
			c("pointsUnits", Int), c("reason", Text), c("providerId", Short), c("providerOrderId", Short),
			c("error", Text), c("completedAt", Time),
		}, Indexes: []string{"status", "completed_at", "order_id"}},
		Table{Name: "virtual_deliveries", Comment: "虚拟支付待发货标记；id = 订单 id", Owner: "用户", Cols: []Col{
			c("status", Key),
		}, Indexes: []string{"status"}},
		Table{Name: "virtual_payment_events", Comment: "微信虚拟支付回调与退款事件", Cols: []Col{
			c("event", Short), c("status", Key), c("orderId", Key), c("refundId", Key), c("providerId", Short),
			c("amountFen", Int), c("fingerprint", Short), c("details", Long), c("message", JSON),
			c("lastError", Text), c("note", Text), c("actor", Key), c("handledAt", Time),
		}, Indexes: []string{"status"}},
	)
}
