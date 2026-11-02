package payments

import (
	"context"
	"doubo/server/internal/billing"
	"doubo/server/internal/core"
	"fmt"
	"strconv"
	"time"

	wx "github.com/wechatpay-apiv3/wechatpay-go/core"
	transactions "github.com/wechatpay-apiv3/wechatpay-go/services/payments"
	"github.com/wechatpay-apiv3/wechatpay-go/services/payments/jsapi"
	"github.com/wechatpay-apiv3/wechatpay-go/utils"
)

type PayParams struct {
	TimeStamp string `json:"timeStamp"`
	NonceStr  string `json:"nonceStr"`
	Package   string `json:"package"`
	SignType  string `json:"signType"`
	PaySign   string `json:"paySign"`
}

func (p *Client) Prepay(ctx context.Context, id string, o core.Order) (string, error) {
	if !p.Ready() {
		return "", fmt.Errorf("微信支付尚未配置")
	}
	if o.PrepayID != "" {
		return o.PrepayID, nil
	}
	service := jsapi.JsapiApiService{Client: p.api}
	r, _, err := service.Prepay(ctx, jsapi.PrepayRequest{Appid: wx.String(p.Config.AppID), Mchid: wx.String(p.Config.MerchantID), Description: wx.String("豆播创作积分"), OutTradeNo: wx.String(id), TimeExpire: &o.ExpiresAt, NotifyUrl: wx.String(p.Config.NotifyURL), Amount: &jsapi.Amount{Total: wx.Int64(o.AmountFen), Currency: wx.String("CNY")}, Payer: &jsapi.Payer{Openid: wx.String(o.OpenID)}})
	if err != nil || r == nil || text(r.PrepayId) == "" {
		return "", serviceError()
	}
	return *r.PrepayId, nil
}
func (p *Client) Parameters(ctx context.Context, prepay string) (PayParams, error) {
	var result PayParams
	if !p.Ready() || prepay == "" {
		return result, fmt.Errorf("支付参数尚未准备好")
	}
	nonce, err := utils.GenerateNonce()
	if err != nil {
		return result, err
	}
	result = PayParams{TimeStamp: strconv.FormatInt(time.Now().Unix(), 10), NonceStr: nonce, Package: "prepay_id=" + prepay, SignType: "RSA"}
	message := p.Config.AppID + "\n" + result.TimeStamp + "\n" + nonce + "\n" + result.Package + "\n"
	signature, err := p.api.Sign(ctx, message)
	if err != nil {
		return result, serviceError()
	}
	result.PaySign = signature.Signature
	return result, nil
}
func transactionResult(t *transactions.Transaction) (billing.PaymentResult, error) {
	var r billing.PaymentResult
	if t == nil || t.Amount == nil || t.Payer == nil || text(t.TradeState) != "SUCCESS" {
		return r, fmt.Errorf("订单尚未支付成功")
	}
	paid, err := time.Parse(time.RFC3339, text(t.SuccessTime))
	if err != nil {
		return r, fmt.Errorf("支付成功时间无效")
	}
	r = billing.PaymentResult{OrderID: text(t.OutTradeNo), TransactionID: text(t.TransactionId), AppID: text(t.Appid), MerchantID: text(t.Mchid), OpenID: text(t.Payer.Openid), Currency: text(t.Amount.Currency), AmountFen: number(t.Amount.Total), PaidAt: paid}
	return r, nil
}
func (p *Client) Query(ctx context.Context, id string) (state string, result billing.PaymentResult, err error) {
	if !p.Ready() {
		return "", result, fmt.Errorf("微信支付尚未配置")
	}
	service := jsapi.JsapiApiService{Client: p.api}
	t, _, e := service.QueryOrderByOutTradeNo(ctx, jsapi.QueryOrderByOutTradeNoRequest{OutTradeNo: wx.String(id), Mchid: wx.String(p.Config.MerchantID)})
	if e != nil || t == nil {
		return "", result, serviceError()
	}
	state = text(t.TradeState)
	if text(t.OutTradeNo) != id || text(t.Mchid) != p.Config.MerchantID || text(t.Appid) != p.Config.AppID {
		return "", result, fmt.Errorf("微信查单身份不匹配")
	}
	if state == "SUCCESS" {
		result, err = transactionResult(t)
	}
	return
}
func (p *Client) Close(ctx context.Context, id string) error {
	if !p.Ready() {
		return fmt.Errorf("微信支付尚未配置")
	}
	service := jsapi.JsapiApiService{Client: p.api}
	_, err := service.CloseOrder(ctx, jsapi.CloseOrderRequest{OutTradeNo: wx.String(id), Mchid: wx.String(p.Config.MerchantID)})
	if err != nil {
		return serviceError()
	}
	return nil
}
