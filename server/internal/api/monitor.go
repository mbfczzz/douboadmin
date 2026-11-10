package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"net/http"
	"time"
)

func (a *Server) monitor(w http.ResponseWriter, r *http.Request) {
	instances, e := store.AllRecords(r.Context(), a.Store, "instances", "")
	if e != nil {
		dbError(w, e)
		return
	}
	queue, e := a.Store.QueueHealth(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	alerts, e := a.Store.RecordPage(r.Context(), core.RecordQuery{Namespace: "alerts", Fields: map[string]string{"acknowledged": "false"}, Page: 1, Size: 1})
	if e != nil {
		dbError(w, e)
		return
	}
	errorsHour, e := store.CountErrorsSince(r.Context(), a.Store, time.Now().Add(-time.Hour))
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, map[string]any{"pendingAlerts": alerts.Total, "errorsHour": errorsHour, "instances": instances, "queue": queue, "database": a.Store.Ping(r.Context()) == nil, "redisConfigured": a.Sessions.Redis != nil, "ossConfigured": a.Objects != nil, "relayConfigured": a.Relay.Ready(), "paymentConfigured": a.rechargeReady(), "hotConfigured": a.Hot.Ready()})
}
func (a *Server) operationalRecords(namespace string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Has("page") {
			a.simpleList(namespace)(w, r)
			return
		}
		rows, e := a.Store.List(r.Context(), namespace, "")
		if e != nil {
			dbError(w, e)
			return
		}
		reply(w, 200, rows)
	}
}
func (a *Server) acknowledgeAlert(w http.ResponseWriter, r *http.Request) {
	row, e := a.Store.Get(r.Context(), "alerts", r.PathValue("id"))
	if e != nil {
		dbError(w, e)
		return
	}
	var alert core.Alert
	if e = json.Unmarshal(row.Data, &alert); e != nil {
		dbError(w, e)
		return
	}
	alert.Acknowledged = true
	alert.Actor = identity(r).ID
	row.Data = core.Data(alert)
	row, e = a.Store.Put(r.Context(), "alerts", row, row.Version)
	if e != nil {
		dbError(w, e)
		return
	}
	reply(w, 200, row)
}
