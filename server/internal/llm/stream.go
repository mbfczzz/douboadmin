package llm

import (
	"bufio"
	"encoding/json"
	"io"
	"strings"
)

// chunk is one server-sent event of a streamed reply; the last carries usage.
type chunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
	Usage *Usage `json:"usage"`
}

// readStream collects "data: {…}" events until "data: [DONE]".
func readStream(body io.Reader, onText func(string) error) (string, Usage, error) {
	var text strings.Builder
	var usage Usage
	lines := bufio.NewScanner(body)
	lines.Buffer(make([]byte, 64<<10), 1<<20)
	for lines.Scan() {
		data, ok := strings.CutPrefix(lines.Text(), "data:")
		data = strings.TrimSpace(data)
		if !ok || data == "" {
			continue
		}
		if data == "[DONE]" {
			return text.String(), usage, nil
		}
		var c chunk
		if json.Unmarshal([]byte(data), &c) != nil {
			return "", Usage{}, &Error{Message: "对话模型返回格式无效"}
		}
		if c.Usage != nil {
			usage = *c.Usage
		}
		if len(c.Choices) == 0 || c.Choices[0].Delta.Content == "" {
			continue
		}
		text.WriteString(c.Choices[0].Delta.Content)
		if onText != nil {
			if err := onText(text.String()); err != nil {
				return "", Usage{}, err
			}
		}
	}
	// Ended without [DONE]: the reply was cut off.
	return "", Usage{}, &Error{Message: "对话模型连接中断，请重新发送", Retry: true}
}

func readWhole(body io.Reader) (string, Usage, error) {
	data, _ := io.ReadAll(io.LimitReader(body, 4<<20))
	var reply struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage *Usage `json:"usage"`
	}
	if json.Unmarshal(data, &reply) != nil || len(reply.Choices) == 0 {
		return "", Usage{}, &Error{Message: "对话模型返回格式无效"}
	}
	usage := Usage{}
	if reply.Usage != nil {
		usage = *reply.Usage
	}
	return reply.Choices[0].Message.Content, usage, nil
}
