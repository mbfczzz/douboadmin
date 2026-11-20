package hotvideo

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"doubo/server/internal/store"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func feedFixture(t *testing.T, failing *atomic.Bool) (*Service, *miniredis.Miniredis, *atomic.Int32) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if failing != nil && failing.Load() {
			w.WriteHeader(402)
			_, _ = w.Write([]byte(`{"detail":{"message_zh":"余额不足"}}`))
			return
		}
		if r.URL.Path == billboardPath {
			_, _ = w.Write([]byte(`{"code":200,"data":{"data":{"objs":[{"item_id":"7301","item_title":"视频","item_cover_url":"http://p3.douyinpic.com/c.jpg","nick_name":"作者","like_cnt":12000,"play_cnt":90000}]}}}`))
			return
		}
		_, _ = w.Write([]byte(`{"code":200,"data":{"business_data":[{"data":{"aweme_info":{"aweme_id":"7301","desc":"视频"}}}],"cursor":10,"has_more":1}}`))
	}))
	t.Cleanup(server.Close)
	mr := miniredis.RunT(t)
	rc := redis.NewClient(&redis.Options{Addr: mr.Addr()})
	t.Cleanup(func() { _ = rc.Close() })
	// An hour and the hot list, as configured, so refresh and expiry are
	// checked against a set window (the defaults are search and a day).
	return &Service{Client: &Client{BaseURL: server.URL, Key: "fixture"}, Store: store.NewMemory(), Redis: rc, Source: "billboard", TTL: CacheTTL{Feed: time.Hour}}, mr, &calls
}

// Feed pages come from Redis; the refresher refetches only after 59 minutes.
func TestFeedServedFromRedisAndRefreshedBeforeAnHour(t *testing.T) {
	s, mr, calls := feedFixture(t, nil)
	ctx := context.Background()
	q := FeedQuery("美食")
	s.refreshFeed(ctx, q) // cold: fills Redis
	if calls.Load() != 1 || mr.TTL(s.feedKey(q)) != s.feedKeep() {
		t.Fatalf("calls %d ttl %v", calls.Load(), mr.TTL(s.feedKey(q)))
	}
	r, err := s.Search(ctx, q)
	if err != nil || !r.Cached || len(r.Items) != 1 || calls.Load() != 1 {
		t.Fatalf("not served from Redis: %+v %v %d", r, err, calls.Load())
	}
	s.refreshFeed(ctx, q) // still fresh
	if calls.Load() != 1 {
		t.Fatal("refreshed too early")
	}
	age(t, s, q, 59*time.Minute+time.Second)
	s.refreshFeed(ctx, q)
	if calls.Load() != 2 {
		t.Fatal("not refreshed one minute before the hour")
	}
	if _, err := mr.Get(s.feedKey(q) + ":lock"); err == nil {
		t.Fatal("lock left behind")
	}
}

// Another instance holding the lock skips; a failed refresh keeps the old page.
func TestFeedRefreshLockAndFailureKeepsPage(t *testing.T) {
	var failing atomic.Bool
	s, mr, calls := feedFixture(t, &failing)
	ctx := context.Background()
	q := FeedQuery("萌宠")
	s.refreshFeed(ctx, q)
	age(t, s, q, 70*time.Minute)
	_ = mr.Set(s.feedKey(q)+":lock", "1")
	s.refreshFeed(ctx, q)
	if calls.Load() != 1 {
		t.Fatal("refreshed despite another instance's lock")
	}
	mr.Del(s.feedKey(q) + ":lock")
	failing.Store(true)
	s.refreshFeed(ctx, q)
	// The stale page is tried live once more; TikHub still failing, the old page is served.
	if r, err := s.Search(ctx, q); err != nil || len(r.Items) != 1 || calls.Load() != 3 {
		t.Fatalf("old page lost after a failed refresh: %+v %v", r, err)
	}
}

// A later page (never refreshed in the background) is read again once it is
// older than the configured feed time, instead of up to twice that.
func TestStaleLaterFeedPagesAreReadAgain(t *testing.T) {
	var failing atomic.Bool
	s, _, calls := feedFixture(t, &failing)
	ctx := context.Background()
	q := Query{Keyword: "萌宠", Feed: true, Cursor: 20}
	if _, err := s.Search(ctx, q); err != nil || calls.Load() != 1 {
		t.Fatal(err, calls.Load())
	}
	_, _ = s.Search(ctx, q)
	if calls.Load() != 1 {
		t.Fatal("a fresh page went to TikHub")
	}
	age(t, s, q, 61*time.Minute)
	if _, err := s.Search(ctx, q); err != nil || calls.Load() != 2 {
		t.Fatal("a stale later page was served", calls.Load(), err)
	}
}

