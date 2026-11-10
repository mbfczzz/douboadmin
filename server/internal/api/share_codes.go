package api

import (
	"encoding/base64"
	"net/http"

	"doubo/server/internal/core"
	"doubo/server/internal/partners"
	qrcode "github.com/skip2/go-qrcode"
)

type shareView struct {
	Code string `json:"code"`
	QR   string `json:"qr"` // PNG data URL; users scan it in the mini-program
}

func shareQR(code string) (string, error) {
	png, e := qrcode.Encode(partners.SharePrefix+code, qrcode.Medium, 320)
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(png), e
}

func replyShare(w http.ResponseWriter, v core.PartnerShare, e error) {
	if e != nil {
		partnerError(w, e)
		return
	}
	qr, e := shareQR(v.Code)
	if e != nil {
		fail(w, 503, "二维码生成失败")
		return
	}
	reply(w, 200, shareView{Code: v.Code, QR: qr})
}

// codeKind maps /codes/{kind} (member, s1, s2, bind) to a code kind.
func codeKind(w http.ResponseWriter, r *http.Request) (string, bool) {
	kind, ok := partners.ProviderKinds[r.PathValue("kind")]
	if !ok {
		fail(w, 404, "码类型无效")
	}
	return kind, ok
}

// codeScope: a provider's bind code links its own owner, so only those
// above it (its parents or the platform) see or change it.
func (a *Server) codeScope(w http.ResponseWriter, r *http.Request, kind string) bool {
	if kind == partners.BindCode {
		return a.belowPartner(w, r, r.PathValue("id"))
	}
	return a.inPartnerScope(w, r, r.PathValue("id"))
}

// showCode shows a provider's code of one kind, creating it on first use.
// A used bind code shows the account it bound instead.
func (a *Server) showCode(w http.ResponseWriter, r *http.Request) {
	kind, ok := codeKind(w, r)
	if !ok || !a.codeScope(w, r, kind) {
		return
	}
	v, e := a.Partners.Share(r.Context(), r.PathValue("id"), kind, identity(r).ID)
	if kind == partners.BindCode {
		a.replyBind(w, r, v, e)
		return
	}
	replyShare(w, v, e)
}

// resetCode retires the current code of a kind and issues a new one.
func (a *Server) resetCode(w http.ResponseWriter, r *http.Request) {
	kind, ok := codeKind(w, r)
	if !ok || !a.codeScope(w, r, kind) {
		return
	}
	v, e := a.Partners.ResetShare(r.Context(), r.PathValue("id"), kind, identity(r).ID)
	if kind == partners.BindCode {
		a.replyBind(w, r, v, e)
		return
	}
	replyShare(w, v, e)
}
