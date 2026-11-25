package media

import (
	"bytes"
	"encoding/binary"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func box(typ string, body ...[]byte) []byte {
	payload := bytes.Join(body, nil)
	out := binary.BigEndian.AppendUint32(nil, uint32(8+len(payload)))
	return append(append(out, typ...), payload...)
}

// header builds an mvhd / mdhd payload of the given version.
func header(version byte, scale uint32, length uint64) []byte {
	if version == 1 {
		b := make([]byte, 32)
		b[0] = 1
		binary.BigEndian.PutUint32(b[20:], scale)
		binary.BigEndian.PutUint64(b[24:], length)
		return b
	}
	b := make([]byte, 20)
	binary.BigEndian.PutUint32(b[12:], scale)
	binary.BigEndian.PutUint32(b[16:], uint32(length))
	return b
}

func TestMP4DurationReadsTheMovieHeader(t *testing.T) {
	mdat := box("mdat", make([]byte, 4096))
	cases := map[string]struct {
		file []byte
		want float64
	}{
		"moov first":       {append(box("moov", box("mvhd", header(0, 1000, 7250))), mdat...), 7.25},
		"moov after mdat":  {append(append(box("ftyp", []byte("isom")), mdat...), box("moov", box("mvhd", header(0, 600, 3000)))...), 5},
		"version 1 header": {box("moov", box("mvhd", header(1, 90000, 900000))), 10},
		"longest track":    {box("moov", box("mvhd", header(0, 1000, 0)), box("trak", box("mdia", box("mdhd", header(0, 30, 90)))), box("trak", box("mdia", box("mdhd", header(0, 48000, 528000))))), 11},
	}
	for name, c := range cases {
		got, err := MP4Duration(bytes.NewReader(c.file))
		if err != nil || got != c.want {
			t.Fatal(name, got, err)
		}
	}
	for name, file := range map[string][]byte{"not mp4": []byte("hello world, no boxes"), "no moov": mdat, "bad size": {0, 0, 0, 99, 'm', 'o', 'o', 'v'}} {
		if _, err := MP4Duration(bytes.NewReader(file)); err == nil {
			t.Fatal(name, "read a length")
		}
	}
}

func TestMP4DurationOfARealVideo(t *testing.T) {
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not installed")
	}
	path := filepath.Join(t.TempDir(), "v.mp4")
	if out, err := exec.Command("ffmpeg", "-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=64x48:rate=10:duration=3",
		"-c:v", "libx264", path).CombinedOutput(); err != nil {
		t.Skip(string(out))
	}
	f, _ := os.Open(path)
	defer f.Close()
	if got, err := MP4Duration(f); err != nil || got < 2.9 || got > 3.1 {
		t.Fatal(got, err)
	}
}
