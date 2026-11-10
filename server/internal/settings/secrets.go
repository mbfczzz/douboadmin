package settings

// SealSecret encrypts one value with the integration key, bound to purpose,
// for secrets that must be shown again later (never for login checks).
func (m *Manager) SealSecret(purpose, value string) (string, error) {
	key, err := m.encryptionKey(false)
	if err != nil {
		return "", err
	}
	raw, err := seal("secret/"+purpose, Values{"value": value}, key)
	return string(raw), err
}

// OpenSecret decrypts a value sealed for the same purpose.
func (m *Manager) OpenSecret(purpose, sealed string) (string, error) {
	key, err := m.encryptionKey(true)
	if err != nil {
		return "", err
	}
	values, err := open("secret/"+purpose, []byte(sealed), key)
	return values["value"], err
}
