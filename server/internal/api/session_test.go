package api

import (
	"context"
	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestSharedRedisSessionsAndAtomicLimit(t *testing.T) {
	mr := miniredis.RunT(t)
	r1 := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer r1.Close()
	r2 := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	defer r2.Close()
	a, b := NewSessions(r1), NewSessions(r2)
	ctx := context.Background()
	token, e := a.Create(ctx, "user", "user")
	if e != nil {
		t.Fatal(e)
	}
	v, e := b.Get(ctx, token)
	if e != nil || v.ID != "user" {
		t.Fatal("session not shared", e)
	}
	if e = b.Delete(ctx, token); e != nil {
		t.Fatal(e)
	}
	if _, e = a.Get(ctx, token); e == nil {
		t.Fatal("revocation did not propagate")
	}
	var accepted atomic.Int32
	var wg sync.WaitGroup
	for i := range 40 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			s := a
			if i%2 == 0 {
				s = b
			}
			ok, e := s.Allow(ctx, "user", 10)
			if e != nil {
				t.Error(e)
			}
			if ok {
				accepted.Add(1)
			}
		}(i)
	}
	wg.Wait()
	if accepted.Load() != 10 {
		t.Fatalf("distributed quota accepted %d", accepted.Load())
	}
	mr.FastForward(61 * time.Second)
	ok, e := b.Allow(ctx, "user", 10)
	if e != nil || !ok {
		t.Fatal("quota did not expire", e)
	}
}
