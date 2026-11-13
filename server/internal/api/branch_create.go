package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"encoding/json"
	"golang.org/x/crypto/bcrypt"
	"net/http"
	"strings"
	"time"
)

type branchPhone struct {
	PartnerID string `json:"partnerId"`
	AccountID string `json:"accountId"`
	UserID    string `json:"userId"`
}

func (a *Server) createPartner(w http.ResponseWriter, r *http.Request) {
	var v struct {
		Name     string                `json:"name"`
		Phone    string                `json:"phone"`
		ParentID string                `json:"parentId"`
		Role     string                `json:"role"`
		Account  *providerAccountInput `json:"account"`
	}
	if !decode(w, r, &v) || !platformOnly(w, r) {
		return
	}
	if v.ParentID != core.RootPartner || v.Role != core.RoleBranch {
		fail(w, 400, "下级服务商只能通过扫码登记新增")
		return
	}
	v.Phone = strings.TrimSpace(v.Phone)
	if !mainlandPhone.MatchString(v.Phone) {
		fail(w, 400, "请填写分公司负责人的11位手机号")
		return
	}
	hash := ""
	if v.Account != nil {
		if core.IsBusinessRole(v.Account.Role) && v.Account.Role != v.Role {
			fail(w, 400, "角色与当前服务商层级不匹配")
			return
		}
		// Validate without querying username first: the atomic command handles replay.
		if !adminUsername.MatchString(strings.TrimSpace(v.Account.Username)) {
			fail(w, 400, "登录账号格式无效")
			return
		}
		if v.Account.Role == "" {
			v.Account.Role = core.RoleBranch
		}
		if !a.roleInScope(r, v.Account.Role, core.RoleScopePartner) {
			fail(w, 400, "请选择服务商角色")
			return
		}
		var e error
		hash, e = hashPassword(v.Account.Password)
		if e != nil {
			fail(w, 400, e.Error())
			return
		}
	}
	actor := identity(r).ID
	fingerprint := core.Digest(string(core.Data(v.Account)))
	row, e := a.Partners.CreateConfiguredBranch(r.Context(), v.Name, v.Phone, r.Header.Get("Idempotency-Key"), actor, fingerprint, lockIdentity, func(tx store.Transaction, row core.Record) error {
		mapping, e := tx.Lock("branch_phones", core.Record{ID: v.Phone, Data: core.Data(branchPhone{})})
		if e != nil {
			return e
		}
		var existing branchPhone
		if e = json.Unmarshal(mapping.Data, &existing); e != nil {
			return e
		}
		if existing.PartnerID != "" {
			return errBranchPhoneTaken
		}
		existing.PartnerID = row.ID
		if v.Account != nil {
			account := core.AdminAccount{Username: strings.TrimSpace(v.Account.Username), Name: strings.TrimSpace(v.Name), Phone: v.Phone, PartnerID: row.ID, Role: v.Account.Role, PasswordHash: hash, PasswordChangedAt: time.Now().UTC(), CreatedBy: actor}
			existing.AccountID = adminID(account.Username)
			if _, e = tx.Put("admin_accounts", core.Record{ID: existing.AccountID, Data: core.Data(account)}, 0); e != nil {
				return e
			}
		}
		mapping.Data = core.Data(existing)
		_, e = tx.Put("branch_phones", mapping, mapping.Version)
		return e
	})
	if e != nil {
		partnerError(w, e)
		return
	}
	// Compatibility: the existing super-admin credential view stores a sealed copy.
	if v.Account != nil {
		if _, account, found, err := a.providerAccount(r.Context(), row.ID); err == nil && found && bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(v.Account.Password)) == nil {
			a.saveAdminPassword(r.Context(), row.ID, v.Account.Password, account.PasswordChangedAt)
		}
	}
	reply(w, 200, row)
}
