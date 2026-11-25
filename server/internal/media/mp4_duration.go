package media

import (
	"encoding/binary"
	"errors"
	"io"
)

// ErrNoDuration: the file is not an MP4/MOV with a readable duration.
var ErrNoDuration = errors.New("video duration not found")

// MP4Duration reads a video's length in seconds from its moov box: the movie
// header (mvhd), or the longest track (mdhd) when the header leaves it 0. It
// seeks past media data, so the moov box may sit at the start or the end.
func MP4Duration(r io.ReadSeeker) (float64, error) {
	end, err := r.Seek(0, io.SeekEnd)
	if err != nil {
		return 0, err
	}
	moov, size, err := findBox(r, 0, end, "moov")
	if err != nil {
		return 0, err
	}
	if seconds, err := headerSeconds(r, moov, moov+size, "mvhd"); err == nil && seconds > 0 {
		return seconds, nil
	}
	longest := 0.0
	for at := moov; at < moov+size; {
		trak, tsize, err := findBox(r, at, moov+size, "trak")
		if err != nil {
			break
		}
		if mdia, msize, err := findBox(r, trak, trak+tsize, "mdia"); err == nil {
			if seconds, err := headerSeconds(r, mdia, mdia+msize, "mdhd"); err == nil && seconds > longest {
				longest = seconds
			}
		}
		at = trak + tsize
	}
	if longest <= 0 {
		return 0, ErrNoDuration
	}
	return longest, nil
}

// findBox returns the payload offset and size of the first box named typ
// between from and to.
func findBox(r io.ReadSeeker, from, to int64, typ string) (int64, int64, error) {
	head := make([]byte, 16)
	for at := from; at+8 <= to; {
		if _, err := r.Seek(at, io.SeekStart); err != nil {
			return 0, 0, err
		}
		if _, err := io.ReadFull(r, head[:8]); err != nil {
			return 0, 0, ErrNoDuration
		}
		size, skip := int64(binary.BigEndian.Uint32(head)), int64(8)
		switch size {
		case 1:
			if _, err := io.ReadFull(r, head[8:16]); err != nil {
				return 0, 0, ErrNoDuration
			}
			size, skip = int64(binary.BigEndian.Uint64(head[8:16])), 16
		case 0:
			size = to - at
		}
		if size < skip || at+size > to {
			return 0, 0, ErrNoDuration
		}
		if string(head[4:8]) == typ {
			return at + skip, size - skip, nil
		}
		at += size
	}
	return 0, 0, ErrNoDuration
}

// headerSeconds reads duration / timescale from an mvhd or mdhd box.
func headerSeconds(r io.ReadSeeker, from, to int64, typ string) (float64, error) {
	at, size, err := findBox(r, from, to, typ)
	if err != nil || size < 20 {
		return 0, ErrNoDuration
	}
	b := make([]byte, min(size, 32))
	if _, err := r.Seek(at, io.SeekStart); err != nil {
		return 0, err
	}
	if _, err := io.ReadFull(r, b); err != nil {
		return 0, ErrNoDuration
	}
	var scale, length uint64
	if b[0] == 1 {
		if len(b) < 32 {
			return 0, ErrNoDuration
		}
		scale, length = uint64(binary.BigEndian.Uint32(b[20:24])), binary.BigEndian.Uint64(b[24:32])
	} else {
		scale, length = uint64(binary.BigEndian.Uint32(b[12:16])), uint64(binary.BigEndian.Uint32(b[16:20]))
	}
	if scale == 0 {
		return 0, ErrNoDuration
	}
	return float64(length) / float64(scale), nil
}
