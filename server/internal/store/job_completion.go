package store

import (
	"doubo/server/internal/core"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

// Completion and expiration settle funds and notify in the same transaction.
func completeJobAccounting(tx Transaction, j core.Job, failure string) error {
	if err := completeLifecycle(tx, j, failure); err != nil {
		return err
	}
	row, err := tx.Get("job_billing", j.ID)
	if errors.Is(err, core.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	var bill core.JobBilling
	if err = json.Unmarshal(row.Data, &bill); err != nil {
		return err
	}
	// Failed: the points go back at once, outcome known or not.
	if bill.State != "reserved" {
		return nil
	}
	entry := core.LedgerEntry{UserID: j.UserID, Reference: "job:" + j.ID + ":settle", Kind: "job_charge", HeldDelta: -bill.Units, Note: "生成成功扣除积分"}
	bill.State = "charged"
	if failure != "" {
		entry.Kind, entry.AvailableDelta, entry.Note = "job_release", bill.Units, "生成失败退回积分"
		bill.State = "released"
	} else if bill.UsedUnits != nil {
		used := min(max(*bill.UsedUnits, 0), bill.Units)
		entry.Kind, entry.AvailableDelta = "job_usage", bill.Units-used
		entry.Note = fmt.Sprintf("对话按用量扣除 %s 积分（输入 %d / 输出 %d token）", core.FormatPoints(used), bill.InputTokens, bill.OutputTokens)
		if bill.VideoTokens > 0 {
			entry.Note = fmt.Sprintf("视频按用量扣除 %s 积分（%d 视频 token）", core.FormatPoints(used), bill.VideoTokens)
		}
		if bill.CachedTokens > 0 || bill.Peak {
			extra := []string{}
			if bill.CachedTokens > 0 {
				extra = append(extra, fmt.Sprintf("其中缓存命中 %d", bill.CachedTokens))
			}
			if bill.Peak {
				extra = append(extra, "高峰时段")
			}
			entry.Note = strings.TrimSuffix(entry.Note, "）") + "；" + strings.Join(extra, "，") + "）"
		}
		bill.ReservedUnits, bill.Units = bill.Units, used
	}
	if _, err = ApplyFunds(tx, entry); err != nil {
		return err
	}
	row.Data = core.Data(bill)
	_, err = tx.Put("job_billing", row, row.Version)
	return err
}
