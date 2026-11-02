package api

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
)

func identity(r *http.Request) Identity { return r.Context().Value(identityKey).(Identity) }

func reply(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func fail(w http.ResponseWriter, status int, message string) {
	reply(w, status, map[string]string{"error": message})
}

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		fail(w, 400, "请求格式不正确")
		return false
	}
	if err := dec.Decode(new(any)); err != io.EOF {
		fail(w, 400, "请求包含多余内容")
		return false
	}
	return true
}

func dbError(w http.ResponseWriter, err error) {
	var rule *partners.RuleError
	switch {
	case errors.Is(err, context.Canceled):
		return
	case errors.Is(err, core.ErrInsufficient):
		fail(w, 402, err.Error())
	case errors.Is(err, core.ErrUserDisabled):
		fail(w, 403, err.Error())
	case errors.Is(err, core.ErrActivationRequired), errors.Is(err, core.ErrPartnerDisabled):
		reply(w, 403, map[string]string{"code": "ACTIVATION_REQUIRED", "error": err.Error()})
	case errors.Is(err, core.ErrQuota):
		fail(w, 409, err.Error())
	case errors.As(err, &rule):
		fail(w, 400, err.Error())
	case errors.Is(err, core.ErrPaymentMismatch):
		fail(w, 400, err.Error())
	case errors.Is(err, core.ErrNotFound):
		fail(w, 404, err.Error())
	case errors.Is(err, core.ErrConflict) || errors.Is(err, core.ErrIdempotency):
		fail(w, 409, err.Error())
	default:
		slog.Error("storage failure", "error", err)
		fail(w, 503, "服务暂时不可用，请稍后重试")
	}
}
