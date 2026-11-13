package api

import (
	"net/http"
	"os"
	"path/filepath"
	"regexp"
)

// Decorative photographs for the mini-program (media/ui-art/<name>.jpg).
// Public and immutable: a changed picture gets a new name or ?v=, so clients
// may cache it for a week. Only plain names are served.
var uiArtName = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)

func (a *Server) uiArtFile(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !uiArtName.MatchString(name) {
		http.NotFound(w, r)
		return
	}
	file := filepath.Join(a.Config.MediaDir, "ui-art", name+".jpg")
	if _, err := os.Stat(file); err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=604800, immutable")
	w.Header().Set("Content-Type", "image/jpeg")
	http.ServeFile(w, r, file)
}
