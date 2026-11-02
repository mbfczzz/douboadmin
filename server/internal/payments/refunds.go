package payments

import (
	"context"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"fmt"
	"time"

	wx "github.com/wechatpay-apiv3/wechatpay-go/core"
	"github.com/wechatpay-apiv3/wechatpay-go/services/refunddomestic"
)

func refundResult(r *refunddomestic.Refund) (billing.RefundResult, error) {
	if r == nil || r.Amount == nil || r.Status == nil {
		return billing.RefundResult{}, fmt.Errorf("退款状态信息不完整")
	}
	completed := time.Now().UTC()
	if r.SuccessTime != nil {
		completed = *r.SuccessTime
	}
	return billing.RefundResult{ID: text(r.OutRefundNo), OrderID: text(r.OutTradeNo), ProviderID: text(r.RefundId), Status: string(*r.Status), AmountFen: number(r.Amount.Refund), CompletedAt: completed}, nil
}
func (p *Client) Refund(ctx context.Context, id string, r core.Refund) (billing.RefundResult, error) {
	if !p.Ready() {
		return billing.RefundResult{}, fmt.Errorf("微信支付尚未配置")
	}
	service := refunddomestic.RefundsApiService{Client: p.api}
	response, _, err := service.Create(ctx, refunddomestic.CreateRequest{OutTradeNo: wx.String(r.OrderID), OutRefundNo: wx.String(id), Reason: wx.String(r.Reason), NotifyUrl: wx.String(p.Config.RefundNotifyURL), Amount: &refunddomestic.AmountReq{Refund: wx.Int64(r.AmountFen), Total: wx.Int64(r.AmountFen), Currency: wx.String("CNY")}})
	if err != nil {
		return billing.RefundResult{}, serviceError()
	}
	return refundResult(response)
}
func (p *Client) QueryRefund(ctx context.Context, id string) (billing.RefundResult, error) {
	if !p.Ready() {
		return billing.RefundResult{}, fmt.Errorf("微信支付尚未配置")
	}
	service := refunddomestic.RefundsApiService{Client: p.api}
	r, _, err := service.QueryByOutRefundNo(ctx, refunddomestic.QueryByOutRefundNoRequest{OutRefundNo: wx.String(id)})
	if err != nil {
		return billing.RefundResult{}, serviceError()
	}
	return refundResult(r)
}
