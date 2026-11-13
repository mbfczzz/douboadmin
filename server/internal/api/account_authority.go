package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"reflect"
)

// Non-super accounts may change only the commission ratio, within their existing scope.
func (a *Server) accountOrPricingOnly(w http.ResponseWriter, r *http.Request, next core.Partner) bool {
	if identity(r).AdminRole == core.SuperAdminRole {
		return true
	}
	row, err := a.Store.Get(r.Context(), "partners", r.PathValue("id"))
	if err != nil {
		dbError(w, err)
		return false
	}
	var current core.Partner
	if json.Unmarshal(row.Data, &current) != nil {
		fail(w, 500, "服务商资料异常")
		return false
	}
	next.ChildMarginBps = current.ChildMarginBps
	if !reflect.DeepEqual(next, current) {
		fail(w, 403, "仅超级管理员可管理账号，当前仅可调整算力分佣比例")
		return false
	}
	return true
}
