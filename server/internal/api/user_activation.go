package api

import "net/http"

// userActivation shows how a mini-program user was activated: direct access or
// a provider code, the provider chain and the redeemed code.
func (a *Server) userActivation(w http.ResponseWriter, r *http.Request) {
	out, err := a.Partners.Source(r.Context(), r.PathValue("id"))
	if err != nil {
		dbError(w, err)
		return
	}
	reply(w, 200, out)
}
