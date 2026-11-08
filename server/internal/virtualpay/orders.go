package virtualpay

import (
	"context"
	"doubo/server/internal/core"
	"fmt"
)

type RemoteOrder struct {
	ID        string `json:"order_id"`
	WXID      string `json:"wx_order_id"`
	Status    int    `json:"status"`
	Type      int    `json:"order_type"`
	Env       int    `json:"env_type"`
	Fee       int64  `json:"order_fee"`
	Paid      int64  `json:"paid_fee"`
	RefundFee int64  `json:"refund_fee"`
	Left      int64  `json:"left_fee"`
	PaidTime  int64  `json:"paid_time"`
	Meta      string `json:"biz_meta"`
}

func (c *Client) Query(ctx context.Context, id string, o core.Order) (RemoteOrder, error) {
	var response struct {
		Order *RemoteOrder `json:"order"`
	}
	if o.Virtual == nil {
		return RemoteOrder{}, fmt.Errorf("不是虚拟支付订单")
	}
	e := c.call(ctx, "/xpay/query_order", o.Virtual.Env, map[string]any{"openid": o.OpenID, "env": o.Virtual.Env, "order_id": id}, &response)
	if e != nil {
		return RemoteOrder{}, e
	}
	if response.Order == nil {
		return RemoteOrder{}, fmt.Errorf("虚拟支付订单尚未查到")
	}
	result := *response.Order
	if result.ID != id || result.Env != o.Virtual.Env+1 || (result.Type != 0 && result.Type != 7) || result.Fee != o.AmountFen || !paymentMetaMatches(result.Meta, id) {
		return RemoteOrder{}, core.ErrPaymentMismatch
	}
	return result, nil
}
func (c *Client) Deliver(ctx context.Context, id string, o core.Order) error {
	return c.call(ctx, "/xpay/notify_provide_goods", o.Virtual.Env, map[string]any{"order_id": id, "env": o.Virtual.Env}, nil)
}
func (c *Client) Refund(ctx context.Context, id string, r core.Refund, o core.Order, paid RemoteOrder) (string, error) {
	if paid.WXID == "" || paid.WXID != o.TransactionID || paid.Paid != o.AmountFen {
		return "", core.ErrPaymentMismatch
	}
	if paid.Type == 7 {
		return "", fmt.Errorf("Apple 订单由用户在 App Store 申请退款")
	}
	if paid.Left < r.AmountFen {
		return "", fmt.Errorf("微信剩余可退金额不足，请核对退款记录")
	}
	var result struct {
		ID      string `json:"refund_order_id"`
		WXID    string `json:"refund_wx_order_id"`
		PayID   string `json:"pay_order_id"`
		PayWXID string `json:"pay_wx_order_id"`
	}
	e := c.call(ctx, "/xpay/refund_order", o.Virtual.Env, map[string]any{"openid": o.OpenID, "order_id": r.OrderID, "refund_order_id": id, "left_fee": paid.Left, "refund_fee": r.AmountFen, "biz_meta": id, "refund_reason": "3", "req_from": "1", "env": o.Virtual.Env}, &result)
	if e != nil {
		return "", e
	}
	if result.ID != id || result.PayID != r.OrderID || result.PayWXID != paid.WXID || result.WXID == "" {
		return "", core.ErrPaymentMismatch
	}
	return result.WXID, nil
}
func (c *Client) QueryRefund(ctx context.Context, id string, r core.Refund, o core.Order) (RemoteOrder, error) {
	var response struct {
		Order *RemoteOrder `json:"order"`
	}
	body := map[string]any{"openid": o.OpenID, "env": o.Virtual.Env}
	if r.ProviderOrderID != "" {
		body["wx_order_id"] = r.ProviderOrderID
	} else {
		body["order_id"] = id
	}
	if e := c.call(ctx, "/xpay/query_order", o.Virtual.Env, body, &response); e != nil {
		return RemoteOrder{}, e
	}
	if response.Order == nil {
		return RemoteOrder{}, fmt.Errorf("退款状态尚未确认")
	}
	v := *response.Order
	if v.ID != id || v.Env != o.Virtual.Env+1 || (v.Type != 1 && v.Type != 8) || v.RefundFee != r.AmountFen || v.Meta != id || v.WXID == "" || (r.ProviderOrderID != "" && v.WXID != r.ProviderOrderID) {
		return v, core.ErrPaymentMismatch
	}
	return v, nil
}
