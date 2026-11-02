package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
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
	reply(w, 200, map[string]any{"orderId": row.ID, "userId": order.UserID, "amountFen": order.AmountFen, "pointsUnits": order.PointsUnits, "status": order.Status, "distribution": order.Distribution})
}

func (a *Server) requestCommissionPayout(w http.ResponseWriter, r *http.Request) {
	var v struct {
		PartnerID string `json:"partnerId"`
		AmountFen int64  `json:"amountFen"`
		Note      string `json:"note"`
	}
	if !decode(w, r, &v) {
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
	if !decode(w, r, &v) {
		return
	}
	out, e := a.Partners.FinishPayout(r.Context(), r.PathValue("id"), v.Status, v.Reference, identity(r).ID, v.Version)
	partnerResult(w, out, e)
}
