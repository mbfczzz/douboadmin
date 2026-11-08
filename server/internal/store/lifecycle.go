package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
)

func NotifyOnce(tx Transaction, user, reference string, n core.Notification) error {
	return noticeOnce(tx, "notifications", user, reference, n)
}

func noticeOnce(tx Transaction, namespace, user, reference string, n core.Notification) error {
	id := core.Digest(user + ":" + reference)[:32]
	if _, e := tx.Get(namespace, id); e == nil {
		return nil
	} else if !errors.Is(e, core.ErrNotFound) {
		return e
	}
	_, e := tx.Put(namespace, core.Record{ID: id, Owner: user, Data: core.Data(n)}, 0)
	return e
}

func completeLifecycle(tx Transaction, j core.Job, failure string) error {
	if !core.IsWork(j.Input.Kind) {
		return nil
	}
	if failure == "" {
		if _, e := tx.Get("reviews", j.ID); errors.Is(e, core.ErrNotFound) {
			state := "pending"
			_, e = tx.Put("reviews", core.Record{ID: j.ID, Owner: j.UserID, Data: core.Data(core.Review{JobID: j.ID, Kind: j.Input.Kind, Status: state})}, 0)
			if e != nil {
				return e
			}
		} else if e != nil {
			return e
		}
	}
	preferences := core.DefaultPreferences()
	if row, e := tx.Get("preferences", j.UserID); e == nil {
		_ = json.Unmarshal(row.Data, &preferences)
	}
	n := core.Notification{Kind: "job", Title: "作品已完成", Content: "打开作品查看生成结果。", TargetID: j.ID}
	state := "succeeded"
	if failure != "" {
		state = "failed"
		n.Title = "生成任务需要处理"
		n.Content = failure
	}
	if failure == "" && preferences.CompletionSubscription {
		if e := noticeOnce(tx, "subscription_queue", j.UserID, "job:"+j.ID+":"+state, n); e != nil {
			return e
		}
	}
	if !preferences.InAppNotifications {
		return nil
	}
	return NotifyOnce(tx, j.UserID, "job:"+j.ID+":"+state, n)
}
