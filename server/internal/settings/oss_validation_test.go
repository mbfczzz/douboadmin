package settings

import (
	"errors"
	"testing"
)

func TestOSSRegionIsAnIDRatherThanAnEndpoint(t *testing.T) {
	g, _ := group("oss")
	for _, region := range []string{"", "cn-shanghai", "ap-southeast-1", "cn-north-2-gov-1"} {
		if err := validate(g, Values{"OSS_REGION": region}, false); err != nil {
			t.Fatal("valid or unfinished configuration rejected", region, err)
		}
	}
	for _, region := range []string{"oss-cn-shanghai.aliyuncs.com", "https://oss-cn-shanghai.aliyuncs.com", "oss-cn-shanghai", "cn-shanghai-internal", "上海", "cn_shanghai", "cn-shanghai--invalid"} {
		err := validate(g, Values{"OSS_REGION": region}, false)
		var invalid *ValidationError
		if !errors.As(err, &invalid) || invalid.Field != "OSS_REGION" {
			t.Fatal("invalid OSS configuration has no field-level error", region, err)
		}
	}
}
