package media

import (
	"encoding/binary"
	"io"
)

// MP4Shape reads a video's displayed width and height from its track header
// (tkhd): the first track with a picture, turned when the track's matrix
// rotates it by 90° (a phone held upright records landscape plus a turn).
func MP4Shape(r io.ReadSeeker) (int, int, error) {
	end, err := r.Seek(0, io.SeekEnd)
	if err != nil {
		return 0, 0, err
	}
	moov, size, err := findBox(r, 0, end, "moov")
	if err != nil {
		return 0, 0, err
	}
	for at := moov; at < moov+size; {
		trak, tsize, err := findBox(r, at, moov+size, "trak")
		if err != nil {
			break
		}
		if w, h, ok := trackShape(r, trak, trak+tsize); ok {
			return w, h, nil
		}
		at = trak + tsize
	}
	return 0, 0, ErrNoDuration
}

// trackShape: tkhd ends with the 3×3 matrix (36 bytes) then width and height
// (16.16 fixed point); a and d both 0 in the matrix mean a quarter turn.
func trackShape(r io.ReadSeeker, from, to int64) (int, int, bool) {
	at, size, err := findBox(r, from, to, "tkhd")
	if err != nil || size < 84 || size > 128 {
		return 0, 0, false
	}
	b := make([]byte, size)
	if _, err := r.Seek(at, io.SeekStart); err != nil {
		return 0, 0, false
	}
	if _, err := io.ReadFull(r, b); err != nil {
		return 0, 0, false
	}
	matrix, dims := b[len(b)-44:len(b)-8], b[len(b)-8:]
	w, h := int(binary.BigEndian.Uint32(dims[0:4])>>16), int(binary.BigEndian.Uint32(dims[4:8])>>16)
	if w == 0 || h == 0 {
		return 0, 0, false // an audio track
	}
	if binary.BigEndian.Uint32(matrix[0:4]) == 0 && binary.BigEndian.Uint32(matrix[16:20]) == 0 {
		w, h = h, w
	}
	return w, h, true
}
