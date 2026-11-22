package hotvideo

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/vision"
	"encoding/json"
	"errors"
	"time"
)

// 一键复刻's breakdown of a hot video (hook, shots, selling points) by the
// video model, shared by everyone per model and video in hot_breakdowns.
// The remake preparation job runs it (import.go) and the API can read or
// start it; a run that failed or stalled for 5 minutes is started again.
type BreakdownRecord struct {
	VideoID    string            `json:"videoId"`
	Model      string            `json:"model"`
	Status     string            `json:"status"` // running | done | failed
	Result     *vision.Breakdown `json:"result"`
	Error      string            `json:"error"`
	StartedAt  time.Time         `json:"startedAt"`
	FinishedAt time.Time         `json:"finishedAt"`
}

const breakdownStale = 5 * time.Minute

// breakdownPoll is how often a caller checks on someone else's run.
var breakdownPoll = 3 * time.Second

// Active reports a run that is still being worked on.
func (r BreakdownRecord) Active() bool {
	return r.Status == "running" && time.Since(r.StartedAt) < breakdownStale
}

// v2: breakdowns list the subjects a remake can swap (older ones did not).
func breakdownID(model, videoID string) string {
	return core.Digest("v2:" + model + ":" + videoID)[:32]
}

// ReadBreakdown returns the shared record (core.ErrNotFound when none).
func (s *Service) ReadBreakdown(ctx context.Context, model, videoID string) (BreakdownRecord, int64, error) {
	row, err := s.Store.Get(ctx, "hot_breakdowns", breakdownID(model, videoID))
	var rec BreakdownRecord
	if err == nil {
		_ = json.Unmarshal(row.Data, &rec)
	}
	return rec, row.Version, err
}

// EnsureBreakdown returns the video's breakdown: the stored one, the one
// another run finishes meanwhile, or a new run here. link signs the user's
// saved copy of the video only when a run is needed.
func (s *Service) EnsureBreakdown(ctx context.Context, model *vision.Client, videoID string, link func() (string, error)) (*vision.Breakdown, error) {
	modelID := model.ModelID()
	for {
		rec, version, err := s.ReadBreakdown(ctx, modelID, videoID)
		if err != nil && !errors.Is(err, core.ErrNotFound) {
			return nil, err
		}
		if rec.Status == "done" && rec.Result != nil {
			return rec.Result, nil
		}
		if rec.Active() { // someone else is on it
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(breakdownPoll):
			}
			continue
		}
		claim := BreakdownRecord{VideoID: videoID, Model: modelID, Status: "running", StartedAt: time.Now().UTC()}
		if _, err := s.Store.Put(ctx, "hot_breakdowns", core.Record{ID: breakdownID(modelID, videoID), Data: core.Data(claim)}, version); err != nil {
			if errors.Is(err, core.ErrConflict) {
				continue // lost the race: wait for the winner
			}
			return nil, err
		}
		return s.runBreakdown(ctx, model, claim, link)
	}
}

func (s *Service) runBreakdown(ctx context.Context, model *vision.Client, rec BreakdownRecord, link func() (string, error)) (*vision.Breakdown, error) {
	url, err := link()
	var result vision.Breakdown
	if err == nil {
		result, err = model.Breakdown(ctx, url)
	}
	rec.FinishedAt = time.Now().UTC()
	if err != nil {
		rec.Status, rec.Error = "failed", err.Error()
	} else {
		rec.Status, rec.Result = "done", &result
	}
	// Saved even when the caller's context ended, so the claim does not linger.
	save, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()
	if _, version, e := s.ReadBreakdown(save, rec.Model, rec.VideoID); e == nil {
		_, _ = s.Store.Put(save, "hot_breakdowns", core.Record{ID: breakdownID(rec.Model, rec.VideoID), Data: core.Data(rec)}, version)
	}
	if err != nil {
		return nil, err
	}
	return &result, nil
}
