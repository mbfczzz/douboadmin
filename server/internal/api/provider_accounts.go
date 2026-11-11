package api

import (
	"context"
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
)

// providerAccountInput is the login account entered with a new provider.
type providerAccountInput struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

func (a *Server) roleInScope(r *http.Request, id, scope string) bool {
	role, ok, err := a.adminRole(r.Context(), id)
	return err == nil && ok && role.Scope == scope
}
func (a *Server) platformRole(r *http.Request, id string) bool {
	return a.roleInScope(r, id, core.RoleScopePlatform)
}

// prepareProviderAccount validates a new provider login before the provider exists.
func (a *Server) prepareProviderAccount(r *http.Request, in providerAccountInput) (string, error) {
	in.Username = strings.TrimSpace(in.Username)
	if in.Role == "" {
		in.Role = "partner"
	}
	if !adminUsername.MatchString(in.Username) {
		return "", errors.New("登录账号需为 3–32 位字母、数字、点、横线或下划线")
	}
	if !a.roleInScope(r, in.Role, core.RoleScopePartner) {
		return "", errors.New("请选择服务商类型的角色")
	}
	if _, err := a.Store.Get(r.Context(), "admin_accounts", adminID(in.Username)); err == nil {
		return "", errors.New("登录账号已被使用")
	} else if !errors.Is(err, core.ErrNotFound) {
		return "", err
	}
	return hashPassword(in.Password)
}

func (a *Server) createProviderAccount(ctx context.Context, partnerID, name, hash string, in providerAccountInput, actor string) (core.Record, error) {
	row, err := a.Store.Get(ctx, "partners", partnerID)
	if err != nil {
		return core.Record{}, err
	}
	var p core.Partner
	if err = json.Unmarshal(row.Data, &p); err != nil {
		return core.Record{}, err
	}
	if in.Role == "" {
		in.Role = p.Role
	}
	if core.IsBusinessRole(in.Role) && in.Role != p.Role {
		return core.Record{}, errors.New("角色与当前服务商层级不匹配")
	}
	account := core.AdminAccount{Username: strings.TrimSpace(in.Username), Name: name, Role: in.Role, PartnerID: partnerID, PasswordHash: hash, PasswordChangedAt: time.Now().UTC(), CreatedBy: actor}
	row, err = a.Store.Put(ctx, "admin_accounts", core.Record{ID: adminID(account.Username), Data: core.Data(account)}, 0)
	if err == nil && in.Password != "" {
		a.saveAdminPassword(ctx, partnerID, in.Password, account.PasswordChangedAt)
	}
	return row, err
}

func (a *Server) providerAccount(ctx context.Context, partnerID string) (core.Record, core.AdminAccount, bool, error) {
	page, err := a.Store.RecordPage(ctx, core.RecordQuery{Namespace: "admin_accounts", PartnerID: partnerID, Fields: map[string]string{"archived": "false"}, Page: 1, Size: 1})
	if err != nil {
		return core.Record{}, core.AdminAccount{}, false, err
	}
	for _, row := range page.Items {
		var account core.AdminAccount
		if json.Unmarshal(row.Data, &account) == nil && account.PartnerID == partnerID && !account.Archived {
			return row, account, true, nil
		}
	}
	return core.Record{}, core.AdminAccount{}, false, nil
}

func (a *Server) getProviderAccount(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !a.inPartnerScope(w, r, id) {
		return
	}
	row, account, ok, err := a.providerAccount(r.Context(), id)
	if err != nil {
		dbError(w, err)
		return
	}
	if !ok {
		reply(w, 200, map[string]any{"account": nil})
		return
	}
	out := map[string]any{"account": a.adminView(r.Context(), row)}
	if password, ok := a.adminPassword(r.Context(), id, account); ok {
		out["password"] = password
	}
	reply(w, 200, out)
}

// saveProviderAccount creates the login for an existing provider or changes
// its role, status and (optionally) password.
func (a *Server) saveProviderAccount(w http.ResponseWriter, r *http.Request) {
	var in struct {
		providerAccountInput
		Version  int64 `json:"version"`
		Disabled bool  `json:"disabled"`
	}
	id := r.PathValue("id")
	if !decode(w, r, &in) || !a.belowPartner(w, r, id) {
		return
	}
	partner, err := a.Store.Get(r.Context(), "partners", id)
	if err != nil {
		dbError(w, err)
		return
	}
	var p core.Partner
	_ = json.Unmarshal(partner.Data, &p)
	if core.IsBusinessRole(in.Role) && in.Role != p.Role {
		fail(w, 400, "角色与当前服务商层级不匹配，请保留对应角色或选择自定义权限角色")
		return
	}
	row, account, ok, err := a.providerAccount(r.Context(), id)
	if err != nil {
		dbError(w, err)
		return
	}
	if !ok {
		hash, e := a.prepareProviderAccount(r, in.providerAccountInput)
		if e != nil {
			fail(w, 400, e.Error())
			return
		}
		created, e := a.createProviderAccount(r.Context(), id, p.Name, hash, in.providerAccountInput, identity(r).ID)
		if e != nil {
			dbError(w, e)
			return
		}
		reply(w, 201, map[string]any{"account": a.adminView(r.Context(), created)})
		return
	}
	if in.Role == "" {
		in.Role = account.Role
	}
	if !a.roleInScope(r, in.Role, core.RoleScopePartner) {
		fail(w, 400, "请选择服务商类型的角色")
		return
	}
	account.Role, account.Disabled = in.Role, in.Disabled
	if in.Password != "" {
		hash, e := hashPassword(in.Password)
		if e != nil {
			fail(w, 400, e.Error())
			return
		}
		account.PasswordHash, account.PasswordChangedAt = hash, time.Now().UTC()
	}
	row.Data = core.Data(account)
	saved, err := a.Store.Put(r.Context(), "admin_accounts", row, in.Version)
	if err != nil {
		dbError(w, err)
		return
	}
	if in.Password != "" {
		a.saveAdminPassword(r.Context(), id, in.Password, account.PasswordChangedAt)
	}
	reply(w, 200, map[string]any{"account": a.adminView(r.Context(), saved)})
}

// platformAccountOnly keeps provider logins out of the 管理账号 endpoints.
func (a *Server) platformAccountOnly(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		row, err := a.Store.Get(r.Context(), "admin_accounts", r.PathValue("id"))
		if err != nil {
			dbError(w, err)
			return
		}
		var account core.AdminAccount
		if json.Unmarshal(row.Data, &account) == nil && account.PartnerID != "" {
			fail(w, 400, "服务商账号请在服务商管理中维护")
			return
		}
		h(w, r)
	}
}
