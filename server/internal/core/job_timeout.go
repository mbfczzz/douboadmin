package core

import "time"

func JobTimeLimit(kind string) time.Duration {
	switch kind {
	case "image":
		return 10 * time.Minute
	case "video", "mix":
		return time.Hour
	default:
		return 0
	}
}

func JobDeadline(j Job) time.Time {
	limit := JobTimeLimit(j.Input.Kind)
	if limit == 0 || j.CreatedAt.IsZero() {
		return time.Time{}
	}
	return j.CreatedAt.Add(limit)
}

func JobExpired(j Job, now time.Time) bool {
	deadline := JobDeadline(j)
	return !deadline.IsZero() && !now.Before(deadline)
}

type JobTimeout struct{ Kind string }

func (e *JobTimeout) Error() string {
	if e.Kind == "image" {
		return "图片任务超过 10 分钟仍未返回可用结果，已超时失败"
	}
	return "视频任务超过 1 小时仍未返回可用结果，已超时失败"
}
