package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"fmt"
)

func LockWallet(tx Transaction, user string) (core.Record, core.Wallet, error) {
	r, err := tx.Lock("wallets", core.Record{ID: user, Owner: user, Data: core.Data(core.Wallet{UserID: user})})
	var wallet core.Wallet
	if err == nil {
		err = json.Unmarshal(r.Data, &wallet)
	}
	if err == nil && (wallet.UserID != user || wallet.Available < 0 || wallet.Held < 0 || wallet.Available > core.MaxBalance || wallet.Held > core.MaxBalance || wallet.Available+wallet.Held > core.MaxBalance) {
		err = fmt.Errorf("积分钱包数据异常")
	}
	return r, wallet, err
}

// ApplyFunds must run inside Atomic. The immutable ledger reference is an idempotency key.
func ApplyFunds(tx Transaction, entry core.LedgerEntry) (core.Wallet, error) {
	r, wallet, err := LockWallet(tx, entry.UserID)
	if err != nil {
		return wallet, err
	}
	if entry.Reference == "" || entry.AvailableDelta < -core.MaxBalance || entry.AvailableDelta > core.MaxBalance || entry.HeldDelta < -core.MaxBalance || entry.HeldDelta > core.MaxBalance {
		return wallet, fmt.Errorf("积分变动参数无效")
	}
	id := core.Digest(entry.UserID + "\x00" + entry.Reference)[:32]
	if old, e := tx.Get("wallet_ledger", id); e == nil {
		var previous core.LedgerEntry
		if json.Unmarshal(old.Data, &previous) != nil {
			return wallet, fmt.Errorf("积分流水格式异常")
		}
		if previous.Kind != entry.Kind || previous.AvailableDelta != entry.AvailableDelta || previous.HeldDelta != entry.HeldDelta || previous.Actor != entry.Actor || previous.Note != entry.Note {
			return wallet, core.ErrIdempotency
		}
		return wallet, nil
	} else if !errors.Is(e, core.ErrNotFound) {
		return wallet, e
	}
	available, held := wallet.Available+entry.AvailableDelta, wallet.Held+entry.HeldDelta
	if available < 0 {
		return wallet, core.ErrInsufficient
	}
	if held < 0 || available+held > core.MaxBalance {
		return wallet, fmt.Errorf("积分账户超出允许范围")
	}
	wallet.Available = available
	wallet.Held = held
	r.Data = core.Data(wallet)
	if _, err = tx.Put("wallets", r, r.Version); err != nil {
		return wallet, err
	}
	entry.AvailableAfter = available
	entry.HeldAfter = held
	_, err = tx.Put("wallet_ledger", core.Record{ID: id, Owner: entry.UserID, Data: core.Data(entry)}, 0)
	return wallet, err
}
