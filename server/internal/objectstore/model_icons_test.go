package objectstore

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss/credentials"
)

func TestEnsureModelIconDoesNotOverwriteOrIgnoreDeniedAccess(t *testing.T) {
	for _, tc := range []struct {
		name    string
		head    int
		put     int
		wantPut bool
		wantErr bool
	}{
		{"existing", 200, 200, false, false},
		{"new", 404, 200, true, false},
		{"concurrent", 404, 409, true, false},
		{"denied", 403, 200, false, true},
		{"write denied", 404, 403, true, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			puts := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == "HEAD" {
					w.WriteHeader(tc.head)
					return
				}
				puts++
				if r.Method != "PUT" || r.Header.Get("x-oss-object-acl") != "private" || r.Header.Get("x-oss-forbid-overwrite") != "true" || r.Header.Get("Content-Type") != "image/png" {
					t.Error("icon upload changed media protection")
				}
				w.Header().Set("Content-Type", "application/xml")
				w.WriteHeader(tc.put)
				if tc.put == 409 {
					fmt.Fprint(w, "<Error><Code>FileAlreadyExists</Code></Error>")
				} else if tc.put == 403 {
					fmt.Fprint(w, "<Error><Code>AccessDenied</Code></Error>")
				}
			}))
			defer server.Close()
			cfg := oss.LoadDefaultConfig().WithRegion("cn-shanghai").WithEndpoint(server.URL).WithUsePathStyle(true).
				WithCredentialsProvider(credentials.NewStaticCredentialsProvider("fixture-key", "fixture-secret"))
			objects := &OSS{client: oss.NewClient(cfg), bucket: "fixture-bucket"}
			err := objects.EnsureIcon(context.Background(), "system/model-icons/hash/openai.png", strings.NewReader("fixture"))
			if (err != nil) != tc.wantErr || (puts > 0) != tc.wantPut {
				t.Fatal("unexpected synchronization", puts, err)
			}
			if err := objects.EnsureIcon(context.Background(), "uploads/user.png", strings.NewReader("fixture")); err == nil {
				t.Fatal("user-media key accepted")
			}
		})
	}
}

func TestModelIconHTTPSPrivateSignature(t *testing.T) {
	objects := New("cn-shanghai", "fixture-bucket", "fixture-key", "fixture-secret")
	raw, err := objects.IconURL(context.Background(), "system/model-icons/hash/openai.png")
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host != "fixture-bucket.oss-cn-shanghai.aliyuncs.com" {
		t.Fatal("wrong public endpoint")
	}
	if u.Query().Get("x-oss-expires") != "86400" || u.Query().Get("x-oss-signature") == "" {
		t.Fatal("missing session-friendly signature")
	}
}

func TestProjectIconProcessingPreservesAspectRatioAndSignature(t *testing.T) {
	objects := New("cn-shanghai", "fixture-bucket", "fixture-key", "fixture-secret")
	raw, err := objects.IconURL(context.Background(), "system/brand/hash/doubo.png")
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" {
		t.Fatal("invalid icon endpoint")
	}
	if u.Query().Get("x-oss-process") != "image/resize,m_lfit,w_400" || u.Query().Get("x-oss-signature") == "" {
		t.Fatal("resize must be included in the private OSS signature")
	}
}
