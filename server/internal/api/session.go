package api

import (
	"context"
	"crypto/sha256"
	"doubo/server/internal/core"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/redis/go-redis/v9"
	"sync"
	"time"
)

type Identity struct {
	PasswordVersion string    `json:"passwordVersion,omitempty"`
	Account         string    `json:"account,omitempty"`
	AdminRole       string    `json:"adminRole,omitempty"`
	ID              string    `json:"id"`
	Role            string    `json:"role"`
	Expires         time.Time `json:"expires"`
}
type Sessions struct {
	Redis  *redis.Client
	mu     sync.Mutex
	local  map[string]Identity
	limits map[string]bucket
}
type bucket struct {
	Count int
	Until time.Time
}

func NewSessions(r *redis.Client) *Sessions {
	return &Sessions{Redis: r, local: map[string]Identity{}, limits: map[string]bucket{}}
}
func tokenKey(t string) string {
	h := sha256.Sum256([]byte(t))
	return "doubo:session:" + hex.EncodeToString(h[:])
}
func (s *Sessions) Create(ctx context.Context, id, role string, account ...string) (string, error) {
	v := Identity{ID: id, Role: role, Expires: time.Now().Add(24 * time.Hour), Account: id}
	if len(account) > 0 {
		v.Account = account[0]
	}
	return s.create(ctx, v)
}
func (s *Sessions) CreateAdmin(ctx context.Context, id, account, role string, passwordChanged ...time.Time) (string, error) {
	v := Identity{ID: id, Role: "admin", AdminRole: role, Account: account, Expires: time.Now().Add(24 * time.Hour)}
	if len(passwordChanged) > 0 {
		v.PasswordVersion = passwordChanged[0].UTC().Format(time.RFC3339Nano)
	}
	return s.create(ctx, v)
}
func (s *Sessions) create(ctx context.Context, v Identity) (string, error) {
	token := core.NewID() + core.NewID()
	if s.Redis != nil {
		b, _ := json.Marshal(v)
		return token, s.Redis.Set(ctx, tokenKey(token), b, 24*time.Hour).Err()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for k, v := range s.local {
		if v.Expires.Before(time.Now()) {
			delete(s.local, k)
		}
	}
	s.local[tokenKey(token)] = v
	return token, nil
}
func (s *Sessions) Get(ctx context.Context, t string) (Identity, error) {
	var v Identity
	if s.Redis != nil {
		b, err := s.Redis.Get(ctx, tokenKey(t)).Bytes()
		if err != nil {
			if errors.Is(err, redis.Nil) {
				return v, core.ErrNotFound
			}
			return v, err
		}
		err = json.Unmarshal(b, &v)
		if err == nil && !v.Expires.After(time.Now()) {
			return v, core.ErrNotFound
		}
		return v, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	v, ok := s.local[tokenKey(t)]
	if !ok || v.Expires.Before(time.Now()) {
		return v, core.ErrNotFound
	}
	return v, nil
}
func (s *Sessions) Delete(ctx context.Context, t string) error {
	if s.Redis != nil {
		return s.Redis.Del(ctx, tokenKey(t)).Err()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.local, tokenKey(t))
	return nil
}
func (s *Sessions) Allow(ctx context.Context, key string, limit int) (bool, error) {
	if s.Redis != nil {
		n, e := s.Redis.Eval(ctx, `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end; return n`, []string{"doubo:limit:" + key}).Int()
		return n <= limit, e
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	for k, b := range s.limits {
		if b.Until.Before(now) {
			delete(s.limits, k)
		}
	}
	b := s.limits[key]
	if b.Until.Before(now) {
		b = bucket{Until: now.Add(time.Minute)}
	}
	b.Count++
	s.limits[key] = b
	return b.Count <= limit, nil
}
