package partners

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
)

// Join registers a user through a scanned code: as a 会员 (member or promo
// code), as an S1/S2 provider (invites) or as the owner of an admin-made
// provider (bind code). Every registration waits for the platform.
func (s *Service) Join(ctx context.Context, user, input, method string) (out core.Access, err error) {
	if method != "scan" && method != "code" {
		return out, rulef("加入方式无效")
	}
	code, ok := NormalizeShareCode(input)
	if !ok {
		return out, rulef("分享码格式不正确")
	}
	err = s.Store.Atomic(ctx, func(tx store.Transaction) error {
		if _, _, e := store.LockWallet(tx, user); e != nil {
			return e
		}
		if e := Lock(tx); e != nil {
			return e
		}
		profile, e := enabledProfile(tx, user)
		if e != nil {
			return e
		}
		codeRow, sc, e := get[core.ShareCode](tx, "share_codes", code)
		if errors.Is(e, core.ErrNotFound) || (e == nil && sc.Status != "active") {
			return rulef("二维码无效、已使用或已重置，请向服务商获取最新的二维码")
		}
		if e != nil {
			return e
		}
		// One standing account: a new registration only after none, a
		// rejection or an unbinding.
		if current, e := access(tx, user); e != nil {
			return e
		} else if current.Active || current.Status == "review" || current.Status == "disabled" || current.Status == "provider_disabled" {
			if current.Status == "review" {
				return rulef(reviewMessage)
			}
			return rulef("账号已开通，不能重复登记")
		}
		reg := core.Registration{CodeKind: sc.Kind, Code: code, Method: method, Name: profile.Name, Phone: profile.Phone, Status: "pending", RegisteredAt: nowUTC()}
		switch sc.Kind {
		case MemberCode, PromoCode:
			e = registerMember(tx, user, sc, &reg)
		case S1Code, S2Code:
			e = registerProvider(tx, user, sc, &reg)
		case BindCode:
			e = registerBind(tx, user, codeRow, sc, &reg)
		default:
			e = rulef("二维码类型无效")
		}
		if e != nil {
			return e
		}
		if e = saveRegistration(tx, user, reg); e != nil {
			return e
		}
		out, e = access(tx, user)
		return e
	})
	return
}

// registerMember: a member code joins its provider; a promo code joins the
// promoting member's provider with that member as referrer.
func registerMember(tx store.Transaction, user string, sc core.ShareCode, reg *core.Registration) error {
	partner := sc.PartnerID
	if sc.Kind == PromoCode {
		_, referrer, e := get[core.Membership](tx, "memberships", sc.User)
		if e != nil || referrer.Status != "active" || sc.User == user {
			return rulef("推广码已失效，请联系推广人")
		}
		partner, reg.Referrer = referrer.PartnerID, sc.User
	}
	// Old platform-level codes no longer register anyone.
	if e := canHold(tx, partner, MemberCode); e != nil {
		return e
	}
	if e := activeChain(tx, partner); e != nil {
		return e
	}
	row, _, e := get[core.Membership](tx, "memberships", user)
	if errors.Is(e, core.ErrNotFound) {
		row, e = core.Record{ID: user, Owner: user}, nil
	}
	if e != nil {
		return e
	}
	now := nowUTC()
	m := core.Membership{PartnerID: partner, Status: "pending", CodeID: reg.Code, Method: reg.Method, Referrer: reg.Referrer, ActivatedAt: now, ChangedAt: now}
	if _, e = put(tx, "memberships", row, m); e != nil {
		return e
	}
	reg.Role, reg.PartnerID = "member", partner
	return nil
}

// registerProvider creates the scanner's provider below the code's owner,
// pending until the platform approves.
func registerProvider(tx store.Transaction, user string, sc core.ShareCode, reg *core.Registration) error {
	if reg.Name == "" {
		return rulef("请先完成注册并填写姓名")
	}
	name := []rune(reg.Name)
	if len(name) > 60 {
		name = name[:60]
	}
	id := core.NewID()
	n := core.Partner{Name: string(name), Role: sc.Kind, Status: "pending", OwnerUser: user}
	if _, e := createChild(tx, id, sc.PartnerID, n, "user:"+user); e != nil {
		return e
	}
	if e := setOwner(tx, user, id, "pending"); e != nil {
		return e
	}
	reg.Role, reg.PartnerID, reg.ParentID = sc.Kind, id, sc.PartnerID
	return nil
}

// registerBind reserves an admin-made provider for the scanner; the bind
// code works once.
func registerBind(tx store.Transaction, user string, codeRow core.Record, sc core.ShareCode, reg *core.Registration) error {
	if e := canHold(tx, sc.PartnerID, BindCode); e != nil {
		return e
	}
	pointer, v, e := get[core.PartnerShare](tx, pointers[BindCode], sc.PartnerID)
	if e != nil {
		return e
	}
	if v.User != "" {
		return rulef("该服务商已绑定其他账号")
	}
	if v.Code != codeRow.ID {
		return rulef("绑定码已重置，请向平台获取新的绑定码")
	}
	v.User = user
	if _, e = put(tx, pointers[BindCode], pointer, v); e != nil {
		return e
	}
	sc.Status = "used"
	if _, e = put(tx, "share_codes", codeRow, sc); e != nil {
		return e
	}
	if e = setOwner(tx, user, sc.PartnerID, "pending"); e != nil {
		return e
	}
	_, p, e := node(tx, sc.PartnerID)
	reg.Role, reg.PartnerID = p.Role, sc.PartnerID
	return e
}

func saveRegistration(tx store.Transaction, user string, reg core.Registration) error {
	row, _, e := get[core.Registration](tx, "registrations", user)
	if errors.Is(e, core.ErrNotFound) {
		row, e = core.Record{ID: user, Owner: user}, nil
	}
	if e != nil {
		return e
	}
	if _, e = put(tx, "registrations", row, reg); e != nil {
		return e
	}
	return audit(tx, user, "register", "user:"+user, "扫码登记", reg)
}
