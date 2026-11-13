package api

import (
	"encoding/json"
	"fmt"
	"strconv"
	"testing"

	"doubo/server/internal/core"
)

// Branches use the public creation endpoint. Lower tiers are legacy fixture
// records for management tests; production creates them through scan joins.
func createProvider(t *testing.T, a *Server, token, key, parent, name, role string, account map[string]string) string {
	t.Helper()
	if role != core.RoleBranch {
		row, err := a.Partners.Create(t.Context(), parent, name, role, "fixture-"+key, "fixture")
		if err != nil {
			t.Fatal("seed provider", err)
		}
		_, _, found, err := a.providerAccount(t.Context(), row.ID)
		if err != nil {
			t.Fatal(err)
		}
		if account != nil && !found {
			input := map[string]any{"version": 0, "role": "partner"}
			for k, v := range account {
				input[k] = v
			}
			w := call(a, "PUT", "/api/admin/partners/"+row.ID+"/account", token, "", input)
			if w.Code != 201 {
				t.Fatal("seed provider login", w.Code, w.Body.String())
			}
		}
		return row.ID
	}
	number, _ := strconv.ParseUint(core.Digest(key)[:8], 16, 32)
	body := map[string]any{"parentId": parent, "name": name, "role": role, "phone": fmt.Sprintf("139%08d", number%100000000)}
	if account != nil {
		body["account"] = account
	}
	w := call(a, "POST", "/api/admin/partners", token, "provider-test-"+key, body)
	if w.Code != 200 {
		t.Fatal("create provider", name, w.Code, w.Body.String())
	}
	var row struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &row)
	return row.ID
}

// createBranch adds a 分公司 under the platform; S1 and S2 go below it.
func createBranch(t *testing.T, a *Server, token, key string) string {
	t.Helper()
	return createProvider(t, a, token, key+"-branch", core.RootPartner, "分公司", core.RoleBranch, nil)
}

// newBranch adds a 分公司 through the service, without an admin session.
func newBranch(t *testing.T, a *Server, key string) string {
	t.Helper()
	r, e := a.Partners.Create(t.Context(), core.RootPartner, "分公司", core.RoleBranch, "branch-"+key, "admin")
	if e != nil {
		t.Fatal(e)
	}
	return r.ID
}

// scan registers a user through a code; nothing opens until approval.
func scan(t *testing.T, a *Server, user, code string) core.Access {
	t.Helper()
	access, e := a.Partners.Join(t.Context(), user, code, "scan")
	if e != nil || access.Active || access.Status != "review" {
		t.Fatal("scan", user, access, e)
	}
	return access
}

// decide approves or rejects a user's pending registration at its version.
func decide(t *testing.T, a *Server, user string, ok bool, reason string) {
	t.Helper()
	row, e := a.Store.Get(t.Context(), "registrations", user)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = a.Partners.Decide(t.Context(), user, ok, reason, row.Version, "admin"); e != nil {
		t.Fatal(e)
	}
}

func approve(t *testing.T, a *Server, user string) {
	t.Helper()
	decide(t, a, user, true, "")
}

// joinPartner registers a user with a provider's member code and approves it.
func joinPartner(t *testing.T, a *Server, partner, user string) {
	t.Helper()
	code, e := a.Partners.ShareCode(t.Context(), partner, "admin")
	if e != nil {
		t.Fatal(e)
	}
	scan(t, a, user, code)
	approve(t, a, user)
}

// activate makes a user an approved 会员 of a new 分公司 and returns it.
func activate(t *testing.T, a *Server, user string) string {
	t.Helper()
	branch := newBranch(t, a, user)
	joinPartner(t, a, branch, user)
	return branch
}

// providerCode reads (GET) or resets (POST) a provider's code of one kind.
func providerCode(t *testing.T, a *Server, method, partner, kind, token string) shareView {
	t.Helper()
	w := call(a, method, "/api/admin/partners/"+partner+"/codes/"+kind, token, "", nil)
	var out shareView
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &out) != nil || out.Code == "" {
		t.Fatal(method, kind, w.Code, w.Body.String())
	}
	return out
}

// joinHTTP scans a code in the mini-program.
func joinHTTP(a *Server, token, code string) (int, string) {
	w := call(a, "POST", "/api/access/join", token, "", map[string]string{"code": "DOUBO-SHARE:" + code, "method": "scan"})
	return w.Code, w.Body.String()
}

// appUser registers a mini-program user and returns their session token.
func appUser(t *testing.T, a *Server, id, name, phone string) string {
	t.Helper()
	profile := map[string]string{"nickname": id, "name": name, "phone": phone, "verifiedPhone": phone}
	if _, e := a.Store.Put(t.Context(), "users", core.Record{ID: id, Owner: id, Data: core.Data(profile)}, 0); e != nil {
		t.Fatal(e)
	}
	token, e := a.Sessions.Create(t.Context(), id, "user")
	if e != nil {
		t.Fatal(e)
	}
	return token
}

// decideHTTP approves or rejects a registration from the admin.
func decideHTTP(t *testing.T, a *Server, token, user string, ok bool, reason string) (int, string) {
	t.Helper()
	row, e := a.Store.Get(t.Context(), "registrations", user)
	if e != nil {
		t.Fatal(e)
	}
	w := call(a, "PUT", "/api/admin/registrations/"+user, token, "", map[string]any{"approve": ok, "reason": reason, "version": row.Version})
	return w.Code, w.Body.String()
}
