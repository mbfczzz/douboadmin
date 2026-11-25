package api

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"mime/multipart"
	"net/http/httptest"
	"testing"
)

func uploadRequest(a *Server, token, name string, data []byte) *httptest.ResponseRecorder {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, _ := writer.CreateFormFile("file", name)
	_, _ = part.Write(data)
	_ = writer.Close()
	r := httptest.NewRequest("POST", "/api/assets", &body)
	r.Header.Set("Content-Type", writer.FormDataContentType())
	r.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	a.Handler().ServeHTTP(w, r)
	return w
}

// Videos may be up to 500 MB and keep their length; other files stay at 50 MB.
func TestUploadLimitsAllowLargeVideos(t *testing.T) {
	a, token, _ := setup(t)
	a.Objects = &countingObjects{}
	ftyp := append(binary.BigEndian.AppendUint32(nil, 24), []byte("ftypmp42\x00\x00\x00\x00mp42isom")...)
	padding := 60 << 20
	mdat := append(binary.BigEndian.AppendUint32(nil, uint32(8+padding)), []byte("mdat")...)
	video := append(append(append(ftyp, mp4Of(7)...), mdat...), make([]byte, padding)...)
	w := uploadRequest(a, token, "long.mp4", video)
	var row struct {
		Data struct {
			Type     string  `json:"type"`
			Duration float64 `json:"duration"`
		} `json:"data"`
	}
	if w.Code != 201 || json.Unmarshal(w.Body.Bytes(), &row) != nil || row.Data.Type != "video/mp4" || row.Data.Duration != 7 {
		t.Fatal("60 MB video", w.Code, w.Body.String())
	}
	picture := make([]byte, 51<<20)
	copy(picture, []byte{0xff, 0xd8, 0xff, 0xe0})
	if w := uploadRequest(a, token, "big.jpg", picture); w.Code != 400 {
		t.Fatal("51 MB picture accepted", w.Code)
	}
}