func age(t *testing.T, s *Service, q Query, by time.Duration) {
	t.Helper()
	r, ok := s.feedGet(context.Background(), q)
	if !ok {
		t.Fatal("no cached page")
	}
	r.FetchedAt = r.FetchedAt.Add(-by)
	raw, _ := json.Marshal(r)
	if err := s.Redis.Set(context.Background(), s.feedKey(q), raw, s.feedKeep()).Err(); err != nil {
		t.Fatal(err)
	}
}

func TestFeedWordsDefaultAndConfigured(t *testing.T) {
	if w := (&Service{}).FeedWords(); len(w) != 9 || w[0] != AllKeyword {
		t.Fatalf("default %v", w)
	}
	if w := (&Service{Keywords: []string{"露营"}}).FeedWords(); len(w) != 1 || w[0] != "露营" {
		t.Fatalf("configured %v", w)
	}
}

// HOT_FEED_SOURCE=billboard reads the hot list ("热门" = no filter, other
// chips filter it; undocumented reply, both common shapes read, cursor =
// page); search (the default) is keyword search, cached separately.
func TestFeedSourceHotListAndSearchSwitch(t *testing.T) {
	var bodies []map[string]any
	var paths []string
	reply := `{"code":200,"data":{"objs":[{"item_id":"7301","item_title":"标题","item_cover_url":"http://p3.douyinpic.com/c.jpg","nick_name":"作者","like_cnt":5,"play_cnt":9,"publish_time":1763000000}]}}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		bodies, paths = append(bodies, body), append(paths, r.URL.Path)
		if r.URL.Path != billboardPath {
			_, _ = w.Write([]byte(`{"code":200,"data":{"business_data":[{"data":{"aweme_info":{"aweme_id":"7309","desc":"美食"}}}]}}`))
			return
		}
		_, _ = w.Write([]byte(reply))
	}))
	defer server.Close()
	ctx := context.Background()
	s := &Service{Client: &Client{BaseURL: server.URL, Key: "fixture"}, Store: store.NewMemory(), Source: "billboard"}
	r, err := s.fetch(ctx, FeedQuery(AllKeyword))
	if err != nil || len(r.Items) != 1 || r.Items[0].Cover != "https://p3.douyinpic.com/c.jpg" || r.Items[0].Author != "作者" || *r.Items[0].Likes != 5 || r.Cursor != 2 || r.HasMore {
		t.Fatalf("%+v %v", r, err)
	}
	if paths[0] != billboardPath || bodies[0]["keyword"] != "" || bodies[0]["page"] != float64(1) || bodies[0]["sub_type"] != float64(billboardType) {
		t.Fatalf("request %s %v", paths[0], bodies[0])
	}
	reply = `{"code":200,"data":{"list":[{"aweme_info":{"aweme_id":"7302","desc":"完整作品"}}]}}`
	r, err = s.fetch(ctx, Query{Keyword: "美食", Feed: true, Cursor: 2})
	if err != nil || r.Items[0].ID != "7302" || paths[1] != billboardPath || bodies[1]["keyword"] != "美食" || bodies[1]["page"] != float64(2) {
		t.Fatalf("chips must filter the hot list: %+v %v %v", r, err, bodies[1])
	}
	reply = `{"code":200,"data":{"something":"else"}}`
	if _, err = s.fetch(ctx, FeedQuery(AllKeyword)); err == nil {
		t.Fatal("unreadable reply accepted")
	}
	hotKey := s.cacheID(FeedQuery("美食"))
	s.Source = "search"
	r, err = s.fetch(ctx, FeedQuery("美食"))
	if err != nil || paths[3] != "/api/v1/douyin/search/fetch_video_search_v2" || r.Items[0].ID != "7309" || bodies[3]["keyword"] != "美食" {
		t.Fatalf("search source: %s %+v %v", paths[3], r, err)
	}
	if s.cacheID(FeedQuery("美食")) == hotKey {
		t.Fatal("sources share a cache key")
	}
	// Nothing configured: keyword search (fetch_video_search_v2), kept a day.
	unset := &Service{}
	if unset.FeedSource() != "search" || unset.feedFresh() != 24*time.Hour {
		t.Fatal(unset.FeedSource(), unset.feedFresh())
	}
}
