# 支付、数据与通知的可配置接入

本地配置写入 Git 忽略的 `.env.local`，Docker 使用 `.env`。完整变量示例在根目录 `.env.example`。不要把服务密钥写进小程序、管理端或接口响应。修改连接配置后重启 API 与 Worker，业务规则在后台“系统设置”保存即可生效。

| 能力 | 配置 | 未配置时的表现 |
| --- | --- | --- |
| 微信支付 APIv3 | WECHAT_APP_ID、WECHAT_PAY_MCH_ID、WECHAT_PAY_CERT_SERIAL、WECHAT_PAY_API_V3_KEY、WECHAT_PAY_PRIVATE_KEY_PATH、WECHAT_PAY_PUBLIC_KEY_ID、WECHAT_PAY_PUBLIC_KEY_PATH、WECHAT_PAY_NOTIFY_URL、WECHAT_PAY_REFUND_NOTIFY_URL | 不创建充值订单、不调用支付；已有积分账本仍可用 |
| 抖音数据（TikHub） | TIKHUB_BASE_URL 默认 https://api.tikhub.io，TIKHUB_API_KEY | 热门视频页面提示未配置，提供上传自有素材入口 |
| 完成订阅消息 | WECHAT_COMPLETION_TEMPLATE_ID、WECHAT_COMPLETION_FIELDS | 仍保存站内通知，不申请未配置的订阅模板 |
| 外部异常通知 | ALERT_WEBHOOK_URL | 告警仍可在后台查看 |
| 公网分享 | PUBLIC_BASE_URL=https://实际域名 | 可访问小程序分享页，本地短链不宣称可公网访问 |

## 微信支付

1. 先确认商户与小程序关联、业务类目及积分业务获准使用的支付产品。本实现为普通商户 APIv3 JSAPI，虚拟支付产品需要独立适配，不能只替换商户号。iOS 默认关闭。
2. 将商户私钥及微信支付公钥放在服务端只读路径。Docker 对应 `deploy/secrets/` → `/run/secrets/`；公开密钥 ID 与文件应配套，APIv3 密钥长度 32 字符。
3. 设置通知地址 `https://实际域名/api/payments/wechat/notify` 和退款地址 `https://实际域名/api/payments/wechat/refund-notify`；需真实公网 HTTPS。
4. 重启后在后台确认“微信支付：已配置”；设兑换率、最低/最高充值金额，再开启充值。扣减积分是独立开关，按需开启。
5. 真机小额验收：支付成功/取消/断网、重复通知、查单补到账、全额退款。没有真实商户凭证时，只能验证协议与账本测试，不能标记实付通过。

每元积分兑换在订单创建时固定。充值到账、生成扣减和退款均有可追溯流水。管理后台退款页显示的是最终可信状态，申请受理不等于退款成功。自动补单按共享游标轮询未结算记录，故障订单不会挡住后续查询。

## 抖音

TikHub 适配已核对其 OpenAPI：搜索 `POST /api/v1/douyin/search/fetch_video_search_v2`，详情 `fetch_one_video`，热词 `fetch_hot_search_list`。后端缓存上游结果；播放量仅对返回页面内已提供数据排序。账号实际权限、数据字段与下载链接需要凭证到位后验证。

## 混剪界面与通知

小程序混剪界面保留，生成服务暂未开放。后台音乐管理、混剪专用配置及服务器视频合成代码已移除。

WECHAT_COMPLETION_FIELDS 为 JSON 对象，键名来自获批模板，值可使用 `{{title}}`、`{{jobId}}`、`{{state}}`、`{{time}}`。用户在“设置”主动授权后才尝试发送。微信拒绝或网络结果未知会记录失败/未确认，不盲目重复发送；获取 access token 失败可以重试。站内通知和微信订阅待发送记录在任务事务中独立生成，两个偏好互不影响；推送通过游标读取最近 24 小时未尝试发送的记录，不受站内消息列表上限影响。

生产配置、域名、OSS/CDN、备案与提审待办见 [release-checklist.md](release-checklist.md)。
