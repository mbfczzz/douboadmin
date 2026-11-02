# 部署、备案与提审准备

代码中的可配置接入不代表平台业务已经开通。用户尚未提供测试库、OSS、支付商户、抖音和 ASR 凭证，本页保留待办，不填写虚假的完成状态。

## 测试与生产环境

1. 填写 `.env` / `.env.local` 中的 MySQL、Redis、OSS、微信登录、中转站配置；生产环境设 `APP_ENV=production`，更换默认管理员密码。
2. 单机使用 `deploy/compose.yaml` 启动共享 MySQL、Redis，显式执行 `migrate`，再启动 API、Worker、Web。镜像包含 FFmpeg、FFprobe 和中文字幕字体。
3. 商户私钥、公钥放入 `deploy/secrets/`，容器内只读路径 `/run/secrets/`。目录已排除 Git 和 Docker 构建上下文。
4. 使用 `deploy/nginx.tls.conf.example` 配置自己的域名和证书。内层 Nginx 已转发 `/api/`、`/media/`、`/s/`，短链不会误进入管理端 SPA。
5. 设置 `PUBLIC_BASE_URL=https://实际域名`、对应 `WEB_ORIGIN`，并修改小程序 `config.ts` 的 API 地址。
6. 扩容前所有实例连接同一 MySQL、Redis、OSS；Worker 的临时视频文件不作为跨节点状态。生成子步骤和钱包状态均保存在共享数据库。
7. 定期备份数据库，验证恢复后订单、流水、生成执行记录一致。不能只迁移作品而丢失账本或支付幂等记录。

## 对象存储与 CDN

- 上传、作品使用私有 OSS 对象和短期签名 URL；公开分享仍需有效短链和审核状态。
- 静态管理端哈希资源可按长缓存配置 CDN；API、订单、钱包、带鉴权的内容不做公共缓存。
- OSS/CDN 域名、HTTPS 证书、鉴权回源和微信合法域名需在对应账号中配置，并分别验证上传、视频 Range 播放、图片下载和签名过期行为。
- 本机临时数据不会自动复制到测试库；正式需要保留的素材需单独转存，不把预览样例冒充用户作品。

## 微信支付

- 当前实现使用[微信支付官方 Go SDK](https://github.com/wechatpay-apiv3/wechatpay-go)及商户 APIv3 JSAPI 通道，验签解密、查单、关闭订单和退款使用官方接口。
- 必需：商户号、与小程序关联的 AppID、商户证书序列号、商户私钥、APIv3 密钥、微信支付公钥 ID/公钥、真实 HTTPS 支付和退款通知地址。
- 积分是数字权益，实际支付产品须依据账号类目和平台开通能力确认。普通微信支付与虚拟支付是不同接入；当前 iOS 充值默认关闭，不用外部链接引导绕过平台限制。
- 配置完成后再在后台开启充值和积分扣减，验收金额篡改、重复回调、断网查单、取消支付、失败退回、退款关闭/成功、并发消费与退款冲突。
- 退款接口受理不等于最终退款成功，以可信通知或查询结果为准。[微信退款接口](https://pay.wechatpay.cn/doc/v3/merchant/4012791903)

## 第三方数据、语音与通知

- TikHub：填写 `TIKHUB_API_KEY`；搜索使用已核对的 `fetch_video_search_v2`，综合/点赞/最新由上游支持，播放量只做当前页排序。缺失指标显示“未提供”。
- ASR：填写兼容 multipart `/audio/transcriptions` 的 `ASR_BASE_URL`、`ASR_API_KEY`、`ASR_MODEL`，使用真实音轨验证文本及时间轴。
- 配音：选择已上架的 `tts-*` 中转模型与音色。此次实调出现未确认提交，需在中转站核实；代码未盲目重发。
- 完成订阅消息：填写真实 `WECHAT_COMPLETION_TEMPLATE_ID` 和 `WECHAT_COMPLETION_FIELDS`。字段名必须与获批模板一致，可使用 `{{title}}`、`{{jobId}}`、`{{state}}`、`{{time}}` 占位。用户主动授权后才尝试发送，站内通知独立保留。
- 外部告警：可配置 `ALERT_WEBHOOK_URL`；未配置时告警保存在后台。不要把密钥或个人内容放进告警模板。

## 备案和提审：待用户账号与资料

- 域名与小程序主体信息、负责人核验、服务器与域名信息、类目和所需资质、隐私说明与数据处理清单，由真实主体通过相应平台提交。
- 按[微信小程序备案指引](https://developers.weixin.qq.com/miniprogram/product/record_guidelines.html)办理，小程序备案与网站/域名相关备案分别核对；查询入口为[工信部备案系统](https://beian.miit.gov.cn/)。是否完成以平台回执为准。
- 微信后台配置 request/uploadFile/downloadFile 合法域名、隐私接口说明与类目；填写真实客服/联系方式。
- 开发者工具检查最终上传包，进行 iOS/Android 真机登录、上传、生成、混剪、相册保存、支付与分享测试。
- 准备审核账号、操作路径、生成与混剪示例、收费说明、审核机制说明、用户协议/隐私政策。上传体验版并验收后，由有权限的管理员提交审核和发布。

本轮未代替用户办理备案、开通商户、购买服务器/CDN或提交小程序审核。
