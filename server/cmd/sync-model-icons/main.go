// sync-model-icons publishes built-in icons using OSS_* environment variables.
package main

import (
	"context"
	"flag"
	"fmt"
	"image/png"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"doubo/server/internal/media"
	"doubo/server/internal/objectstore"
)

func run() error {
	dir := flag.String("dir", "../media/model-icons", "built-in PNG directory")
	expected := flag.String("bucket", "", "required destination bucket (must match OSS_BUCKET)")
	brand := flag.Bool("brand", false, "publish project branding instead of model icons")
	flag.Parse()
	for _, name := range []string{"OSS_REGION", "OSS_BUCKET", "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET"} {
		if os.Getenv(name) == "" {
			return fmt.Errorf("missing environment variable: %s", name)
		}
	}
	bucket := os.Getenv("OSS_BUCKET")
	if *expected == "" || bucket != *expected {
		return fmt.Errorf("pass -bucket matching OSS_BUCKET to select the destination explicitly")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	objects := objectstore.New(os.Getenv("OSS_REGION"), bucket, os.Getenv("OSS_ACCESS_KEY_ID"), os.Getenv("OSS_ACCESS_KEY_SECRET"))
	icons := media.NewModelIcons(*dir, objects)
	namespace := "model-icons"
	if *brand {
		namespace = "brand"
		icons = media.NewBrandIcons(*dir, objects)
	}
	count, err := icons.Sync(ctx)
	if err != nil {
		return fmt.Errorf("OSS icon synchronization failed after %d icons; check region, bucket and RAM permissions", count)
	}
	entries, err := os.ReadDir(*dir)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 15 * time.Second}
	verified := 0
	for _, entry := range entries {
		if !entry.Type().IsRegular() || filepath.Ext(entry.Name()) != ".png" {
			continue
		}
		url := icons.URL(ctx, "/media/"+namespace+"/"+entry.Name())
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return fmt.Errorf("cannot sign icon: %s", entry.Name())
		}
		response, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("cannot fetch OSS icon: %s", entry.Name())
		}
		decoded, decodeErr := png.Decode(response.Body)
		response.Body.Close()
		if response.StatusCode != http.StatusOK || decodeErr != nil || decoded.Bounds().Empty() {
			return fmt.Errorf("invalid OSS PNG response: %s (HTTP %d)", entry.Name(), response.StatusCode)
		}
		verified++
	}
	fmt.Printf("bucket=%s synchronized=%d verified=%d prefix=system/%s/\n", bucket, count, verified, namespace)
	return nil
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
