package store

import "context"

func (m *MySQL) Resume(ctx context.Context, id string) error  { return resumeFundedJob(ctx, m, id) }
func (m *Memory) Resume(ctx context.Context, id string) error { return resumeFundedJob(ctx, m, id) }
