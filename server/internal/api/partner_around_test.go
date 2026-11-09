package api

import (
	"encoding/json"
	"testing"
)

func TestQuotaMovesAroundOneProvider(t *testing.T) {
	a, _, _ := setup(t)
	admin := adminLoginToken(t, a, "admin", "test-pass")
	s1 := createProvider(t, a, admin, "around-s1", "root", "S1", 10, map[string]string{"username": "around-s1", "password": "around-s1-password-2026"})
	s2 := createProvider(t, a, admin, "around-s2", s1, "S2", 3, nil)
	createProvider(t, a, admin, "around-s3", s2, "S3", 1, nil)
	other := createProvider(t, a, admin, "around-other", "root", "Other", 5, nil)
	createProvider(t, a, admin, "around-other-child", other, "OtherChild", 2, nil)
	moves := func(token, around string) (int, []string) {
		w := call(a, "GET", "/api/admin/quota-moves?around="+around, token, "", nil)
		var page struct {
			Items []struct {
				Data struct {
					ParentID string `json:"parentId"`
					ChildID  string `json:"childId"`
				} `json:"data"`
			} `json:"items"`
		}
		_ = json.Unmarshal(w.Body.Bytes(), &page)
		pairs := []string{}
		for _, item := range page.Items {
			pairs = append(pairs, item.Data.ParentID+">"+item.Data.ChildID)
		}
		return w.Code, pairs
	}
	// S2's view: the grant it received from S1 and the one it gave to S3.
	code, pairs := moves(admin, s2)
	if code != 200 || len(pairs) != 2 {
		t.Fatal("moves around S2", code, pairs)
	}
	for _, p := range pairs {
		if p != s1+">"+s2 && p[:len(s2)] != s2 {
			t.Fatal("unrelated move listed", p)
		}
	}
	provider := adminLoginToken(t, a, "around-s1", "around-s1-password-2026")
	if code, _ = moves(provider, other); code != 403 {
		t.Fatal("provider looked around another subtree", code)
	}
	if code, pairs = moves(provider, s1); code != 200 || len(pairs) != 1 {
		t.Fatal("provider's own moves", code, pairs)
	}
}
