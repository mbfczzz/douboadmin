package api

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"doubo/server/internal/core"
)

func TestGenerationUsesModelPromptLimits(t *testing.T) {
	for _, tc := range []struct {
		kind              string
		configured, limit int
	}{{"image", 0, 2000}, {"video", 0, 20000}, {"image", 4000, 4000}, {"video", 30000, 30000}, {"video", 500, 500}, {"chat", 0, 500}} {
		t.Run(fmt.Sprintf("%s/%d", tc.kind, tc.configured), func(t *testing.T) {
			a, _ := modelServer(t)
			m := core.Model{ID: "prompt-test", Kind: tc.kind, Available: true, Published: true, Durations: []int{5}, Settings: core.ModelSettings{MaxPromptChars: tc.configured}}
			_, err := a.Store.Put(t.Context(), "models", core.Record{ID: m.ID, Data: core.Data(m)}, 0)
			if err != nil {
				t.Fatal(err)
			}
			// Supplementary-plane characters count as one, like other Unicode code points.
			prompt := strings.Repeat("景", tc.limit-1) + "😀"
			input := core.JobInput{Kind: tc.kind, Model: m.ID, Prompt: prompt, Duration: 5}
			if err := a.validateJob(t.Context(), "prompt-user", &input); err != nil {
				t.Fatal("valid boundary rejected", err)
			}
			if input.Prompt != prompt {
				t.Fatal("prompt was truncated")
			}
			input.Prompt += "光"
			if err := a.validateJob(t.Context(), "prompt-user", &input); err == nil || !strings.Contains(err.Error(), "提示词最多") {
				t.Fatal("over-limit prompt accepted", err)
			}
			input.Prompt = " \n\t "
			if a.validateJob(t.Context(), "prompt-user", &input) == nil {
				t.Fatal("blank prompt accepted")
			}
		})
	}
}

func TestPromptLimitSavedExposedAndPreservedBySync(t *testing.T) {
	a, admin := modelServer(t)
	if w := call(a, "POST", "/api/admin/models/sync", admin, "", nil); w.Code != 200 {
		t.Fatal(w.Body.String())
	}
	id := core.Digest("image-live")[:32]
	for _, limit := range []int{4000, 0} {
		row, _ := a.Store.Get(t.Context(), "models", id)
		var model core.Model
		_ = json.Unmarshal(row.Data, &model)
		model.Settings = core.ModelSettings{MaxPromptChars: limit, DefaultPrompt: strings.Repeat("景", 1000), Ideas: []string{strings.Repeat("光", 1000)}}
		w := call(a, "PUT", "/api/admin/models/"+id, admin, "", map[string]any{"version": row.Version, "data": model})
		if w.Code != 200 {
			t.Fatal("save", w.Code, w.Body.String())
		}
		if w = call(a, "POST", "/api/admin/models/sync", admin, "", nil); w.Code != 200 {
			t.Fatal(w.Body.String())
		}
		stored, _ := a.model(t.Context(), id)
		if stored.Settings.MaxPromptChars != limit || stored.Settings.DefaultPrompt != model.Settings.DefaultPrompt {
			t.Fatal("sync lost prompt settings")
		}
		w = call(a, "GET", "/api/config", "", "", nil)
		var config struct {
			Models []core.Model `json:"models"`
		}
		if json.Unmarshal(w.Body.Bytes(), &config) != nil || len(config.Models) != 1 {
			t.Fatal(w.Body.String())
		}
		if config.Models[0].Settings.MaxPromptChars != model.Settings.PromptLimit("image") {
			t.Fatal("public limit differs from submission validation")
		}
	}
}
