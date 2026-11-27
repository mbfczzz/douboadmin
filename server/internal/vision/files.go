package vision

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Ark reads a video by link only up to 50 MB. Larger ones (to 512 MB in
// Ark's own storage) are uploaded through the Files API and watched by
// file_id: https://www.volcengine.com/docs/82379/1895586
const (
	URLLimit  = 50 << 20
	FileLimit = 512 << 20
)

// Video is what a model watches: a link it reads itself, or — over URLLimit —
// a file the client uploads first.
type Video struct {
	URL     string
	Size    int64
	Seconds float64 // its length when known (sets the frame rate)
	Open    func(context.Context) (io.ReadCloser, error)
}

// filePoll is how often an uploaded file is checked until Ark has processed it.
var filePoll = 3 * time.Second

// watchFile uploads the video, waits until Ark has read it, watches it and
// deletes the upload (it would otherwise stay a day).
func (c *Client) watchFile(ctx context.Context, v Video) (Breakdown, error) {
	if v.Size > FileLimit {
		return Breakdown{}, fmt.Errorf("视频超过 512 MB，无法拆解")
	}
	id, err := c.upload(ctx, v)
	if err != nil {
		return Breakdown{}, err
	}
	defer c.deleteFile(id)
	if err := c.waitFile(ctx, id); err != nil {
		return Breakdown{}, err
	}
	return c.watch(ctx, map[string]any{"file_id": id})
}

func (c *Client) upload(ctx context.Context, v Video) (string, error) {
	if v.Open == nil {
		return "", fmt.Errorf("视频文件不可读取")
	}
	src, err := v.Open(ctx)
	if err != nil {
		return "", err
	}
	defer src.Close()
	body, form := io.Pipe()
	mw := multipart.NewWriter(form)
	go func() { // streamed: a 500 MB video is never held in memory
		fields := [][2]string{{"purpose", "user_data"}, {"preprocess_configs[video][fps]", strconv.FormatFloat(v.fps(), 'f', -1, 64)},
			{"expire_at", strconv.FormatInt(time.Now().Add(25*time.Hour).Unix(), 10)}}
		if !strings.HasPrefix(c.Model, "ep-") { // the frame policy follows the model that watches
			fields = append(fields, [2]string{"preprocess_configs[video][model]", c.Model})
		}
		for _, f := range fields {
			if err := mw.WriteField(f[0], f[1]); err != nil {
				form.CloseWithError(err)
				return
			}
		}
		part, err := mw.CreateFormFile("file", "video.mp4")
		if err == nil {
			_, err = io.Copy(part, src)
		}
		if err == nil {
			err = mw.Close()
		}
		form.CloseWithError(err)
	}()
	r, err := http.NewRequestWithContext(ctx, "POST", c.endpoint("/files"), body)
	if err != nil {
		body.Close()
		return "", fmt.Errorf("视频理解接口地址无效")
	}
	r.Header.Set("Content-Type", mw.FormDataContentType())
	var file arkFile
	err = c.call(r, &file)
	body.Close()
	if err == nil && file.ID == "" {
		err = fmt.Errorf("视频上传后没有返回文件编号")
	}
	return file.ID, err
}

func (c *Client) waitFile(ctx context.Context, id string) error {
	for {
		r, err := http.NewRequestWithContext(ctx, "GET", c.endpoint("/files/"+id), nil)
		if err != nil {
			return err
		}
		var file arkFile
		if err := c.call(r, &file); err != nil {
			return err
		}
		switch file.Status {
		case "active":
			return nil
		case "failed":
			return fmt.Errorf("视频文件处理失败：%s", clip(file.Error.Message, 120))
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(filePoll):
		}
	}
}

// deleteFile is best effort: Ark removes the file itself after expire_at.
func (c *Client) deleteFile(id string) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if r, err := http.NewRequestWithContext(ctx, "DELETE", c.endpoint("/files/"+id), nil); err == nil {
		_ = c.call(r, nil)
	}
}

type arkFile struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Error  struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (c *Client) endpoint(path string) string { return strings.TrimRight(c.BaseURL, "/") + path }

// call sends an authorised Files API request and decodes its JSON reply.
func (c *Client) call(r *http.Request, out any) error {
	r.Header.Set("Authorization", "Bearer "+c.Key)
	client := c.HTTP
	if client == nil {
		client = &http.Client{} // uploads take minutes; the context bounds them
	}
	res, err := client.Do(r)
	if err != nil {
		return fmt.Errorf("视频理解服务连接失败")
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode/100 != 2 {
		return upstreamError(res.StatusCode, data)
	}
	if out == nil {
		return nil
	}
	if json.Unmarshal(data, out) != nil {
		return fmt.Errorf("视频理解服务返回格式无效")
	}
	return nil
}

// Link is a stored video the model reads by its (signed) link, or that is
// fetched from the same link and uploaded when it is over URLLimit.
func Link(url string, size int64) Video {
	return Video{URL: url, Size: size, Open: func(ctx context.Context) (io.ReadCloser, error) {
		r, err := http.NewRequestWithContext(ctx, "GET", url, nil)
		if err != nil {
			return nil, err
		}
		res, err := http.DefaultClient.Do(r)
		if err != nil {
			return nil, fmt.Errorf("读取视频失败")
		}
		if res.StatusCode != http.StatusOK {
			res.Body.Close()
			return nil, fmt.Errorf("读取视频失败（%d）", res.StatusCode)
		}
		return res.Body, nil
	}}
}
