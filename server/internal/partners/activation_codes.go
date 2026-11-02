package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"strings"
	"time"
)

func (s *Service) Issue(ctx context.Context, partner, label string, days int, key, actor string, account ...string) (core.Record, error) {
	label = strings.TrimSpace(label)
	if days < 1 || days > 30 || len([]rune(label)) > 80 {
		return core.Record{}, rulef("激活码有效期为 1–30 天，备注最多 80 字")
	}
	return s.command(ctx, actor, key, []any{"issue_code", partner, label, days}, func(tx store.Transaction, id string) (core.Record, error) {
		if e := activeChain(tx, partner); e != nil {
			return core.Record{}, e
		}
		_, provider, e := node(tx, partner)
		if e != nil {
			return core.Record{}, e
		}
		qr, q, e := quota(tx, partner)
		if e != nil {
			return qr, e
		}
		if e = ensure(&q.Users, partner == core.RootPartner, 1); e != nil {
			return qr, e
		}
		q.Users.Reserved++
		if _, e = put(tx, "partner_quotas", qr, q); e != nil {
			return qr, e
		}
		code, e := codeFor(tx, id)
		if e != nil {
			return qr, e
		}
		expiry := time.Now().UTC().Add(time.Duration(days) * 24 * time.Hour)
		v := core.ActivationCode{IssueID: id, PartnerID: partner, Label: label, Suffix: code[len(code)-4:], Status: "pending", ExpiresAt: expiry, ExpiresUnix: expiry.Unix(), Actor: actor}
		if len(account) > 0 && account[0] != "" {
			v.CreatorAccount = account[0]
		}
		v.PartnerName = provider.Name
		row, e := tx.Put("activation_codes", core.Record{ID: core.Digest(code), Owner: partner, Data: core.Data(v)}, 0)
		if e != nil {
			return row, e
		}
		return row, audit(tx, partner, "issue_code", actor, "生成授权码", map[string]string{"codeId": row.ID, "creatorAccount": v.CreatorAccount, "partnerId": partner, "suffix": v.Suffix})
	})
}
func (s *Service) Reveal(ctx context.Context, id string) (string, error) {
	r := reader{ctx, s.Store}
	_, v, e := get[core.ActivationCode](r, "activation_codes", id)
	if e != nil {
		return "", e
	}
	if v.Status != "pending" || !v.ExpiresAt.After(time.Now()) {
		return "", rulef("该激活码已使用、撤销或过期")
	}
	if e = activeChain(r, v.PartnerID); e != nil {
		return "", e
	}
	code, e := codeFor(r, v.IssueID)
	if e != nil {
		return "", e
	}
	if core.Digest(code) != id {
		return "", rulef("激活码校验失败")
	}
	return code, nil
}
func cancelCode(tx store.Transaction, row core.Record, v core.ActivationCode, status, actor string) error {
	if v.Status != "pending" {
		return nil
	}
	qr, q, e := quota(tx, v.PartnerID)
	if e != nil {
		return e
	}
	if q.Users.Reserved <= 0 {
		return rulef("激活名额记录异常")
	}
	q.Users.Reserved--
	if _, e = put(tx, "partner_quotas", qr, q); e != nil {
		return e
	}
	v.Status = status
	if _, e = put(tx, "activation_codes", row, v); e != nil {
		return e
	}
	return audit(tx, v.PartnerID, status+"_code", actor, "释放未激活名额", map[string]string{"codeId": row.ID})
}
func (s *Service) Cancel(ctx context.Context, id, actor string) error {
	return s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := Lock(tx); e != nil {
			return e
		}
		row, v, e := get[core.ActivationCode](tx, "activation_codes", id)
		if e != nil {
			return e
		}
		if v.Status == "used" {
			return rulef("已使用的码不能撤销，请在用户授权中停用或解绑")
		}
		return cancelCode(tx, row, v, "revoked", actor)
	})
}
func normalizeCode(value string) string {
	value = strings.TrimPrefix(strings.ToUpper(strings.TrimSpace(value)), "DOUBO-ACTIVATE:")
	return strings.NewReplacer("-", "", " ", "", "\n", "", "\r", "").Replace(value)
}
