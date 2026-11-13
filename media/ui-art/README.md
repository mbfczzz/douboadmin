# 小程序装饰图（ui-art）

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
| wallet-bg.jpg | 1080 | 我的积分：余额卡背景（用户没有作品时） |

## 目前的加载方式

服务端接口 `GET /api/ui-art/{name}` 读取 `MEDIA_DIR/ui-art/{name}.jpg`，缓存 7 天。部署脚本（`deploy/native/build.sh`、`deploy.sh`）会把本目录随版本发布。

## 改放 OSS / CDN

1. 把本目录下 15 个 `.jpg` **原样上传**到 OSS 同一个文件夹，文件名不要改，设置为公共读。
2. 在 `miniprogram/utils/ui-art.ts` 中把 `ART_BASE` 设为该文件夹的 https 地址，不带结尾斜杠，例如 `https://cdn.example.com/doubo/ui-art`。同时把 `scripts/ui-art.test.cjs` 中对 `ART_BASE` 为空的断言改为该地址。
3. 在微信公众平台「开发管理 → 服务器域名 → downloadFile 合法域名」中加入该域名，否则真机上不显示图片。
4. 之后替换图片时，文件名保持不变，把 `ART_VERSION` 加 1，让缓存失效。

本目录的文件仍需保留：测试会检查每个名称都有对应文件，接口方式也依赖它们。
