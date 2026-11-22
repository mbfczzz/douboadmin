package settings

// HotProblem also validates environment-based resource settings at startup.
// Console saves validate the same schema before storing encrypted values.
func HotProblem(v Values) error {
	g, ok := group("hot")
	if !ok {
		return nil
	}
	values := defaults(g)
	for _, field := range g.Fields {
		if value, exists := v[field.Key]; exists {
			values[field.Key] = value
		}
	}
	return validate(g, values, false)
}
