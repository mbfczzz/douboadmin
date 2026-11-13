# 小程序装饰图（ui-art）

> **阿里云 OSS：需要上传。** 本目录 15 张 `.jpg` 由小程序在线加载，正式环境走阿里云私有 OSS。
> 正常发布新版本即可：部署时 `doubo-sync-ui-art.service` 会自动上传到 OSS 的
> `system/ui-art/<内容 SHA-256>/<文件名>.jpg`，无需手动操作；只有自动同步失败时才需按下文手动重试。
>
> 不需要上传阿里云的：`miniprogram/assets/`（图标与空状态照片），它们随小程序代码包一起上传到微信，
> 见 `miniprogram/assets/README.md`。

Codex 生成的实拍风格深色图片，用于小程序界面装饰。所有位置在图片加载失败时都会退回原来的纯色或图标，不影响功能。

代码入口：`miniprogram/utils/ui-art.ts`（名称 → 地址）。

| 文件 | 宽度 | 用在哪里 |
|---|---|---|
| mine-bg.jpg | 1080 | 我的：用户还没有作品时的顶部背景 |
| agent-script.jpg | 240 | Agent：示例「产品短视频脚本」 |
| agent-prompt.jpg | 240 | Agent：示例「照片创意提示词」 |
| agent-coffee.jpg | 240 | Agent：示例「咖啡品牌宣传片」 |
| upload-example.jpg | 720 | 模板详情：上传商品照片的示例图 |
| src-image.jpg | 240 | 创作「添加参考」的图片、模板详情的相册 |
| src-video.jpg | 240 | 创作「添加参考」的视频 |
| src-audio.jpg | 240 | 创作「添加参考」的音频 |
| src-camera.jpg | 240 | 模板详情：拍照 |
| src-chat.jpg | 240 | 模板详情：聊天文件 |
| mix-natural.jpg | 480 | 混剪风格：自然剪辑 |
| mix-fast.jpg | 480 | 混剪风格：快节奏 |
| mix-cinema.jpg | 480 | 混剪风格：电影色调 |
| login-bg.jpg | 1080 | 登录、授权开通页顶部背景 |
| wallet-bg.jpg | 1080 | 我的积分：余额卡右侧的星星背景 |

## 目前的加载方式

部署脚本（`deploy/native/build.sh`、`deploy.sh`）会把本目录随版本发布。数据库迁移完成后，部署执行 `doubo-sync-ui-art.service`，读取与 API 相同的 OSS 配置，将图片同步到私有 OSS，再启动 API 和 Worker。

## 自动同步 OSS

1. 在后台配置 OSS，并正常发布新版本。配置优先读取数据库中已加密保存的值；没有数据库记录时沿用环境变量。配置密钥文件与 API/Worker 共用。
2. 15 张 `.jpg` 原样上传到 `system/ui-art/<内容 SHA-256>/<文件名>.jpg`。相同内容重复部署只检查对象是否存在，不重复上传；更换图片会产生新对象，不覆盖旧版本。
3. **保持桶和对象私有**。小程序继续请求 `GET /api/ui-art/{name}`，API 对已同步的图片返回 OSS HTTPS 签名重定向，不把桶名或过期签名写死进小程序。重定向响应使用 `no-store`，避免缓存的签名过期。
4. API 启动后也会在后台确认 OSS 对象并在失败时重试；未完成同步或签名失败时使用本地图片。未配置 OSS 时部署跳过同步，保留本地读取；部分配置缺失、JPEG 不合法或 OSS 上传失败会让部署失败并触发已有回滚流程。
5. 微信公众平台需允许 API 和实际 OSS/CDN 域名；涉及下载保存的资源还需加入 `downloadFile` 合法域名。客户端默认 `ART_BASE` 保持空，替换图片时仍递增 `ART_VERSION` 以刷新客户端缓存。

部署日志：`journalctl -u doubo-sync-ui-art --no-pager`。需要单独重试时运行 `systemctl start doubo-sync-ui-art`。手动运行二进制的命令是 `doubo-api sync-ui-art`，必须先加载相同的环境和配置密钥。

同步不会启动生成 Worker，也不会调用模型生成服务。RAM 账号需要目标前缀上的对象读取/查询和写入权限；不需要修改整个桶的 ACL。

本目录的文件仍需保留：测试会检查每个名称都有对应文件，接口方式也依赖它们。
