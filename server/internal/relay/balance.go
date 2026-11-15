package relay

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
)

type Balance struct {
	Balance float64 `json:"balance"`
	Unit    string  `json:"unit"`
}

// Base includes the Managed prefix when configured (e.g. https://host/managed).
// This reads only the account associated with the existing client key.
func (c *Client) Balance(ctx context.Context) (Balance, error) {
	raw, err := c.Do(ctx, "GET", "/v1/balance", nil)
	if err != nil {
		return Balance{}, err
	}
	var response struct {
		Balance *float64 `json:"balance"`
		Unit    string   `json:"unit"`
	}
	if json.Unmarshal(raw, &response) != nil || response.Balance == nil || response.Unit != "points" || *response.Balance < 0 || math.IsNaN(*response.Balance) || math.IsInf(*response.Balance, 0) {
		return Balance{}, fmt.Errorf("中转站余额响应格式无效")
	}
	return Balance{Balance: *response.Balance, Unit: response.Unit}, nil
}
