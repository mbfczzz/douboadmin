package api

import (
	"context"
	"net/http"
	"path/filepath"
	"strings"
)

const projectIcon = "/media/brand/doubo.png"

func (a *Server) brandIcon(ctx context.Context) string {
	if a.Media != nil && a.Media.BrandIcons != nil {
		return a.Media.BrandIcons.URL(ctx, projectIcon)
	}
	return projectIcon
}

// Branding must remain available before login and without database access.
func (a *Server) branding(w http.ResponseWriter, r *http.Request) {
	reply(w, http.StatusOK, map[string]string{"icon": a.brandIcon(r.Context())})
}

func (a *Server) brandIconFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if url := a.brandIcon(r.Context()); strings.HasPrefix(url, "https://") {
		http.Redirect(w, r, url, http.StatusFound)
		return
	}
	http.ServeFile(w, r, filepath.Join(a.Config.MediaDir, "brand", "doubo.png"))
}
