package main

import (
	"fmt"
	"os"
	"strconv"

	"github.com/redis/go-redis/v9"
)

func redisOptionsFromEnv() (*redis.Options, error) {
	addr := os.Getenv("REDIS_ADDR")
	if addr == "" {
		return nil, nil
	}
	db, err := strconv.Atoi(env("REDIS_DB", "0"))
	if err != nil || db < 0 {
		return nil, fmt.Errorf("REDIS_DB must be a non-negative integer")
	}
	return &redis.Options{
		Addr:     addr,
		Username: os.Getenv("REDIS_USERNAME"),
		Password: os.Getenv("REDIS_PASSWORD"),
		DB:       db,
	}, nil
}
