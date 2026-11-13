package api

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestAdminAccountsAreDatabaseBackedAndManageable(t *testing.T) {
	a, _, _ := setup(t)
	login := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "admin", "password": "Tt661ea2"})
	if login.Code != 200 {
		t.Fatal(login.Body.String())
	}
	admin := login.Result().Cookies()[0].Value
	created := call(a, "POST", "/api/admin/accounts", admin, "", map[string]any{
		"username": "operator", "password": "Ttd7070a", "name": "运营人员", "phone": "13800138000", "role": "operator",
	})
	if created.Code != 201 || strings.Contains(created.Body.String(), "passwordHash") {
		t.Fatal(created.Code, created.Body.String())
	}
	var row struct {
		ID      string `json:"id"`
		Version int64  `json:"version"`
		Data    struct {
			UserID string `json:"userId"`
		} `json:"data"`
	}
	if json.Unmarshal(created.Body.Bytes(), &row) != nil {
		t.Fatal("invalid account response")
	}
	if row.Data.UserID == "" {
		t.Fatal("phone did not link a unified user")
	}
	operator := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "operator", "password": "Ttd7070a"})
	if operator.Code != 200 {
		t.Fatal(operator.Body.String())
	}
	operatorToken := operator.Result().Cookies()[0].Value
	if w := call(a, "GET", "/api/admin/accounts", operatorToken, "", nil); w.Code != 403 {
		t.Fatal("operator account visibility incorrect", w.Code, w.Body.String())
	}
	list := call(a, "GET", "/api/admin/accounts", admin, "", nil)
	var listed struct {
		Items []struct {
			ID      string `json:"id"`
			Version int64  `json:"version"`
		} `json:"items"`
	}
	if json.Unmarshal(list.Body.Bytes(), &listed) != nil {
		t.Fatal(list.Body.String())
	}
	for _, current := range listed.Items {
		if current.ID == row.ID {
			row.Version = current.Version
		}
	}
	updated := call(a, "PUT", "/api/admin/accounts/"+row.ID, admin, "", map[string]any{
		"version": row.Version, "name": "运营负责人", "phone": "13800138000", "role": "operator", "disabled": true,
	})
	if updated.Code != 200 {
		t.Fatal(updated.Body.String())
	}
	if w := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "operator", "password": "Ttd7070a"}); w.Code != 401 {
		t.Fatal("disabled account logged in", w.Code)
	}
}

func TestAdminAccountPasswordPolicy(t *testing.T) {
	a, _, _ := setup(t)
	login := call(a, "POST", "/api/admin/login", "", "", map[string]string{"username": "admin", "password": "Tt661ea2"})
	admin := login.Result().Cookies()[0].Value
	w := call(a, "POST", "/api/admin/accounts", admin, "", map[string]any{
		"username": "short", "password": "too-short", "name": "短密码", "role": "operator",
	})
	if w.Code != 400 || !strings.Contains(w.Body.String(), "8") {
		t.Fatal(w.Code, w.Body.String())
	}
}
