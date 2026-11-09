package api

// Plain names for the mini-program's read requests, so a user's activity
// reads as what they looked at. Reads stay in the api category.
var reads = map[string]string{
	"GET /api/access":          "查询授权状态",
	"GET /api/config":          "读取应用配置",
	"GET /api/favorites":       "查看收藏",
	"GET /api/hot/discovery":   "浏览热门发现",
	"GET /api/hot/history":     "查看热门搜索记录",
	"GET /api/hot/videos":      "搜索热门视频",
	"GET /api/hot/videos/{id}": "查看热门视频",
	"GET /api/jobs":            "查看生成任务",
	"GET /api/jobs/estimate":   "估算生成积分",
	"GET /api/jobs/{id}":       "查看任务详情",
	"GET /api/me":              "查看个人资料",
	"GET /api/notifications":   "查看通知",
	"GET /api/orders":          "查看充值订单",
	"GET /api/orders/{id}":     "查看订单详情",
	"GET /api/preferences":     "读取偏好设置",
	"GET /api/shares/{token}":  "打开分享作品",
	"GET /api/templates":       "浏览模板",
	"GET /api/templates/{id}":  "查看模板详情",
	"GET /api/wallet":          "查看积分余额",
	"GET /api/wallet/ledger":   "查看积分明细",
	"GET /api/works":           "查看作品",
}
