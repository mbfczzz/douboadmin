package settings

// FileOnlyProblem reports the first invalid value in a group set only in the
// environment file (热门视频接口). The admin console cannot flag it, so the
// server logs it at startup; the bad value falls back to its default.
func FileOnlyProblem(v Values) error {
	for _, g := range definitions {
		if g.FileOnly {
			if err := validate(g, v, false); err != nil {
				return err
			}
		}
	}
	return nil
}
