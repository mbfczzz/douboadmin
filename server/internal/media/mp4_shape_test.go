package media

import (
	"bytes"
	"encoding/binary"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// tkhd builds a version-0 track header payload with its matrix and size.
func tkhd(w, h uint32, turned bool) []byte {
	b := make([]byte, 84)
	matrix := b[40:76]
	if turned { // a = d = 0, b = 1, c = -1
		binary.BigEndian.PutUint32(matrix[4:], 1<<16)
		binary.BigEndian.PutUint32(matrix[12:], 0xFFFF0000)
	} else {
		binary.BigEndian.PutUint32(matrix[0:], 1<<16)
		binary.BigEndian.PutUint32(matrix[16:], 1<<16)
	}
	binary.BigEndian.PutUint32(matrix[32:], 1<<30)
	binary.BigEndian.PutUint32(b[76:], w<<16)
	binary.BigEndian.PutUint32(b[80:], h<<16)
	return b
}

func TestMP4ShapeReadsThePictureTrack(t *testing.T) {
	audio := box("trak", box("tkhd", tkhd(0, 0, false)))
	cases := map[string]struct {
		file []byte
		w, h int
	}{
		"landscape after audio": {box("moov", audio, box("trak", box("tkhd", tkhd(1440, 1080, false)))), 1440, 1080},
		"phone held upright":    {box("moov", box("trak", box("tkhd", tkhd(1920, 1080, true)))), 1080, 1920},
	}
	for name, c := range cases {
		if w, h, err := MP4Shape(bytes.NewReader(c.file)); err != nil || w != c.w || h != c.h {
			t.Fatal(name, w, h, err)
		}
	}
	if _, _, err := MP4Shape(bytes.NewReader(box("moov", audio))); err == nil {
		t.Fatal("an audio-only file has no shape")
	}
}

func TestMP4ShapeOfARealVideo(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not installed")
	}
	path := filepath.Join(t.TempDir(), "v.mp4")
	if out, err := exec.Command("ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=96x64:rate=10:duration=1",
		"-f", "lavfi", "-i", "sine=duration=1", "-c:v", "libx264", "-shortest", path).CombinedOutput(); err != nil {
		t.Skip(string(out))
	}
	f, _ := os.Open(path)
	defer f.Close()
	if w, h, err := MP4Shape(f); err != nil || w != 96 || h != 64 {
		t.Fatal(w, h, err)
	}
}
