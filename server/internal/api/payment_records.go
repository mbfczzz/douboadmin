package api

import (
	"doubo/server/internal/core"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func (a *Server) paymentRecords(w http.ResponseWriter, r *http.Request) {
	values := r.URL.Query()
	q := core.PaymentQuery{Search: strings.TrimSpace(values.Get("q")), Status: values.Get("status"), Page: 1, Size: 20}
	if v := values.Get("page"); v != "" {
		n, e := strconv.Atoi(v)
		if e != nil || n < 1 || n > 1000000 {
			fail(w, 400, "页码无效")
			return
		}
		q.Page = n
	}
	if len([]rune(q.Search)) > 100 || (q.Status != "" && q.Status != "paid" && q.Status != "refunding" && q.Status != "refunded") {
		fail(w, 400, "支付查询条件无效")
		return
	}
	zone := time.FixedZone("CST", 8*60*60)
	for _, key := range []string{"from", "to"} {
		if value := values.Get(key); value != "" {
			day, e := time.ParseInLocation("2006-01-02", value, zone)
			if e != nil {
				fail(w, 400, "日期格式应为 YYYY-MM-DD")
				return
			}
			if key == "from" {
				q.From = day
			} else {
				q.Until = day.AddDate(0, 0, 1)
			}
		}
	}
	if !q.From.IsZero() && !q.Until.IsZero() && !q.From.Before(q.Until) {
		fail(w, 400, "开始日期不能晚于结束日期")
		return
	}
	page, e := a.Store.PaymentRecords(r.Context(), q)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, page)
}
