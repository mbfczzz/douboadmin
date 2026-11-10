package partners

import (
	"context"
	"crypto/rand"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
	"strings"
)

// Unambiguous characters only; 8 of them keep a code easy to type.
const shareAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

// SharePrefix marks the content of every join QR code.
const SharePrefix = "DOUBO-SHARE:"

// Code kinds. Scanning one registers the user in that role, pending the
// platform's approval: a 会员 (member code or a member's promo code), an S1
// or S2 provider (invites), or the owner of an admin-made provider (bind).
const (
	MemberCode = ""
	S1Code     = core.RoleS1
	S2Code     = core.RoleS2
	BindCode   = "bind"
	PromoCode  = "promo"
)

var pointers = map[string]string{MemberCode: "partner_share_codes", S1Code: "partner_s1_codes", S2Code: "partner_s2_codes", BindCode: "partner_bind_codes", PromoCode: "user_promo_codes"}

// ProviderKinds are the codes a provider can hold, keyed by API name.
var ProviderKinds = map[string]string{"member": MemberCode, "s1": S1Code, "s2": S2Code, "bind": BindCode}

func newShareCode() (string, error) {
	b := make([]byte, 8)
	if _, e := rand.Read(b); e != nil {
		return "", e
	}
	for i := range b {
		b[i] = shareAlphabet[int(b[i])%len(shareAlphabet)]
	}
	return string(b), nil
}

// NormalizeShareCode accepts scanned QR content or a typed code with spaces,
// dashes or lower case.
func NormalizeShareCode(value string) (string, bool) {
	value = strings.TrimPrefix(strings.ToUpper(strings.TrimSpace(value)), SharePrefix)
	code := strings.NewReplacer("-", "", " ", "").Replace(value)
	return code, len(code) == 8 && strings.Trim(code, shareAlphabet) == ""
}

// issueShare stores a fresh code for its owner (a provider, or the member of
// a promo code) and points the owner's pointer at it.
func issueShare(tx store.Transaction, owner string, sc core.ShareCode, pointer core.Record, v core.PartnerShare) (core.PartnerShare, error) {
	for range 5 {
		code, e := newShareCode()
		if e != nil {
			return v, e
		}
		sc.Status = "active"
		_, e = tx.Put("share_codes", core.Record{ID: code, Owner: owner, Data: core.Data(sc)}, 0)
		if errors.Is(e, core.ErrConflict) {
			continue
		}
		if e != nil {
			return v, e
		}
		if pointer.ID == "" {
			pointer = core.Record{ID: owner, Owner: owner}
		}
		v.Code = code
		_, e = put(tx, pointers[sc.Kind], pointer, v)
		return v, e
	}
	return v, rulef("分享码生成失败，请重试")
}

// canHold: which codes a provider has. The platform has none; a member code
// for every role; S1 invites for a 分公司, S2 invites for 分公司 and S1;
// bind codes for providers made in the admin.
func canHold(r Reader, partner, kind string) error {
	if partner == core.RootPartner {
		return rulef("平台总账号没有分享码")
	}
	_, p, e := node(r, partner)
	if e != nil {
		return e
	}
	if frozen(p.Status) {
		return rulef("服务商开通后才能发码")
	}
	switch kind {
	case MemberCode:
		return nil
	case S1Code, S2Code:
		if !CanGrow(p.Role, kind) {
			return rulef("该服务商不能发展这一级服务商")
		}
		return nil
	case BindCode:
		if p.OwnerUser != "" {
			return rulef("该服务商由扫码登记的用户本人管理，无需绑定")
		}
		return nil
	}
	return rulef("码类型无效")
}

// shareTx runs fn on the provider's current code of a kind under the lock.
func (s *Service) shareTx(ctx context.Context, partner, kind string, fn func(store.Transaction, core.Record, core.PartnerShare, bool) (core.PartnerShare, error)) (out core.PartnerShare, err error) {
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if e := Lock(tx); e != nil {
			return e
		}
		if e := canHold(tx, partner, kind); e != nil {
			return e
		}
		row, v, e := get[core.PartnerShare](tx, pointers[kind], partner)
		found := e == nil
		if e != nil && !errors.Is(e, core.ErrNotFound) {
			return e
		}
		if !found {
			row = core.Record{}
		}
		out, e = fn(tx, row, v, found)
		return e
	})
	return
}

// Share returns the provider's current code of a kind, creating it on first use.
func (s *Service) Share(ctx context.Context, partner, kind, actor string) (core.PartnerShare, error) {
	return s.shareTx(ctx, partner, kind, func(tx store.Transaction, row core.Record, v core.PartnerShare, found bool) (core.PartnerShare, error) {
		if found {
			return v, nil
		}
		return issueShare(tx, partner, core.ShareCode{PartnerID: partner, Kind: kind, Actor: actor}, row, v)
	})
}

// ShareCode is the provider's member code.
func (s *Service) ShareCode(ctx context.Context, partner, actor string) (string, error) {
	v, e := s.Share(ctx, partner, MemberCode, actor)
	return v.Code, e
}

// ResetShare retires the current code of a kind (printed copies stop working)
// and issues a new one. Whoever already registered is unaffected.
func (s *Service) ResetShare(ctx context.Context, partner, kind, actor string) (core.PartnerShare, error) {
	return s.shareTx(ctx, partner, kind, func(tx store.Transaction, row core.Record, v core.PartnerShare, found bool) (core.PartnerShare, error) {
		if found {
			if e := retireCode(tx, v.Code); e != nil {
				return v, e
			}
		}
		v, e := issueShare(tx, partner, core.ShareCode{PartnerID: partner, Kind: kind, Actor: actor}, row, v)
		if e != nil {
			return v, e
		}
		return v, audit(tx, partner, "reset_share_code", actor, "重置分享码", map[string]string{"partnerId": partner, "kind": kind})
	})
}

func retireCode(tx store.Transaction, code string) error {
	row, sc, e := get[core.ShareCode](tx, "share_codes", code)
	if e != nil || sc.Status != "active" {
		return e
	}
	sc.Status = "reset"
	_, e = put(tx, "share_codes", row, sc)
	return e
}
