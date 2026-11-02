package payments

import (
	"doubo/server/internal/billing"
	"fmt"
	"net/http"
	"time"

	transactions "github.com/wechatpay-apiv3/wechatpay-go/services/payments"
)

func (p *Client) PaymentNotification(r *http.Request) (billing.PaymentResult, error) {
	if !p.Ready() {
		return billing.PaymentResult{}, fmt.Errorf("微信支付尚未配置")
	}
	var transaction transactions.Transaction
	n, err := p.notify.ParseNotifyRequest(r.Context(), r, &transaction)
	if err != nil || n.EventType != "TRANSACTION.SUCCESS" {
		return billing.PaymentResult{}, fmt.Errorf("支付通知验签、解密或事件类型校验失败")
	}
	if text(transaction.Appid) != p.Config.AppID || text(transaction.Mchid) != p.Config.MerchantID {
		return billing.PaymentResult{}, fmt.Errorf("支付通知商户或应用不匹配")
	}
	return transactionResult(&transaction)
}

func (p *Client) RefundNotification(r *http.Request) (billing.RefundResult, error) {
	if !p.Ready() {
		return billing.RefundResult{}, fmt.Errorf("微信支付尚未配置")
	}
	var event struct {
		MerchantID  string `json:"mchid"`
		ID          string `json:"out_refund_no"`
		OrderID     string `json:"out_trade_no"`
		ProviderID  string `json:"refund_id"`
		Status      string `json:"refund_status"`
		SuccessTime string `json:"success_time"`
		Amount      struct {
			Refund int64 `json:"refund"`
		} `json:"amount"`
	}
	n, err := p.notify.ParseNotifyRequest(r.Context(), r, &event)
	if err != nil {
		return billing.RefundResult{}, fmt.Errorf("退款通知验签或解密失败")
	}
	if n.EventType != "REFUND.SUCCESS" && n.EventType != "REFUND.CLOSED" && n.EventType != "REFUND.ABNORMAL" {
		return billing.RefundResult{}, fmt.Errorf("退款通知事件类型无效")
	}
	if event.MerchantID != p.Config.MerchantID || n.EventType != "REFUND."+event.Status {
		return billing.RefundResult{}, fmt.Errorf("退款通知商户或状态不匹配")
	}
	completed := time.Now().UTC()
	if event.Status == "SUCCESS" {
		if completed, err = time.Parse(time.RFC3339, event.SuccessTime); err != nil {
			return billing.RefundResult{}, fmt.Errorf("退款完成时间无效")
		}
	}
	return billing.RefundResult{ID: event.ID, OrderID: event.OrderID, ProviderID: event.ProviderID, Status: event.Status, AmountFen: event.Amount.Refund, CompletedAt: completed}, nil
}
