package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"doubo/server/internal/core"
	"doubo/server/internal/partners"
)

// managedPartner is the provider a mini-program user runs (by scan or bind
// code). Only one the user created by scanning has its login managed here.
func (a *Server) managedPartner(w http.ResponseWriter, r *http.Request) (string, core.Partner, bool, bool) {
	ctx, user := r.Context(), identity(r).ID
	id, e := a.Partners.OwnedPartner(ctx, user)
	if errors.Is(e, core.ErrNotFound) {
		fail(w, 403, "你还不是服务商")
		return "", core.Partner{}, false, false
	}
	var p core.Partner
	if e == nil {
		var row core.Record
		if row, e = a.Store.Get(ctx, "partners", id); e == nil {
			e = json.Unmarshal(row.Data, &p)
		}
	}
	if e != nil {
		dbError(w, e)
		return "", core.Partner{}, false, false
	}
	return id, p, p.OwnerUser == user, true
}

// members counts a provider's opened 会员.
func (a *Server) members(ctx context.Context, partner string) (int, error) {
	page, e := a.Store.RecordPage(ctx, core.RecordQuery{Namespace: "memberships", PartnerID: partner, Status: "active", Page: 1, Size: 1})
	return page.Total, e
}

type childView struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Role      string    `json:"role"`
	Status    string    `json:"status"`
	Members   int       `json:"members"`
	Account   string    `json:"account"`
	Scanned   bool      `json:"scanned"` // registered by scanning a code
	CreatedAt time.Time `json:"createdAt"`
}

// children lists the providers directly below id. A provider only ever sees
// downward: nothing about its parent is returned.
func (a *Server) children(ctx context.Context, id string) ([]childView, error) {
	rows, e := a.Store.List(ctx, "partners", id)
	if e != nil {
		return nil, e
	}
	accounts, e := a.Store.List(ctx, "admin_accounts", "")
	if e != nil {
		return nil, e
	}
	logins := map[string]string{}
	for _, row := range accounts {
		var acct core.AdminAccount
		if json.Unmarshal(row.Data, &acct) == nil && acct.PartnerID != "" && !acct.Archived {
			logins[acct.PartnerID] = acct.Username
		}
	}
	out := []childView{}
	for _, row := range rows {
		var p core.Partner
		if json.Unmarshal(row.Data, &p) != nil || p.Status == "rejected" {
			continue
		}
		n, e := a.members(ctx, row.ID)
		if e != nil {
			return nil, e
		}
		out = append(out, childView{ID: row.ID, Name: p.Name, Role: p.Role, Status: p.Status, Members: n, Account: logins[row.ID], Scanned: p.OwnerUser != "", CreatedAt: row.CreatedAt})
	}
	return out, nil
}

func (a *Server) codeView(ctx context.Context, id, kind, actor string) (shareView, error) {
	v, e := a.Partners.Share(ctx, id, kind, actor)
	if e != nil {
		return shareView{}, e
	}
	qr, e := shareQR(v.Code)
	return shareView{Code: v.Code, QR: qr}, e
}

// providerCenter is a provider's view in the mini-program: its codes (a
// 分公司 has 会员, S1 and S2 codes; an S1 has 会员 and S2; an S2 has 会员),
// the providers right below it and its admin login.
func (a *Server) providerCenter(w http.ResponseWriter, r *http.Request) {
	id, p, owner, ok := a.managedPartner(w, r)
	if !ok {
		return
	}
	ctx, actor := r.Context(), "user:"+identity(r).ID
	count, e := a.members(ctx, id)
	if e != nil {
		dbError(w, e)
		return
	}
	out := map[string]any{"name": p.Name, "status": p.Status, "role": p.Role, "members": count, "account": "", "owner": owner}
	codes := map[string]shareView{}
	for name, kind := range partners.ProviderKinds {
		if kind == partners.BindCode || (kind != partners.MemberCode && !partners.CanGrow(p.Role, kind)) {
			continue
		}
		v, e := a.codeView(ctx, id, kind, actor)
		if e != nil {
			partnerError(w, e)
			return
		}
		codes[name] = v
	}
	out["codes"] = codes
	if p.Role != core.RoleS2 {
		if out["children"], e = a.children(ctx, id); e != nil {
			dbError(w, e)
			return
		}
	}
	_, account, found, e := a.providerAccount(ctx, id)
	if e != nil {
		dbError(w, e)
		return
	}
	if found {
		out["account"] = account.Username
		// The saved password is shown only while it is still the account's
		// password; a change in the admin hides it until the next reset.
		if password, ok := a.savedPassword(r, id, account); owner && ok {
			out["password"] = password
		} else if owner {
			out["passwordChanged"] = true
		}
	}
	reply(w, 200, out)
}
