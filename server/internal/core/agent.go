package core

import (
	"fmt"
	"strings"
	"time"
)

// AgentSession is one 创作项目 in the Agent: a skill, its materials, and the
// chat / generation jobs that carry its id (JobInput.SessionID).
type AgentSession struct {
	Title    string    `json:"title"`
	Skill    string    `json:"skill"`
	Assets   []string  `json:"assets"` // numbered per type in order: 图片1…, 视频1…
	Deleted  bool      `json:"deleted,omitempty"`
	ActiveAt time.Time `json:"activeAt"` // last new job, for ordering
}

const MaxAgentAssets = 9

// AgentSkill is what a project sets out to make. The instruction steers the
// chat model; every skill ends a reply with the same ```plan contract so the
// mini-program can show it as a card and generate from it.
type AgentSkill struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Hint        string   `json:"hint"`
	Icon        string   `json:"icon"`
	Kind        string   `json:"kind"` // what the plan generates: video or image
	Starter     string   `json:"starter"`
	Examples    []string `json:"examples"`  // what to say first, in an empty project
	FollowUps   []string `json:"followUps"` // quick revisions under the newest reply
	Instruction string   `json:"-"`
}

var AgentSkills = []AgentSkill{
	{ID: "product", Name: "商品带货视频", Hint: "上传商品图，生成带剧情的种草视频", Icon: "shop", Kind: "video",
		Starter:     "帮我做一条 15 秒的商品种草视频，突出",
		Instruction: "技能：商品带货视频。需要至少 1 张商品图，没有就先请用户上传。结构：前 3 秒用痛点或反差抓人，中段展示商品外观、使用过程和卖点，结尾给出行动引导。商品外观必须与 @图片 中一致。"},
	{ID: "store", Name: "探店视频", Hint: "门头、环境、菜品照片编排成探店短片", Icon: "location", Kind: "video",
		Starter:     "帮我做一条探店视频，店名和特色是",
		Instruction: "技能：探店视频。需要门头、环境或菜品照片，按顺序编排到镜头里（门头开场→环境→招牌菜特写→人物体验→结尾地址或优惠引导）。每个镜头尽量对应一张素材。"},
	{ID: "image", Name: "图片创作", Hint: "海报、主图、场景图，可带参考图", Icon: "image", Kind: "image",
		Starter:     "帮我做一张",
		Instruction: "技能：图片创作。方案 kind 为 image，不需要 shots 和 duration；prompt 写清主体、场景、光线、构图、风格和画面文字。有参考图时说明保留参考图中的哪些要素。"},
	{ID: "general", Name: "自由创作", Hint: "说说想法，一起策划视频或图片", Icon: "chat", Kind: "video",
		Starter:     "",
		Instruction: "技能：自由创作。根据用户想法判断做视频还是图片。"},
}

func AgentSkillByID(id string) (AgentSkill, bool) {
	for _, s := range AgentSkills {
		if s.ID == id {
			return s, true
		}
	}
	return AgentSkill{}, false
}

const agentContract = "你是豆播的创作助手，帮助用户把想法变成可以直接生成的视频或图片。\n" +
	"先用一两句话回应用户，再在回复最后给出创作方案。方案放在一个 ```plan 代码块里，只含一个 JSON 对象：\n" +
	`{"kind":"video 或 image","title":"不超过 16 字","duration":视频秒数,"ratio":"9:16、16:9、1:1、3:4 或 4:3","prompt":"直接交给生成模型的完整画面描述，用 @图片1、@视频1 引用本项目素材","shots":[{"time":"0-3秒","scene":"画面与动作","asset":"使用的素材，如 图片1，没有则留空","line":"口播或字幕，没有则留空"}]}` + "\n" +
	"规则：视频默认 15 秒、9:16，shots 按时间覆盖整条视频，3–6 个；prompt 不超过 800 字，按时间顺序写清每个镜头。" +
	"整条回复只写一个方案代码块，JSON 必须合法（双引号、无注释、无多余逗号）。" +
	"用户要求修改时只改被要求的部分，其余保持上一版不变，并输出完整的新方案。缺少必需信息或素材时先追问，这一轮不输出方案。不要编造素材里没有的商品外观或品牌。"

// AgentSystemPrompt is the system message for a project's chat turns.
// counts is how many of each material type the project has, by "image" / "video".
func AgentSystemPrompt(skill AgentSkill, counts map[string]int) string {
	b := strings.Builder{}
	b.WriteString(agentContract)
	b.WriteString("\n" + skill.Instruction)
	names := []string{}
	for _, t := range []struct{ kind, label string }{{"image", "图片"}, {"video", "视频"}} {
		for i := 1; i <= counts[t.kind]; i++ {
			names = append(names, fmt.Sprintf("%s%d", t.label, i))
		}
	}
	if len(names) == 0 {
		b.WriteString("\n本项目还没有素材。")
	} else {
		b.WriteString("\n本项目素材：" + strings.Join(names, "、") + "。")
	}
	return b.String()
}
