# AI试衣内置服装（outfits）

32 张 Codex 生成的服装图（隐形人台全身穿搭、按季节配色的纯色背景，不含人物），720×960 JPEG。
文件名与 `server/internal/api/outfit_defaults.go` 的 `defaultOutfits` 一一对应，名称、分类、描述也在那里。

- 部署时随版本复制到 `MEDIA_DIR/outfits`（`deploy/native/build.sh`、`deploy.sh`）。
- API 启动后（`SeedBuiltinOutfits`）把服装库里还没有的内置服装各加一次并上架：有 OSS 时图片上传到
  `system/outfits/<内容摘要>/<id>.jpg`，否则直接从媒体目录读取。已存在、被管理员修改或删除的不会再加。
- 后台「试衣服装」可以编辑、下架或删除；「生成默认服装」只会为还没有图片的默认服装重新生成。
