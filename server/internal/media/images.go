package media

import (
	"context"
	"doubo/server/internal/core"
	"strconv"
)

func (s *Service) saveImages(ctx context.Context, job core.Job, result string) (string, error) {
	refs, err := core.ResultRefs(result)
	if err != nil {
		return "", err
	}
	saved := make([]string, 0, len(refs))
	for i, ref := range refs {
		imageJob := job
		// Slot zero keeps the legacy asset ID; other slots have stable independent keys.
		if i > 0 {
			imageJob.ID = core.Digest(job.ID + ":output:" + strconv.Itoa(i))[:32]
		}
		stored, err := s.Save(ctx, imageJob, ref)
		if err != nil {
			return "", err
		}
		saved = append(saved, stored)
	}
	return core.PackResults(saved), nil
}

func (s *Service) ResultURLs(ctx context.Context, result string) ([]string, error) {
	refs, err := core.ResultRefs(result)
	if err != nil {
		return nil, err
	}
	urls := make([]string, 0, len(refs))
	for _, ref := range refs {
		u, err := s.URL(ctx, ref)
		if err != nil {
			return nil, err
		}
		urls = append(urls, u)
	}
	return urls, nil
}
