package partners

import "fmt"

type RuleError struct{ Message string }

func (e *RuleError) Error() string { return e.Message }
func rulef(format string, args ...any) error {
	return &RuleError{Message: fmt.Sprintf(format, args...)}
}
