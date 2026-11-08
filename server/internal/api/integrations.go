package api

import (
	"doubo/server/internal/settings"
	"errors"
	"log/slog"
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
		if integrationKeyError(w, err) {
			return
		}
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
		} else if integrationKeyError(w, err) {
			return
		} else {
			dbError(w, err)
		}
		return
	}
	a.integrationSettings(w, r)
}

func integrationKeyError(w http.ResponseWriter, err error) bool {
	var key *settings.KeyFileError
	if !errors.As(err, &key) {
		return false
	}
	slog.Warn("integration key unavailable", "error", key.Error())
	reply(w, 503, map[string]string{"code": "INTEGRATION_KEY_UNAVAILABLE", "error": key.Error()})
	return true
}
