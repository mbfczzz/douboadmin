package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"slices"
)

func (a *Server) orderDistribution(w http.ResponseWriter, r *http.Request) {
	row, e := a.Store.Get(r.Context(), "orders", r.PathValue("id"))
	if e != nil {
		dbError(w, e)
		return
	}
	var order core.Order
	if e = json.Unmarshal(row.Data, &order); e != nil {
		dbError(w, e)
		return
	}
	if scope, se := a.partnerScope(r); se != nil {
		dbError(w, se)
		return
	} else if scope != nil {
		// Providers see their own orders and only the shares inside their subtree.
		if order.Distribution == nil {
			fail(w, 403, "只能查看本服务商及其下级的订单")
			return
		}
		if !a.inPartnerScope(w, r, order.Distribution.PartnerID) {
			return
		}
		d := *order.Distribution
		d.Shares, d.CostFen = []core.CommissionShare{}, 0
		for _, s := range order.Distribution.Shares {
			if slices.Contains(scope, s.PartnerID) {
				d.Shares = append(d.Shares, s)
			}
		}
		order.Distribution = &d
	}
	reply(w, 200, map[string]any{"orderId": row.ID, "userId": order.UserID, "amountFen": order.AmountFen, "pointsUnits": order.PointsUnits, "status": order.Status, "distribution": order.Distribution})
}

func (a *Server) requestCommissionPayout(w http.ResponseWriter, r *http.Request) {
	var v struct {
		PartnerID string `json:"partnerId"`
		AmountFen int64  `json:"amountFen"`
		Note      string `json:"note"`
	}
	if !decode(w, r, &v) || !a.inPartnerScope(w, r, v.PartnerID) {
		return
	}
	out, e := a.Partners.RequestPayout(r.Context(), v.PartnerID, v.AmountFen, v.Note, r.Header.Get("Idempotency-Key"), identity(r).ID)
	partnerResult(w, out, e)
}
func (a *Server) finishCommissionPayout(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Version   int64  `json:"version"`
		Status    string `json:"status"`
		Reference string `json:"reference"`
	}
	if !platformOnly(w, r) || !decode(w, r, &v) {
		return
	}
	out, e := a.Partners.FinishPayout(r.Context(), r.PathValue("id"), v.Status, v.Reference, identity(r).ID, v.Version)
	partnerResult(w, out, e)
}
