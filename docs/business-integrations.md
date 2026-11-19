# 支付、数据与通知的可配置接入

微信登录、虚拟支付、OSS、中转站、TikHub、订阅消息和告警可在「系统设置 → 服务接入配置」加密保存到数据库，填写步骤和备份规则见[后台接入配置](admin-integration-settings.md)。修改连接配置后重启 API 与 Worker，业务规则仍在后台保存即生效。环境配置继续兼容：本地使用 Git 忽略的 `.env.local`，原生部署使用 `/etc/doubo/doubo.env`。不要将服务密钥放入小程序、构建包或接口响应。

| 能力 | 配置 | 未配置时的表现 |
| --- | --- | --- |
| 微信支付 APIv3 | WECHAT_APP_ID、WECHAT_PAY_MCH_ID、WECHAT_PAY_CERT_SERIAL、WECHAT_PAY_API_V3_KEY、WECHAT_PAY_PRIVATE_KEY_PATH、WECHAT_PAY_PUBLIC_KEY_ID、WECHAT_PAY_PUBLIC_KEY_PATH、WECHAT_PAY_NOTIFY_URL、WECHAT_PAY_REFUND_NOTIFY_URL | 不创建充值订单、不调用支付；已有积分账本仍可用 |
| 抖音数据（TikHub） | TIKHUB_BASE_URL 默认 https://api.tikhub.io，TIKHUB_API_KEY | 热门视频页面提示未配置，提供上传自有素材入口 |
| 完成订阅消息 | WECHAT_COMPLETION_TEMPLATE_ID、WECHAT_COMPLETION_FIELDS | 仍保存站内通知，不申请未配置的订阅模板 |
| 外部异常通知 | ALERT_WEBHOOK_URL | 告警仍可在后台查看 |
| 公网分享 | PUBLIC_BASE_URL=https://实际域名 | 可访问小程序分享页，本地短链不宣称可公网访问 |

## 微信支付

1. 先确认商户与小程序关联、业务类目及积分业务获准使用的支付产品。普通商户 APIv3 JSAPI 与[微信虚拟支付](virtual-payment.md)均有独立实现，不能只替换商户号。iOS 默认关闭。
2. 将商户私钥及微信支付公钥放在服务端只读路径。Docker 对应 `deploy/secrets/` → `/run/secrets/`；公开密钥 ID 与文件应配套，APIv3 密钥长度 32 字符。
3. 设置通知地址 `https://实际域名/api/payments/wechat/notify` 和退款地址 `https://实际域名/api/payments/wechat/refund-notify`；需真实公网 HTTPS。
4. 重启后在后台确认“微信支付：已配置”，并检查积分套餐的商品 ID、售价和到账积分。充值由支付通道配置决定，生成按模型定价扣费；原业务设置的兑换率、充值范围及开关已移除。
5. 真机小额验收：支付成功/取消/断网、重复通知、查单补到账、全额退款。没有真实商户凭证时，只能验证协议与账本测试，不能标记实付通过。

每元积分兑换在订单创建时固定。充值到账、生成扣减和退款均有可追溯流水。管理后台退款页显示的是最终可信状态，申请受理不等于退款成功。自动补单按共享游标轮询未结算记录，故障订单不会挡住后续查询。

### 小程序充值与创作积分

- 「我的」「创作」「任务详情」显示服务端实际可用积分、预留积分，并提供积分/充值入口。回到页面会重新读取；存在预留时每 3 秒刷新，其他情况每 15 秒刷新，离开页面停止。
- 「我的积分」输入金额后调用微信支付。支付窗口成功只表示提交完成，必须等服务端验签通知或查单确认后才显示「积分已到账」。到账确认中禁止再次发起同一轮充值；退出页面后返回会继续查询。
- 待确认状态按用户和订单分别保存，兼容旧版单笔记录。订单列表分别确认多笔订单，结算一笔不会清除另一笔；待确认订单不会再次打开支付窗口。新支付取消后清除上一笔成功提示。
- 钱包页存在预留积分时每 3 秒重新读取余额及流水，任务成功、失败退回或退款结算后自动更新；预留清零或离开页面后停止刷新。积分卡片返回后可继续打开钱包，连续快速点击仍防重。
- 支付后短暂断网保留订单，不在本地虚增余额；可以在充值订单查看结果。取消支付保留未支付订单供继续支付，过期订单不再显示继续支付按钮。
- 创作前校验模型参数并确认积分；提交任务时从可用积分中预留，成功后结算预留，明确失败则退回。上游结果未知时仍保留预留，交由对账或管理员核实，不能直接当作失败退款。
- 示例：余额 1000 积分，提交 25 积分任务后显示可用 975、预留 25；成功后显示可用 975、预留 0；失败退回后可用恢复 1000。积分流水中的「结算」不是再次扣可用余额。
- 管理后台必须分别开启「充值」和「生成扣费」，并配置模型积分。模型档位留空使用基础积分，显式填写 0 表示免费。小程序直接申请开通的普通用户与服务商激活用户均可按规则消费积分。

