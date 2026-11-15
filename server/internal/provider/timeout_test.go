package provider

import (
	"context"
	"doubo/server/internal/core"
	"errors"
	"testing"
	"time"
)

func TestExpiredImageStopsEveryExecutionPhaseBeforeQueryOrSave(t *testing.T) {
	for _, phase := range []string{"", "polling", "output", "succeeded", "submitting", "uncertain"} {
		p, j := fixture(t, nil)
		j.CreatedAt = time.Now().Add(-11 * time.Minute)
		if phase != "" {
			_, err := p.Store.Put(t.Context(), "executions", core.Record{ID: j.ID, Data: core.Data(Execution{Phase: phase, TaskID: "receipt", Result: "https://fixture.test/output.png", StartedAt: time.Now()})}, 0)
			if err != nil {
				t.Fatal(err)
			}
		}
		p.SaveResult = func(context.Context, core.Job, string) (string, error) {
			t.Fatal("expired result was downloaded again")
			return "", nil
		}
		_, err := p.Generate(t.Context(), j)
		var timeout *core.JobTimeout
		if !errors.As(err, &timeout) {
			t.Fatal("phase kept processing", phase, err)
		}
	}
}
