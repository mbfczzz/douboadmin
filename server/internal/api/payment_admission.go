package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"fmt"
)

// Serialize new charges with payment configuration changes. Historical callbacks
// and refunds continue using the original order snapshots.
func (a *Server) paymentAdmission(tx store.Transaction) error {
	if a.Integrations == nil {
		return nil
	}
	if _, err := tx.Lock("settings_control", core.Record{ID: "integrations", Data: core.Data(map[string]string{})}); err != nil {
		return err
	}
	pending, err := a.Integrations.PendingPayment(tx)
	if err != nil {
		return err
	}
	if pending {
		return fmt.Errorf("%w: 支付配置已变更，请等待服务重启后刷新重试", core.ErrConflict)
	}
	return nil
}