隔离回归：在 `miniprogram` 运行 `npm run test:payment`；在 `server` 运行 `go test ./internal/api ./internal/billing ./internal/payments ./internal/store`。API 支付链路用测试RSA密钥和加密签名通知验证到账及幂等，不产生真实付款。MySQL跨实例测试需要单独的 `MYSQL_TEST_DSN`，不会自动使用业务数据库。

## 抖音

TikHub 适配已核对其 OpenAPI：搜索 `POST /api/v1/douyin/search/fetch_video_search_v2`，详情 `fetch_one_video`，热词 `fetch_hot_search_list`。后端缓存上游结果；播放量仅对返回页面内已提供数据排序。账号实际权限、数据字段与下载链接需要凭证到位后验证。

创作页视频流：默认取抖音视频热榜 `POST /api/v1/douyin/billboard/fetch_hot_total_video_list`（近 7 天、视频总榜 `sub_type=1001`，每页 20 条，按标签关键词过滤，「热门」不过滤）；后台「创作页视频来源」可切回关键词搜索 `fetch_video_search_v2`（`HOT_FEED_SOURCE=search`，重启生效），两种来源分开缓存。TikHub 未写明返回格式，解析兼容 `objs` / `list` 等常见结构，读不懂时记 `tikhub billboard reply not understood` 警告并附返回开头。创作关键词在后台「服务接入配置 → 热门视频接口 → 创作页关键词」设置（`HOT_FEED_KEYWORDS`，保存后重启生效；经 `GET /api/hot/discovery?words=0` 下发）首页结果存 Redis（`doubo:hot:feed:*`），有效 1 小时；API 进程每分钟检查，结果满 59 分钟即提前刷新，多实例用 Redis 锁保证每个关键词只刷新一次；刷新失败保留旧数据（最长 2 小时）并在下一分钟重试，失败写入 `hot feed refresh failed` 警告日志。未配置 Redis 时退回数据库缓存（30 分钟）。

一键复刻视频拆解：后台「服务接入配置 → 视频理解」配置 OpenAI 兼容的视频理解接口（默认火山方舟 `https://ark.cn-beijing.volces.com/api/v3`，模型 `doubao-seed-1-6-vision-250815`）。复刻在任务队列中进行：复刻页以 `POST /api/hot/videos/{id}/import`（`purpose=remake`，附用户替换图片、原视频标题/文案/时长）创建导入任务，Worker 先把无水印原视频存入用户素材，再以其 OSS 签名地址调用 `chat/completions`（`video_url`，fps=1，方舟要求 URL 方式视频 ≤50MB），输出钩子、结构、卖点、风格、音乐和 3–12 个分镜。结果按「模型 + 抖音视频 ID」存入 `hot_breakdowns` 表并全员共用；同一视频并发准备时只调用一次模型，其余等待其结果；失败或超过 5 分钟未完成的可重新发起。任务就绪后，任务详情「生成同款」读取 `GET /api/hot/videos/{id}/breakdown`，自动选支持参考视频的模型与最接近原视频的时长，按拆解结果拼出分时段描述，确认积分后直接提交视频生成；「调整后再生成」打开编辑页复刻预设。未配置、失败或视频过大时复刻照常进行，只参考视频文案。拆解费用由平台承担。

分享链接与无水印原视频（文案提取、一键复刻）：

- 分享链接：链接里已带作品 ID 时直接用详情接口；短链接（`v.douyin.com`）交给 `GET /api/v1/douyin/app/v3/fetch_one_video_by_share_url`，返回空时按 TikHub 说明改用同参数的 `web/fetch_one_video_by_share_url`。服务端自身不打开用户粘贴的地址，只接受抖音域名。`filter_list[0].reason` 为 5 / 10 / 8 时分别提示私密、部分可见、删除或版权受限（不可用结果同样计费）。
- 无水印原视频：导入素材（`POST /api/hot/videos/{id}/import`）先调 `GET /api/v1/douyin/app/v3/fetch_video_high_quality_play_url?aweme_id=…&region=CN` 取原始上传画质（每次约 0.005 美元，`region=CN` 返回国内 CDN）；蓝 V 账号与投流作品不支持原画，此时改用详情里的 `play_addr`（跳过带水印的 `playwm` 地址）。

## 混剪界面与通知

小程序混剪界面保留，生成服务暂未开放。后台音乐管理、混剪专用配置及服务器视频合成代码已移除。

WECHAT_COMPLETION_FIELDS 为 JSON 对象，键名来自获批模板，值可使用 `{{title}}`、`{{jobId}}`、`{{state}}`、`{{time}}`。用户在“设置”主动授权后才尝试发送。微信拒绝或网络结果未知会记录失败/未确认，不盲目重复发送；获取 access token 失败可以重试。站内通知和微信订阅待发送记录在任务事务中独立生成，两个偏好互不影响；推送通过游标读取最近 24 小时未尝试发送的记录，不受站内消息列表上限影响。

生产配置、域名、OSS/CDN、备案与提审待办见 [release-checklist.md](release-checklist.md)。
