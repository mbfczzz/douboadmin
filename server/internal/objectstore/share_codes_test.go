package objectstore

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss/credentials"
)

func TestEnsureQRProtectsPrivateObjectsAndRetries(t *testing.T) {
	for _, tc := range []struct {
		head, put        int
		wantPut, wantErr bool
	}{
		{200, 200, false, false}, {404, 200, true, false}, {404, 409, true, false}, {403, 200, false, true}, {404, 403, true, true},
	} {
		t.Run(fmt.Sprintf("%d-%d", tc.head, tc.put), func(t *testing.T) {
			puts := 0
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == "HEAD" {
					w.WriteHeader(tc.head)
					return
				}
				puts++
				if r.Method != "PUT" || r.Header.Get("x-oss-object-acl") != "private" || r.Header.Get("x-oss-forbid-overwrite") != "true" || r.Header.Get("Content-Type") != "image/png" {
					t.Error("QR upload lost protection")
				}
				w.Header().Set("Content-Type", "application/xml")
				w.WriteHeader(tc.put)
				if tc.put == 409 {
					fmt.Fprint(w, "<Error><Code>FileAlreadyExists</Code></Error>")
				}
			}))
			defer srv.Close()
			cfg := oss.LoadDefaultConfig().WithRegion("cn-shanghai").WithEndpoint(srv.URL).WithUsePathStyle(true).
				WithCredentialsProvider(credentials.NewStaticCredentialsProvider("fixture-key", "fixture-secret"))
			o := &OSS{client: oss.NewClient(cfg), bucket: "fixture"}
			err := o.EnsureQR(context.Background(), "system/share-codes/"+strings.Repeat("a", 64)+".png", strings.NewReader("fixture"))
			if (err != nil) != tc.wantErr || (puts > 0) != tc.wantPut {
				t.Fatal("unexpected QR upload result", puts, err)
			}
			for _, key := range []string{"uploads/user.png", "system/share-codes/../user.png", "system/share-codes/code.png"} {
				if o.EnsureQR(context.Background(), key, strings.NewReader("fixture")) == nil {
					t.Fatal("invalid key accepted")
				}
			}
		})
	}
}
