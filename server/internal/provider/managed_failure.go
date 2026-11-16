package provider

import (
	"doubo/server/internal/relay"
	"errors"
)

func managedFailure(err error) (relay.ManagedError, bool) {
	var httpErr *relay.HTTPError
	if errors.As(err, &httpErr) && httpErr.Managed.Code != 0 {
		return httpErr.Managed, true
	}
	var rejected *Rejected
	if errors.As(err, &rejected) && rejected.Managed.Code != 0 {
		return rejected.Managed, true
	}
	return relay.ManagedError{}, false
}

func recordManagedFailure(e *Execution, err error, userMessage string) {
	managed, ok := managedFailure(err)
	if !ok {
		return
	}
	e.ErrorCode, e.ErrorType = managed.Code, managed.Type
	e.ErrorAction, e.UpstreamCode, e.UpstreamType = managed.Action, managed.UpstreamCode, managed.UpstreamType
	e.ErrorRetryable = managed.Retryable
	e.ErrorEditable = managed.Editable
	if userMessage != "" {
		e.Error = userMessage
	}
}

func managedSubmitDefinitive(err error, status int) bool {
	if managed, ok := managedFailure(err); ok {
		return managed.Definitive
	}
	return (status >= 400 && status < 500 && status != 408) || status == 503
}

func managedPollTerminal(err error) bool {
	managed, ok := managedFailure(err)
	if !ok {
		return false
	}
	switch managed.Code {
	case 4004, 5001, 5002, 5003, 5004, 5007, 5009, 5010, 5013, 5101, 5102, 5103, 5104:
		return true
	}
	return false
}
