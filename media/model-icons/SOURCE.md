# 品牌图标

沿用流光项目 `tide-canvas-web/public/model-icons/` 的本地 PNG 资源。
流光源码标注其来源为 `@lobehub/icons` 静态图标包。品牌标识属于相应品牌。
本目录不打入小程序发布包。配置 OSS 后，API 启动时将 PNG 同步到该环境存储桶的
`system/model-icons/<SHA256>/<文件名>.png`，小程序 `/api/config` 返回有效期 24 小时的
OSS HTTPS 签名地址。同步或签名失败时保留 `/media/model-icons/` 本地地址。

同步保留私有 ACL，不覆盖已有对象，不修改模型记录或用户素材。生产与测试使用各自的
`OSS_*` 配置；保存接入配置后需重启 API。缺少文件或上传失败会每分钟重试。
同步前校验 PNG 文件头和尺寸，单张文件损坏或上传失败不阻断其他图标。

也可在已设置 `OSS_*` 环境变量的终端中，从 `server` 目录运行：

```sh
go run ./cmd/sync-model-icons -bucket douboai-test
```

该命令要求显式指定与 `OSS_BUCKET` 一致的桶名，并逐张下载、校验上传的 PNG。
Region 填 `cn-shanghai` 这样的地域标识。若通过 `wx.downloadFile` 下载图标，还需
在微信开发管理中配置相应 OSS HTTPS 下载合法域名。此改动只解决模型图标来源，
业务 API 仍需可用的地址和相应网络配置。
