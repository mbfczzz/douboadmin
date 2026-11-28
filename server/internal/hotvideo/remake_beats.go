package hotvideo

import (
	"doubo/server/internal/vision"
	"fmt"
	"math"
	"regexp"
	"strings"
)

// A beat is a span of the generated video: the original's shots that land in
// the same seconds once squeezed into its length.
type beat struct {
	from, to int
	parts    []part
}

// part is one shot: what is seen (scene, action, camera; may be shortened)
// and what is said (kept as it was said, swaps never touch it).
type part struct{ scene, action, camera, said string }

// beats lays the shots over the generated seconds. Their own span sets the
// scale (the length the user saw may be rounded or missing), squeezing a
// longer original and stretching a shorter one, so the last beat ends with
// the video.
func beats(shots []vision.Shot, length float64, seconds int, put func(string) string) []beat {
	span := shots[len(shots)-1].End
	if span <= 0 {
		span = length
	}
	scale := 1.0
	if span > 0 {
		scale = float64(seconds) / span
	}
	out := []beat{}
	for _, s := range shots {
		from := min(seconds-1, int(math.Round(s.Start*scale)))
		to := max(from+1, min(seconds, int(math.Round(s.End*scale))))
		p := part{scene: put(s.Scene), action: put(s.Action), camera: s.Camera, said: s.Speech}
		if n := len(out); n > 0 && from < out[n-1].to {
			out[n-1].to = max(out[n-1].to, to)
			out[n-1].parts = append(out[n-1].parts, p)
			continue
		}
		out = append(out, beat{from, to, []part{p}})
	}
	out[len(out)-1].to = seconds
	return out
}

// fitBeats writes the beats under the head. Over the limit each shot is
// shortened alike (lines kept whole) rather than losing the last shots, so
// every second of the video keeps its direction: the action (who does what,
// with the pictures) first, then the scene, then the camera.
func fitBeats(head string, list []beat, limit int) string {
	text := renderBeats(head, list, 0, 0)
	if limit <= 0 || runes(text) <= limit {
		return text
	}
	for keep := 150; keep >= 4; keep-- {
		if text = renderBeats(head, list, keep, 0); runes(text) <= limit {
			return text
		}
	}
	for say := 60; say >= 4; say-- { // lines of dialogue too long for the limit
		if text = renderBeats(head, list, 4, say); runes(text) <= limit {
			return text
		}
	}
	return cut(text, limit)
}

// renderBeats with each shot's description kept within about keep runes and
// its line within say (0: whole).
func renderBeats(head string, list []beat, keep, say int) string {
	lines := []string{head}
	for _, b := range list {
		shots := make([]string, len(b.parts))
		for i, p := range b.parts {
			shots[i] = p.seen(keep)
			if said := p.said; said != "" {
				if say > 0 {
					said = clause(said, say, true)
				}
				shots[i] = joinFilled("，", shots[i], "台词“"+said+"”")
			}
		}
		lines = append(lines, fmt.Sprintf("%d–%d秒：%s", b.from, b.to, strings.Join(shots, "；")))
	}
	return strings.Join(lines, "\n")
}

func (p part) seen(keep int) string {
	if keep == 0 {
		return joinFilled("，", p.scene, p.action, p.camera)
	}
	action := clause(p.action, keep, true)
	if end := pictureEnd(p.action, action); end > 0 {
		action = cut(p.action, end) // every picture in the shot stays in it
	}
	scene := clause(p.scene, keep-runes(action), false)
	camera := clause(p.camera, keep-runes(action)-runes(scene), false)
	return joinFilled("，", scene, action, camera)
}

// joinFilled joins the non-empty parts, each without its own closing
// punctuation (no "门口摆放木质小凳。，").
func joinFilled(sep string, parts ...string) string {
	kept := []string{}
	for _, p := range parts {
		if p = strings.TrimRight(strings.TrimSpace(p), "。.；;，, "); p != "" {
			kept = append(kept, p)
		}
	}
	return strings.Join(kept, sep)
}

func runes(s string) int { return len([]rune(s)) }

var mention = regexp.MustCompile(`@(图片|视频)\d+(中的(人物|商品|主体))?`)

// pictureEnd is where, in runes, the full text's last mention of a picture
// the short text lost ends (0: it lost none).
func pictureEnd(full, short string) int {
	end := 0
	for _, at := range mention.FindAllStringIndex(full, -1) {
		if !strings.Contains(short, full[at[0]:at[1]]) {
			end = runes(full[:at[1]])
		}
	}
	return end
}

// clause shortens to at most n runes, back to the last pause (，、；。) so
// whole phrases stay; with no pause in reach it is dropped, or for the
// action (hard) cut there. Never leaves half a mention ("@图片1中").
func clause(s string, n int, hard bool) string {
	if n <= 0 {
		return ""
	}
	if runes(s) <= n {
		return s
	}
	short := cut(s, n)
	if at := strings.LastIndexAny(short, "，、；。,;"); at > 0 {
		short = short[:at]
	} else if !hard {
		return ""
	}
	for _, at := range mention.FindAllStringIndex(s, -1) {
		if at[0] < len(short) && at[1] > len(short) {
			short = short[:at[0]]
		}
	}
	return strings.TrimRight(short, "，、；：。,;: ")
}
