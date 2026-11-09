package api

import (
	"html/template"
	"net/http"
)

var sharePage = template.Must(template.New("work").Parse(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>{{.Title}} · 豆播</title><style>
body{margin:0;background:#111615;color:#e7ece8;font:16px/1.6 system-ui,sans-serif}main{max-width:720px;margin:0 auto;padding:24px}header{font-size:14px;color:#9bcbaa;margin-bottom:22px}h1{font-size:22px;overflow-wrap:anywhere}img,video{display:block;max-width:100%;max-height:72vh;margin:20px auto;border-radius:12px}p{color:#aab7af;white-space:pre-wrap;overflow-wrap:anywhere}footer{margin-top:32px;color:#7f8b84;font-size:12px}
</style></head><body><main><header>豆播 AI · 作品分享</header><h1>{{.Title}}</h1>{{if eq .Kind "image"}}<img src="{{.Result}}" alt="分享的作品">{{else}}<video src="{{.Result}}" controls playsinline preload="metadata"></video>{{end}}{{if .Prompt}}<p>{{.Prompt}}</p>{{end}}<footer>此作品由用户主动分享。链接失效或作品被移除后将无法继续访问。</footer></main></body></html>`))

func (a *Server) shareHTML(w http.ResponseWriter, r *http.Request) {
	data, e := a.shared(r)
	if e != nil {
		http.Error(w, "分享已失效或作品不可用", 404)
		return
	}
	a.countWebView(w, r, "/s/*")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; img-src 'self' https:; media-src 'self' https:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'")
	_ = sharePage.Execute(w, data)
}
