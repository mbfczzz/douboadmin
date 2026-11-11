package objectstore

import (
	"context"
	"errors"
	"io"
	"strings"
	"time"

	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
)

// EnsureIcon only writes content-addressed, built-in assets.
func (o *OSS) EnsureIcon(ctx context.Context, key string, body io.Reader) error {
	if !strings.HasPrefix(key, "system/model-icons/") && !strings.HasPrefix(key, "system/brand/") {
		return errors.New("invalid model icon key")
	}
	_, err := o.client.HeadObject(ctx, &oss.HeadObjectRequest{Bucket: oss.Ptr(o.bucket), Key: oss.Ptr(key)})
	if err == nil {
		return nil
	}
	var service *oss.ServiceError
	if !errors.As(err, &service) || service.StatusCode != 404 {
		return err
	}
	err = o.Put(ctx, key, body, "image/png")
	// Multiple API instances may synchronize the same immutable icon concurrently.
	if errors.As(err, &service) && service.StatusCode == 409 && service.Code == "FileAlreadyExists" {
		return nil
	}
	return err
}

// Brand icons are not sensitive. A longer signature supports long editing sessions
// while keeping the bucket and all uploaded user media private.
func (o *OSS) IconURL(ctx context.Context, key string) (string, error) {
	req := &oss.GetObjectRequest{Bucket: oss.Ptr(o.bucket), Key: oss.Ptr(key)}
	if strings.HasPrefix(key, "system/brand/") {
		req.Process = oss.Ptr("image/resize,m_lfit,w_400")
	}
	result, err := o.client.Presign(ctx, req, func(p *oss.PresignOptions) {
		p.Expires = 24 * time.Hour
	})
	if err != nil {
		return "", err
	}
	return result.URL, nil
}
