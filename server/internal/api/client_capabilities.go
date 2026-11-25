package api

import (
	"doubo/server/internal/core"
	"net/http"
	"strings"
)

const (
	capabilityHeader           = "X-Doubo-Capabilities"
	capabilityVisitorBrowse    = "visitor-browse-v1"
	capabilityVideoTokenPrice  = "video-token-pricing-v1"
	capabilityReferenceBilling = "reference-video-billing-v1"
)

func clientCapability(r *http.Request, capability string) bool {
	values := strings.FieldsFunc(r.Header.Get(capabilityHeader), func(char rune) bool {
		return char == ',' || char == ' ' || char == '\t'
	})
	for _, value := range values {
		if value == capability {
			return true
		}
	}
	return false
}

func clientSupportsModel(r *http.Request, model core.Model) bool {
	if _, ark := core.ArkVideo(model.Key); ark && !clientCapability(r, capabilityVideoTokenPrice) {
		return false
	}
	return !model.Settings.ReferenceVideoBilling || clientCapability(r, capabilityReferenceBilling)
}
