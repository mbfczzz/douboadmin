package partners

import (
	"doubo/server/internal/core"
	"doubo/server/internal/store"
	"errors"
)

// The caller holds the user wallet lock, matching suspension and unbind transactions.
func AuthorizePayment(tx store.Transaction, user string, requireActivation bool) (core.Access, error) {
	_, err := enabledProfile(tx, user)
	if err != nil {
		if !requireActivation && errors.Is(err, core.ErrNotFound) {
			return core.Access{Active: true}, nil // Legacy private sessions can predate profiles.
		}
		return core.Access{}, err
	}
	if !requireActivation {
		return core.Access{Active: true}, nil
	}
	if err := Lock(tx); err != nil {
		return core.Access{}, err
	}
	current, err := access(tx, user)
	if err != nil {
		return current, err
	}
	if !current.Active {
		return current, core.ErrActivationRequired
	}
	return current, nil
}
