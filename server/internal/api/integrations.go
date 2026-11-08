package api

import (
	"doubo/server/internal/settings"
	"errors"
	"net/http"
)

func (a *Server) integrationSettings(w http.ResponseWriter, r *http.Request) {
	role := identity(r).AdminRole
	if role != "" && role != "super_admin" {
		reply(w, 200, map[string]bool{"canManage": false})
		return
	}
	if a.Integrations == nil {
		reply(w, 200, map[string]any{"canManage": true, "available": false, "groups": []any{}})
		return
	}
	states, err := a.Integrations.States(r.Context(), a.Config.Production)
	if err != nil {
		fail(w, 503, "无法读取接入配置，请检查数据库和加密密钥文件")
		return
	}
	reply(w, 200, map[string]any{"canManage": true, "available": true, "groups": states, "keyFile": a.Integrations.KeyPath})
}

func (a *Server) saveIntegrationSettings(w http.ResponseWriter, r *http.Request) {
	if a.Integrations == nil {
		fail(w, 503, "接入配置服务未初始化，请使用新版启动程序")
		return
	}
	var input settings.Update
	if !decode(w, r, &input) {
		return
	}
	err := a.Integrations.Save(r.Context(), r.PathValue("group"), identity(r).ID, input, a.Config.Production)
	if err != nil {
		var validation *settings.ValidationError
		if errors.As(err, &validation) {
			reply(w, 400, validation)
		} else {
			dbError(w, err)
		}
		return
	}
	a.integrationSettings(w, r)
}
