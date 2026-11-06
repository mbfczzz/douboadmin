package api

import (
	"bytes"
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/virtualpay"
	"encoding/json"
	"encoding/xml"
	"io"
	"net/http"
	"strconv"
	"time"
)

func (a *Server) virtualNotify(w http.ResponseWriter, r *http.Request) {
	if !a.Virtual.Ready() {
		fail(w, 503, "虚拟支付尚未配置")
		return
	}
	if r.Method == "GET" {
		echo, e := a.Virtual.Client.VerifyURL(r.URL.Query())
		if e != nil {
			fail(w, 403, "消息校验失败")
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = io.WriteString(w, echo)
		return
	}
	raw, e := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if e != nil {
		fail(w, 400, "消息过大")
		return
	}
	event, e := a.Virtual.Client.Decode(r.URL.Query(), raw)
	if e != nil {
		fail(w, 403, "消息验证失败")
		return
	}
	if event.Name == "xpay_subscribe_ios_refund_query_notify" {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		decision := a.Virtual.RefundEvidence(ctx, event.IOSOrderID)
		response := struct {
			XMLName  xml.Name               `json:"-" xml:"xml"`
			Code     int                    `json:"ErrCode" xml:"ErrCode"`
			Message  string                 `json:"ErrMsg" xml:"ErrMsg"`
			Decision virtualpay.IOSDecision `json:"IosRefundQueryResponse" xml:"IosRefundQueryResponse"`
		}{Message: "success", Decision: decision}
		asXML := len(bytes.TrimSpace(raw)) > 0 && bytes.TrimSpace(raw)[0] == '<'
		var body []byte
		if asXML {
			body, e = xml.Marshal(response)
		} else {
			body, e = json.Marshal(response)
		}
		if e == nil {
			body, e = a.Virtual.Client.Reply(body, asXML)
		}
		if e != nil {
			fail(w, 503, "退款问询暂不可用")
			return
		}
		contentType := "application/json"
		if asXML {
			contentType = "application/xml"
		}
		w.Header().Set("Content-Type", contentType)
		_, _ = w.Write(body)
		return
	}
	if e = a.Virtual.Handle(r.Context(), event); e != nil {
		fail(w, 503, "通知处理尚未完成，请重试")
		return
	}
	// Safe-mode message push explicitly permits an unencrypted success acknowledgement.
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = io.WriteString(w, "success")
}
func (a *Server) virtualEvents(w http.ResponseWriter, r *http.Request) {
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	data, e := a.Store.RecordPage(r.Context(), core.RecordQuery{Namespace: "virtual_payment_events", Status: r.URL.Query().Get("status"), Page: page, Size: 20})
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, data)
}
