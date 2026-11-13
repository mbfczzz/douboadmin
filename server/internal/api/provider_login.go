package api

import "net/http"

// Kept as an explicit denial for older mini-program clients.
func (a *Server) providerPassword(w http.ResponseWriter, r *http.Request) {
	fail(w, http.StatusForbidden, "登录账号开通和密码重置请联系超级管理员")
}
