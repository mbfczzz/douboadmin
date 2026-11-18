package api

import (
	"doubo/server/internal/core"
	"doubo/server/internal/provider"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestManagedFailureFieldsReachUserJobWithoutOperatorDetails(t *testing.T) {
	a, _, _ := setup(t)
	job := core.Job{ID: "managed-error-job", UserID: "user-a", Status: "failed", Error: "内容未通过安全审核，请调整提示词或参考素材。", Input: core.JobInput{Kind: "image", Model: "demo-image", Assets: []string{}}, CreatedAt: time.Now()}
	execution := provider.Execution{Phase: "failed", Error: job.Error, ErrorCause: "private operator detail", ErrorCode: 5002, ErrorType: "safety_policy", ErrorAction: "调整提示词或参考素材，不要原样重试。", UpstreamCode: "vendor-private", UpstreamType: "private", ErrorRetryable: false, ErrorEditable: true}
	if _, err := a.Store.Put(t.Context(), "executions", core.Record{ID: job.ID, Data: core.Data(execution)}, 0); err != nil {
		t.Fatal(err)
	}
	a.presentJob(t.Context(), &job)
	if job.ErrorCode != 5002 || job.ErrorType != "safety_policy" || !strings.Contains(job.ErrorAction, "不要原样重试") || job.Retryable || !job.ErrorEditable {
		t.Fatal(job)
	}
	public := string(core.Data(job))
	for _, secret := range []string{"private operator detail", "vendor-private", "upstreamCode", "upstreamType"} {
		if strings.Contains(public, secret) {
			t.Fatal("operator detail leaked", public)
		}
	}
}

func TestModelErrorHintOverridesMessageButKeepsManagedCodeAndAction(t *testing.T) {
	a, _, _ := setup(t)
	row, _ := a.Store.Get(t.Context(), "models", "demo-image")
	var model core.Model
	if json.Unmarshal(row.Data, &model) != nil {
		t.Fatal("model")
	}
	model.Settings.ErrorHints = []core.ErrorHint{{Contains: "safety_policy", Message: "请删除敏感内容后重新描述"}}
	row.Data = core.Data(model)
	_, _ = a.Store.Put(t.Context(), "models", row, row.Version)
	job := core.Job{ID: "custom-error", UserID: "user-a", Status: "failed", Error: "fallback", Input: core.JobInput{Kind: "image", Model: "demo-image", Assets: []string{}}}
	execution := provider.Execution{Phase: "failed", Error: "服务提示", ErrorCause: "managed code=5002 type=safety_policy", ErrorCode: 5002, ErrorType: "safety_policy", ErrorAction: "调整提示词或参考素材，不要原样重试。"}
	_, _ = a.Store.Put(t.Context(), "executions", core.Record{ID: job.ID, Data: core.Data(execution)}, 0)
	a.presentJob(t.Context(), &job)
	if job.Error != "请删除敏感内容后重新描述" || job.ErrorCode != 5002 || job.ErrorAction == "" {
		t.Fatal(job)
	}
}

func TestInvalidInputGuidanceDistinguishesMissingRoute(t *testing.T) {
	a, _, _ := setup(t)
	for _, tc := range []struct{ id, cause, want string }{
		{"route", "no provider route supports the requested parameters/input for model=private-key", "更换模型"},
		{"other", "invalid image input", "调整输入"},
	} {
		j := core.Job{ID: tc.id, Status: "failed", Input: core.JobInput{Kind: "video"}}
		e := provider.Execution{Phase: "failed", ErrorCode: 5003, ErrorAction: "调整输入", ErrorCause: tc.cause}
		if _, err := a.Store.Put(t.Context(), "executions", core.Record{ID: j.ID, Data: core.Data(e)}, 0); err != nil {
			t.Fatal(err)
		}
		a.presentJob(t.Context(), &j)
		if !strings.Contains(j.ErrorAction, tc.want) || strings.Contains(string(core.Data(j)), tc.cause) {
			t.Fatal(j)
		}
	}
}

func TestManagedFailureControlsRetryAndEditActions(t *testing.T) {
	a, _, _ := setup(t)
	for _, tc := range []struct {
		code        int
		retry, edit bool
	}{{5006, true, true}, {5010, false, false}, {9999, false, false}} {
		job := core.Job{ID: fmt.Sprintf("managed-action-%d", tc.code), UserID: "user-a", Status: "failed", Error: "安全提示", Input: core.JobInput{Kind: "image", Model: "demo-image", Assets: []string{}}}
		execution := provider.Execution{Phase: "failed", Error: job.Error, ErrorCause: "operator-only", ErrorCode: tc.code, ErrorRetryable: tc.retry, ErrorEditable: tc.edit}
		_, _ = a.Store.Put(t.Context(), "executions", core.Record{ID: job.ID, Data: core.Data(execution)}, 0)
		a.presentJob(t.Context(), &job)
		if job.Retryable != tc.retry || job.ErrorEditable != tc.edit || job.ErrorCode != tc.code {
			t.Fatal(tc, job)
		}
		if strings.Contains(string(core.Data(job)), "operator-only") {
			t.Fatal("operator cause leaked")
		}
	}
}
