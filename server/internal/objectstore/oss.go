package objectstore

import (
	"context"
	"fmt"
	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss/credentials"
	"io"
	"strings"
	"time"
)

type OSS struct {
	client *oss.Client
	bucket string
}

func New(region, bucket, key, secret string) *OSS {
	cfg := oss.LoadDefaultConfig().WithRegion(region).WithCredentialsProvider(credentials.NewStaticCredentialsProvider(key, secret)).WithReadWriteTimeout(60 * time.Second)
	return &OSS{oss.NewClient(cfg), bucket}
}
func (o *OSS) Put(ctx context.Context, key string, body io.Reader, contentType string) error {
	_, err := o.client.PutObject(ctx, &oss.PutObjectRequest{Bucket: oss.Ptr(o.bucket), Key: oss.Ptr(key), Body: body, ContentType: oss.Ptr(contentType), Acl: oss.ObjectACLPrivate, ForbidOverwrite: oss.Ptr("true")})
	return err
}
func (o *OSS) URL(ctx context.Context, key string) (string, error) {
	result, err := o.client.Presign(ctx, &oss.GetObjectRequest{Bucket: oss.Ptr(o.bucket), Key: oss.Ptr(key)}, func(o *oss.PresignOptions) { o.Expires = 15 * time.Minute })
	if err != nil {
		return "", err
	}
	return result.URL, nil
}

// Only deterministic generated-result keys may be rewritten during crash recovery.
func (o *OSS) PutResult(ctx context.Context, key string, body io.Reader, contentType string) error {
	if !strings.HasPrefix(key, "results/") {
		return fmt.Errorf("invalid result key")
	}
	_, err := o.client.PutObject(ctx, &oss.PutObjectRequest{Bucket: oss.Ptr(o.bucket), Key: oss.Ptr(key), Body: body, ContentType: oss.Ptr(contentType), Acl: oss.ObjectACLPrivate})
	return err
}

func (o *OSS) InputURL(ctx context.Context, key string) (string, error) {
	r, err := o.client.Presign(ctx, &oss.GetObjectRequest{Bucket: oss.Ptr(o.bucket), Key: oss.Ptr(key)}, func(p *oss.PresignOptions) { p.Expires = 2 * time.Hour })
	if err != nil {
		return "", err
	}
	return r.URL, nil
}
