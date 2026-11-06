package api

import (
	"net/http"
	"strings"
)

func (a *Server) retryVirtualEvent(w http.ResponseWriter, r *http.Request) {
	if !a.Virtual.Ready() {
		fail(w, 503, "虚拟支付尚未配置")
		return
	}
	if e := a.Virtual.RetryEvent(r.Context(), r.PathValue("id"), identity(r).ID); e != nil {
		fail(w, 502, e.Error())
		return
	}
	reply(w, 200, map[string]bool{"ok": true})
}

func (a *Server) reviewVirtualEvent(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Version int64  `json:"version"`
		Note    string `json:"note"`
	}
	if !decode(w, r, &v) {
		return
	}
	if strings.TrimSpace(v.Note) == "" || len([]rune(v.Note)) > 500 {
		fail(w, 400, "请填写 1–500 字核对说明")
		return
	}
	if a.Virtual == nil {
		fail(w, 503, "虚拟支付服务不可用")
		return
	}
	if e := a.Virtual.ReviewEvent(r.Context(), r.PathValue("id"), v.Version, v.Note, identity(r).ID); e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, map[string]bool{"ok": true})
}
