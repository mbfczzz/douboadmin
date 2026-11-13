package objectstore

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
)

// Display images (template covers) are resized by OSS before download and
// their signed URL is reused for a while: original uploads can be several
// MB, and a fresh signature on every list request defeats the client's
// image cache.
const (
	imageURLLife  = 30 * time.Minute
	imageURLReuse = 20 * time.Minute
)

type signedURL struct {
	url    string
	expiry time.Time
}

var imageURLs sync.Map // store instance|bucket|key|width → signedURL

func (o *OSS) ImageURL(ctx context.Context, key string, width int) (string, error) {
	if width < 64 || width > 2048 {
		return "", fmt.Errorf("invalid image width")
	}
	// The store instance is part of the key: rotated credentials build a new
	// store, so URLs signed with the old key are never handed out again.
	id := fmt.Sprintf("%p|%s|%s|%d", o, o.bucket, key, width)
	if v, ok := imageURLs.Load(id); ok && time.Until(v.(signedURL).expiry) > imageURLLife-imageURLReuse {
		return v.(signedURL).url, nil
	}
	// Original format kept (PNG covers keep their transparency).
	process := fmt.Sprintf("image/resize,m_lfit,w_%d,limit_1/auto-orient,1/quality,q_82", width)
	r, err := o.client.Presign(ctx, &oss.GetObjectRequest{Bucket: oss.Ptr(o.bucket), Key: oss.Ptr(key), Process: oss.Ptr(process)}, func(p *oss.PresignOptions) { p.Expires = imageURLLife })
	if err != nil {
		return "", err
	}
	imageURLs.Store(id, signedURL{r.URL, time.Now().Add(imageURLLife)})
	return r.URL, nil
}
