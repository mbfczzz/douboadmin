package mixing

import (
	"context"
	"doubo/server/internal/core"
	"doubo/server/internal/media"
	"doubo/server/internal/provider"
	"doubo/server/internal/speech"
	"doubo/server/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type Engine struct {
	Runner  Runner
	Store   store.Store
	Media   *media.Service
	AI      *provider.Relay
	ASR     *speech.Client
	WorkDir string
}
type State struct {
	provider.Execution
	Step        string    `json:"step"`
	Sources     []Source  `json:"sources"`
	Cuts        []Cut     `json:"cuts"`
	Script      string    `json:"script"`
	Captions    []Caption `json:"captions"`
	Timing      string    `json:"timing,omitempty"`
	VoiceResult string    `json:"voiceResult,omitempty"`
	Duration    float64   `json:"duration"`
}

func (e *Engine) Ready() bool { return e != nil && e.Runner.Ready() && e.Media != nil }
func (e *Engine) save(ctx context.Context, row *core.Record, state State) error {
	r, err := e.Store.Put(ctx, "executions", core.Record{ID: row.ID, Owner: row.Owner, Data: core.Data(state)}, row.Version)
	if err == nil {
		*row = r
	}
	return err
}
func (e *Engine) Generate(ctx context.Context, j core.Job) (string, error) {
	if !e.Ready() {
		return "", fmt.Errorf("混剪引擎尚未配置")
	}
	row, err := e.Store.Get(ctx, "executions", j.ID)
	var state State
	if errors.Is(err, core.ErrNotFound) {
		state = State{Execution: provider.Execution{Phase: "polling", ModelKey: "local-mix", StartedAt: time.Now().UTC()}, Step: "analyze", Script: j.Input.Prompt, Duration: float64(j.Input.Duration)}
		row = core.Record{ID: j.ID, Owner: j.UserID}
		if e.save(ctx, &row, state) != nil {
			return "", provider.ErrPending
		}
	} else if err != nil {
		return "", provider.ErrPending
	} else if json.Unmarshal(row.Data, &state) != nil {
		return "", fmt.Errorf("混剪记录无效")
	}
	if state.Phase == "succeeded" {
		return state.Result, nil
	}
	if state.Phase == "failed" || state.Phase == "uncertain" {
		return "", errors.New(state.Error)
	}
	workRoot, err := filepath.Abs(e.WorkDir)
	if err != nil {
		return "", err
	}
	if err = os.MkdirAll(workRoot, 0700); err != nil {
		return "", err
	}
	dir, err := os.MkdirTemp(workRoot, j.ID+"-")
	if err != nil {
		return "", err
	}
	defer func() {
		base, _ := filepath.Abs(e.WorkDir)
		target, _ := filepath.Abs(dir)
		relative, er := filepath.Rel(base, target)
		if er == nil && filepath.IsLocal(relative) && relative != "." {
			_ = os.RemoveAll(target)
		}
	}()
	result, err := e.advance(ctx, j, &row, &state, dir)
	if err != nil && !errors.Is(err, provider.ErrPending) && ctx.Err() == nil {
		state.Phase = "failed"
		state.Error = err.Error()
		var recovery recoverable
		if errors.As(err, &recovery) {
			state.Phase = "polling"
		}
		if errors.Is(err, provider.ErrUncertain) || strings.Contains(err.Error(), "提交结果暂未确认") {
			state.Phase = "uncertain"
		}
		_ = e.save(ctx, &row, state)
	}
	return result, err
}

func (e *Engine) inputs(ctx context.Context, j core.Job, dir string) (map[string]string, error) {
	paths := map[string]string{}
	for _, id := range j.Input.Assets {
		a, err := e.Media.Local(ctx, j.UserID, id, dir)
		if err != nil {
			return nil, err
		}
		paths[id] = a.Path
	}
	return paths, nil
}
func childJob(parent core.Job, step, kind, model, prompt string) core.Job {
	return core.Job{ID: core.Digest("mix-step:" + parent.ID + ":" + step)[:32], UserID: parent.UserID, Input: core.JobInput{Kind: kind, Model: model, Prompt: prompt, Purpose: "mix_" + step, ParentID: parent.ID}, CreatedAt: parent.CreatedAt}
}
