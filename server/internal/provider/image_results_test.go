package provider

import (
	"context"
	"doubo/server/internal/core"
	"errors"
	"fmt"
	"net/http"
	"reflect"
	"testing"
)

func TestImageResultsKeepAllImagesAndRejectUnsafeOutputs(t *testing.T) {
	want := []string{"https://cdn.test/1.png", "https://cdn.test/2.png", "https://cdn.test/3.png", "https://cdn.test/4.png"}
	objects := []map[string]string{}
	for _, u := range want {
		objects = append(objects, map[string]string{"url": u})
	}
	for _, payload := range []any{
		map[string]any{"output_urls": want},
		map[string]any{"data": objects},
		map[string]any{"output_url": "https://cdn.test/cover.png", "data": objects},
		map[string]any{"output_url": "https://cdn.test/cover.png", "result": map[string]any{"images": objects}},
		map[string]any{"status": "succeeded", "result": map[string]any{"images": objects}},
		map[string]any{"data": map[string]any{"outputs": want}},
	} {
		result, err := Parse(core.Data(payload), "image")
		refs, parseErr := core.ResultRefs(result.Result)
		if err != nil || parseErr != nil || !reflect.DeepEqual(refs, want) {
			t.Fatal(result, err, parseErr)
		}
	}
	r, err := Parse([]byte(`{"data":[{"b64_json":"first"},{"b64_json":"second"}]}`), "image")
	refs, _ := core.ResultRefs(r.Result)
	if err != nil || len(refs) != 2 || refs[1] != "data:;base64,second" {
		t.Fatal(r, err)
	}
	for _, unsafe := range []string{"http://cdn.test/2.png", "file:///etc/passwd", "https://user:pass@cdn.test/2.png"} {
		if _, err = Parse(core.Data(map[string]any{"output_urls": []string{want[0], unsafe}}), "image"); err == nil {
			t.Fatal("unsafe secondary image accepted")
		}
	}
	r, err = Parse(core.Data(map[string]any{"output_url": want[0]}), "image")
	if err != nil || r.Result != want[0] {
		t.Fatal("single-image compatibility lost")
	}
}

func TestMultiImageSaveRetryDoesNotResubmitOrLoseOutputs(t *testing.T) {
	posts := 0
	urls := []string{"https://cdn.test/1.png", "https://cdn.test/2.png", "https://cdn.test/3.png", "https://cdn.test/4.png"}
	p, j := fixture(t, func(w http.ResponseWriter, r *http.Request) {
		posts++
		_, _ = w.Write(core.Data(map[string]any{"output_urls": urls}))
	})
	attempts := 0
	p.SaveResult = func(_ context.Context, _ core.Job, result string) (string, error) {
		refs, err := core.ResultRefs(result)
		if err != nil || !reflect.DeepEqual(refs, urls) {
			t.Fatal("lost pending outputs", refs, err)
		}
		attempts++
		if attempts == 1 {
			return "", fmt.Errorf("temporary storage failure")
		}
		return core.PackResults([]string{"asset:1", "asset:2", "asset:3", "asset:4"}), nil
	}
	if _, err := p.Generate(t.Context(), j); !errors.Is(err, ErrRetryLater) {
		t.Fatal(err)
	}
	out, err := p.Generate(t.Context(), j)
	refs, _ := core.ResultRefs(out)
	if err != nil || len(refs) != 4 || posts != 1 || attempts != 2 {
		t.Fatal(out, err, posts, attempts)
	}
	if again, err := p.Generate(t.Context(), j); err != nil || again != out || attempts != 2 {
		t.Fatal("completed result saved twice", err)
	}
}
