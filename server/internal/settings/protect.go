package settings

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
	"strings"
)

func protectIdentity(tx store.Transaction, id string, previous, next Values, input Update) error {
	identity := ""
	if id == "wechat" && previous["WECHAT_APP_ID"] != next["WECHAT_APP_ID"] {
		identity = "WECHAT_APP_ID"
		if previous["WECHAT_APP_SECRET"] != "" && strings.TrimSpace(input.Values["WECHAT_APP_SECRET"]) == "" {
			return invalid("WECHAT_APP_SECRET", "更换 AppID 时须重新填写对应的 AppSecret")
		}
	}
	if id == "virtual" && previous["WECHAT_VIRTUAL_OFFER_ID"] != next["WECHAT_VIRTUAL_OFFER_ID"] {
		identity = "WECHAT_VIRTUAL_OFFER_ID"
		if previous["WECHAT_VIRTUAL_APP_KEY"] != "" && strings.TrimSpace(input.Values["WECHAT_VIRTUAL_APP_KEY"]) == "" {
			return invalid("WECHAT_VIRTUAL_APP_KEY", "更换 OfferID 时须重新填写对应的现网 AppKey")
		}
	}
	cleared := ""
	for _, key := range []string{"WECHAT_APP_SECRET", "WECHAT_VIRTUAL_APP_KEY", "WECHAT_VIRTUAL_SANDBOX_APP_KEY", "WECHAT_VIRTUAL_TOKEN", "WECHAT_VIRTUAL_ENCODING_AES_KEY"} {
		if previous[key] != "" && next[key] == "" {
			cleared = key
		}
	}
	if identity == "" && cleared == "" {
		return nil
	}
	hasOrders, err := tx.HasRecords("orders")
	if err != nil {
		return err
	}
	if hasOrders {
		if identity != "" {
			return invalid(identity, "已有订单，不能在此更换小程序或支付应用身份；请先安排账户与历史订单迁移")
		}
		return invalid(cleared, "已有订单需要继续查单和退款，此密钥可以替换但不能直接清除")
	}
	if identity != "" && previous["WECHAT_VIRTUAL_ENABLED"] == "true" {
		return invalid(identity, "更换接入身份前，请先关闭虚拟支付通道并重启服务")
	}
	return nil
}

// The caller holds the same integration-control lock used by Save.
func (m *Manager) PendingPayment(tx store.Transaction) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, id := range []string{"wechat", "virtual"} {
		row, err := tx.Get(namespace, id)
		if errors.Is(err, core.ErrNotFound) {
			continue
		}
		if err != nil {
			return false, err
		}
		if row.Version != m.applied[id] {
			return true, nil
		}
	}
	return false, nil
}
