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
	if !strings.HasPrefix(key, "system/model-icons/") && !strings.HasPrefix(key, "system/brand/") && !strings.HasPrefix(key, "system/ui-art/") {
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
	contentType := "image/png"
	if strings.HasPrefix(key, "system/ui-art/") {
		contentType = "image/jpeg"
	}
	err = o.Put(ctx, key, body, contentType)
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

// PruneUIArt deletes UI art objects that are no longer part of the current
// set. Only keys under system/ui-art/ are ever listed or removed; user media
// and the other built-in assets are untouched.
func (o *OSS) PruneUIArt(ctx context.Context, keep map[string]bool) (int, error) {
	const prefix = "system/ui-art/"
	pages := o.client.NewListObjectsV2Paginator(&oss.ListObjectsV2Request{Bucket: oss.Ptr(o.bucket), Prefix: oss.Ptr(prefix)})
	removed := 0
	for pages.HasNext() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return removed, err
		}
		for _, object := range page.Contents {
			key := oss.ToString(object.Key)
			if !strings.HasPrefix(key, prefix) || keep[key] {
				continue
			}
			if _, err := o.client.DeleteObject(ctx, &oss.DeleteObjectRequest{Bucket: oss.Ptr(o.bucket), Key: oss.Ptr(key)}); err != nil {
				return removed, err
			}
			removed++
		}
	}
	return removed, nil
}
