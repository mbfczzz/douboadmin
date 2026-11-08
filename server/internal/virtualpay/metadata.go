package virtualpay

import (
	"encoding/json"
	"io"
	"strings"
)

// Legacy responses contain the raw attach value. WeChat also returns the
// signed attach inside a JSON object in biz_meta; bind both forms to this order.
func paymentMetaMatches(raw, id string) bool {
	if id == "" {
		return false
	}
	if raw == id {
		return true
	}
	d := json.NewDecoder(strings.NewReader(raw))
	opening, err := d.Token()
	if err != nil || opening != json.Delim('{') || !d.More() {
		return false
	}
	key, err := d.Token()
	if err != nil || key != "attach" {
		return false
	}
	var attach string
	if d.Decode(&attach) != nil || attach != id || d.More() {
		return false
	}
	closing, err := d.Token()
	return err == nil && closing == json.Delim('}') && d.Decode(new(any)) == io.EOF
}
