package main

import "testing"

func TestRedisOptionsFromEnv(t *testing.T) {
	t.Setenv("REDIS_ADDR", "redis.example:6379")
	t.Setenv("REDIS_USERNAME", "app")
	t.Setenv("REDIS_PASSWORD", "secret")
	t.Setenv("REDIS_DB", "1")

	options, err := redisOptionsFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if options.Addr != "redis.example:6379" || options.Username != "app" || options.Password != "secret" || options.DB != 1 {
		t.Fatalf("unexpected options: %+v", options)
	}
}

func TestRedisOptionsAllowDisabledAndRejectInvalidDB(t *testing.T) {
	t.Setenv("REDIS_ADDR", "")
	options, err := redisOptionsFromEnv()
	if err != nil || options != nil {
		t.Fatalf("disabled Redis: options=%v err=%v", options, err)
	}

	t.Setenv("REDIS_ADDR", "redis.example:6379")
	t.Setenv("REDIS_DB", "-1")
	if _, err = redisOptionsFromEnv(); err == nil {
		t.Fatal("negative REDIS_DB accepted")
	}
}
