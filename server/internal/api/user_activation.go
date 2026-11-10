package api

import "net/http"

// userActivation shows how a mini-program user was activated: direct access or
// a provider share code and the provider chain.
func (a *Server) userActivation(w http.ResponseWriter, r *http.Request) {
	out, err := a.Partners.Source(r.Context(), r.PathValue("id"))
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, out)
}
