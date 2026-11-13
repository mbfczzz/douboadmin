package objectstore

import (
	"context"
	"errors"
	"io"
	"regexp"

	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
)

var shareCodeKey = regexp.MustCompile(`^system/share-codes/[a-f0-9]{64}\.png$`)

// QR images are immutable private objects. Concurrent readers may publish the
// same content, but cannot overwrite an existing object or user upload.
func (o *OSS) EnsureQR(ctx context.Context, key string, body io.Reader) error {
	if !shareCodeKey.MatchString(key) {
		return errors.New("invalid QR image key")
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
	if errors.As(err, &service) && service.StatusCode == 409 && service.Code == "FileAlreadyExists" {
		return nil
	}
	return err
}
