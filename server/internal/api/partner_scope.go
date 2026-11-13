package api

import (
	"doubo/server/internal/core"
	"encoding/json"
	"net/http"
	"slices"
)

// partnerScope returns the provider ids visible to a provider account (its own
// node and all descendants). Platform accounts get nil, meaning unrestricted.
func (a *Server) partnerScope(r *http.Request) ([]string, error) {
	root := identity(r).PartnerID
	if identity(r).AdminRole == core.SuperAdminRole {
		return nil, nil
	}
	if root == "" {
		return []string{}, nil
	}
	return a.Partners.Subtree(r.Context(), root)
}

// inPartnerScope rejects ids outside the caller's subtree.
func (a *Server) inPartnerScope(w http.ResponseWriter, r *http.Request, id string) bool {
	scope, err := a.partnerScope(r)
	if err != nil {
		dbError(w, err)
		return false
	}
	if scope != nil && !slices.Contains(scope, id) {
		fail(w, 403, "只能操作本服务商及其下级")
		return false
	}
	return true
}

// belowPartner accepts strict descendants only: a provider never edits itself.
func (a *Server) belowPartner(w http.ResponseWriter, r *http.Request, id string) bool {
	if self := identity(r).PartnerID; self != "" && id == self {
		fail(w, 403, "本服务商资料由超级管理员维护")
		return false
	}
	return a.inPartnerScope(w, r, id)
}

// platformOnly keeps platform-wide decisions away from provider accounts.
func platformOnly(w http.ResponseWriter, r *http.Request) bool {
	if identity(r).PartnerID != "" {
		fail(w, 403, "该操作仅限平台管理员")
		return false
	}
	return true
}

// ownerInScope checks a stored record whose owner is the provider id.
func (a *Server) ownerInScope(w http.ResponseWriter, r *http.Request, ns, id string) bool {
	if identity(r).AdminRole == core.SuperAdminRole {
		return true
	}
	row, err := a.Store.Get(r.Context(), ns, id)
	if err != nil {
		dbError(w, err)
		return false
	}
	return a.inPartnerScope(w, r, row.Owner)
}

// dataPartnerInScope checks a stored record carrying data.partnerId.
func (a *Server) dataPartnerInScope(w http.ResponseWriter, r *http.Request, ns, id string) bool {
	if identity(r).AdminRole == core.SuperAdminRole {
		return true
	}
	row, err := a.Store.Get(r.Context(), ns, id)
	if err != nil {
		dbError(w, err)
		return false
	}
	var v struct {
		PartnerID string `json:"partnerId"`
	}
	if jsonDecodeRecord(row, &v) != nil {
		fail(w, 500, "记录数据异常")
		return false
	}
	return a.inPartnerScope(w, r, v.PartnerID)
}

func jsonDecodeRecord(row core.Record, v any) error { return json.Unmarshal(row.Data, v) }

// withinOwnPricing keeps a provider from granting a descendant more than it
// holds itself: retail price and downstream margin may not be raised above its
// own. Values left unchanged (for example set earlier by the platform) stay.
func (a *Server) withinOwnPricing(w http.ResponseWriter, r *http.Request, id string, next core.Partner) bool {
	self := identity(r).PartnerID
	if self == "" {
		return true
	}
	var own, current core.Partner
	for _, item := range []struct {
		id string
		v  *core.Partner
	}{{self, &own}, {id, &current}} {
		row, err := a.Store.Get(r.Context(), "partners", item.id)
		if err != nil {
			dbError(w, err)
			return false
		}
		if json.Unmarshal(row.Data, item.v) != nil {
			fail(w, 500, "服务商数据异常")
			return false
		}
	}
	raised := func(next, current, own int64) bool { return next > current && next > own }
	if raised(next.RetailPer100Fen, current.RetailPer100Fen, own.RetailPer100Fen) || raised(next.ChildMarginBps, current.ChildMarginBps, own.ChildMarginBps) {
		fail(w, 400, "下级的售价和向下比例不能高于本服务商")
		return false
	}
	return true
}
