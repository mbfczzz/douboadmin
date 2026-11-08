package settings

// KeyFileError contains an operator-safe message, never raw OS errors or values.
type KeyFileError struct {
	message string
}

func (e *KeyFileError) Error() string { return e.message }

func keyFileError(message string) error { return &KeyFileError{message: message} }
