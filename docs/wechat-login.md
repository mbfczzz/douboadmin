# 微信登录接入

小程序默认走真实微信登录。登录只确认身份，用户还需扫码或输入激活码完成产品授权，才能使用业务功能；激活后长期绑定。模型调用使用真实中转接口，详见 [服务商授权流程](service-providers.md)。

## 配置真实账号

1. 在微信公众平台获取小程序 AppID 和 AppSecret。
2. 检查 `miniprogram/project.config.json` 的 `appid` 为对应的真实 AppID。
3. 配置后端 `WECHAT_APP_ID` 与 `WECHAT_APP_SECRET`，两端 AppID 必须一致；AppSecret 只放服务端。
4. 重启 API。`GET /api/config` 的 `wechatLogin` 会显示是否已配置（只检查配置存在，不代表账号/密钥已通过微信验证）。
5. 在微信开发者工具中构建 npm 并编译，用对应账号真机测试。

PowerShell 本地启动示例（在 `server` 目录）：

```powershell
$env:WECHAT_APP_ID='你的小程序AppID'
$env:WECHAT_APP_SECRET='你的小程序AppSecret'
$env:ALLOW_DEMO_LOGIN='false'
go run ./cmd/server
```

Windows 的 `deploy/start-local.ps1` 会读取仓库根目录 `.env.local`，仅将配置传给 API 子进程。可在该文件保存 `WECHAT_APP_ID=...`、`WECHAT_APP_SECRET=...`、`ALLOW_DEMO_LOGIN=false`，每项一行；文件已被 Git 忽略。更换配置后需重启 API。单独执行 `deploy/start-api.ps1` 可启动已构建的 API，运行前先停止旧 API。

直接使用 `go run` 时仍需设置进程环境变量，Go 不会自动读取 `.env` 或 `.env.local`。使用 Docker Compose 时，填写仓库根目录 `.env` 中的同名变量，再重新创建 API 容器。不要把密钥写到小程序、`project.config.json`、代码或聊天记录中。

开发者工具本机可使用 `http://127.0.0.1:8080` 并临时关闭域名校验；真机需使用电脑局域网地址/可访问域名。发布使用已配置的 HTTPS request 域名，上传/下载还需要对应域名。头像选填使用 `chooseAvatar` 和 `input type="nickname"`，建议使用近期稳定基础库；隐私保护指引需在微信公众平台配置。

## 用户流程

- 小程序首先进入授权页；未登录或未激活不能浏览业务目录或执行创作。
- 用户点击「微信登录」时调用 `wx.login`，只向 Go 服务发送一次性 code。
- Go 调用微信 `jscode2session`，基于同一 AppID 下的 OpenID 找到或创建稳定用户，返回独立业务 token。
- 登录成功后检查 `/api/access`。已有有效绑定可进入业务页面；首次使用需扫码或输入服务商发放的激活码。停用仍占名额，解绑才释放，旧码不能重新开通已解绑用户。
- 取消登录不会自动重试，退出后旧响应不会恢复本地会话。二维码在小程序授权页内扫描，也可直接输入激活码。
- 头像与昵称在「我的 → 个人资料」选填。头像先上传，再保存本人素材 ID；后端拒绝其他用户的头像素材。昵称支持微信填写能力。
- 退出时先撤销服务端会话，再清理本地登录信息。会话过期显示重新登录提示；服务端依赖异常不会误清空登录信息。

这不是 `wx.getUserProfile` 的旧版头像昵称授权弹窗。`wx.login` 验证账号身份，头像昵称是可选资料，不自动获取手机号。

## 接口

`POST /api/auth/wechat`

```json
{"code":"wx.login 返回的一次性 code"}
```

```json
{
  "token":"业务会话 token",
  "userId":"wx-...",
  "expiresIn":86400,
  "isNewUser":true,
  "provider":"wechat"
}
```

OpenID、session_key、AppSecret 不返回客户端。微信网络异常不原样输出 URL 或错误体，避免带密钥的查询串出现在日志/响应里。code 失效后，下一次点击获取新 code，不自动重用，不降级成演示身份。

开发联调仍可显式设置 `ALLOW_DEMO_LOGIN=true`：登录页显示独立的「开发演示登录」入口，`POST /api/auth/login {demoId}` 才被接受。默认值是 false；production 开启该标志时拒绝启动。`/api/auth/wechat` 始终拒绝 demoId。

`PUT /api/me` 新增可选 `avatarId`：不传保留当前头像，空字符串清除。头像仅接受当前用户上传的图片，最大 5 MB。`GET /api/me` 返回 `avatarUrl`，OSS 模式每次读取重新签名；不会将临时签名地址作为用户资料持久保存。

## 验证范围

边界回归包含：取消后立即重试使用新凭证；旧登录/上传请求晚到不会覆盖新会话；收藏失败不影响公开模板浏览；登录后收藏按账户最新版本更新；资料冲突保留草稿并刷新版本，等待用户再次确认；昵称读取表单提交值；头像上传前与服务端同时校验 5 MB 上限；关闭资料编辑后丢弃晚到的头像结果。退出登录不受普通 API 配额耗尽影响。

头像上传使用 `POST /api/assets?purpose=avatar`；普通创作素材仍保持 50 MB 上限。资料接口只保存头像素材 ID。

已增加微信交换接口契约/错误映射测试、并发登录账户唯一性测试、会话权限和撤销测试、头像归属与版本冲突测试，以及小程序取消/恢复登录、单次 code 交换、过期响应隔离测试。

这些测试通过模拟微信服务响应完成，不冒充真实微信授权。真实凭据仅保存在本机或部署环境中；真实登录仍需使用 `wx.login` 返回的一次性 code 验收。共享 Redis 会话和 MySQL 用户写入沿用既有多实例设计。

参考：[微信登录流程](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/login.html)、[微信官方头像昵称组件说明](https://github.com/wechat-miniprogram/mp-user-avatar#readme)。
