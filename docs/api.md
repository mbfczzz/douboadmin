# API

前缀 `/api`，JSON 请求与响应。业务会话支持 Bearer token；管理后台使用 HttpOnly Cookie。
所有写入都校验身份和权限。后台编辑传 `version`，版本不符返回 409，客户端保留草稿并让操作者确认后重试。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /config | 已上架且可用的真实模型、参数、参考素材类型、模板分类和登录能力 |
| POST | /auth/wechat | `{code}`，服务端向微信换取身份，返回业务会话 |
| POST | /auth/logout | 撤销当前会话 |
| GET / POST | /access、/access/join | 查询使用授权 / 用服务商分享码加入；微信登录本身不授予业务权限 |
| GET / PUT | /me | 当前用户资料、作品统计 / 版本化更新 |
| GET | /templates | 已发布模板，支持 `category`、`kind`、`q` |
| GET | /templates/{id} | 已发布模板详情及新签名封面 URL |
| POST | /assets | multipart `file`，本人素材；头像最多 5 MB |
| GET | /assets/{id} | 本人素材详情及新签名 URL |
| GET / POST | /jobs | 本人任务 / 创建真实生成任务 |
| GET | /jobs/{id} | 本人任务详情，`retryable` 表示是否可以重新生成 |
| POST | /jobs/{id}/retry | 仅明确失败的任务可重试，需新的幂等键 |
| GET | /favorites | 本人收藏 |
| PUT | /favorites/{id} | `{active, version}`，更新收藏 |
| POST | /feedback | `{content}`，提交反馈 |
| POST | /admin/login | 管理员登录 |
| GET | /admin/overview | 兼容的近期记录概览，附 scope |
| GET | /admin/dashboard | 每日新增/活跃/支付/退款/生成、行为事件、模型估算成本 |
| GET / POST | /admin/models | 模型目录 / 按 `{key}` 核验并导入上游模型 |
| POST | /admin/models/sync | 同步上游，返回 created / updated / conflicts / total |
| PUT | /admin/models/{id} | `{version,data}`，编辑显示名称、排序、积分配置、上架状态 |
| DELETE | /admin/models/{id} | `{version}`，软删除，不影响已有任务记录 |
| GET | /admin/templates | 全部未删除模板 |
| PUT | /admin/templates/{id} | `{version,data}`，新增或编辑模板 |
| DELETE | /admin/templates/{id} | `{version}`，下架并软删除 |
| POST | /admin/assets?purpose=cover | 上传封面，JPG / PNG / WebP，最多 5 MB |
| GET / POST | /admin/jobs | 管理任务列表 / 管理员发起真实模型测试任务 |
| GET | /admin/jobs/{id}/execution | 上游任务号和执行阶段，不返回密钥 |
| POST | /admin/jobs/{id}/resume | 恢复已知上游任务的查询 / 保存，禁止盲目重发生成 |
| GET | /admin/users、/admin/feedback | 用户、反馈列表 |

## 生成任务

请求头 `Idempotency-Key` 长度 8–128。同一用户同一键重复提交相同输入复用原任务；不同输入返回 409。
输入中的 `model` 是 `/config` 返回的本地模型 ID，不能填写硬编码演示模型。

```json
{
  "kind": "image",
  "model": "从配置接口选择",
  "prompt": "一杯咖啡的产品摄影",
  "resolution": "1k",
  "ratio": "1:1",
  "quality": "low",
  "duration": 0,
  "assets": []
}
```

参数必须属于所选模型。视频时长从 `durations` 选择；`mode` 可省略，由参考素材推导，或使用后台模板配置。
模型 `data.settings` 支持能力子集、图标/描述/标签/预计耗时、参考素材数量和大小限制、默认及灵感提示词、积分矩阵、错误提示映射、维护状态。配置保存后 `/config` 返回实际可用规格，任务接口同时校验限制。维护状态禁止新建任务；开启平台积分扣减后，提交前调用 `/jobs/quote` 并传 `expectedCostUnits` 确认价格。

`/config` 同时返回每个模型的 `referenceRules[mode][image|video|audio] = {minCount,maxCount,maxSizeMB}`，由后台配置、上游能力与平台 20 个素材/单个 50 MB 上限共同计算，不下发完整私有供应商 schema。`resolutionByMode` 表示指定生成方式对应的分辨率范围；存在空数组说明该方式与后台配置没有兼容组合，前端阻止提交。创作页根据规则显示素材类型、校验数量和上传前文件大小，增删/恢复素材后重新计算参数。重新进入创作页会读取最新配置；已有草稿不会因模型限制变严被自动删除，超限时提示用户调整。参数配置不通过推送实时刷新已打开的页面。
`assets` 是本人上传素材的 ID；生产生成需要 OSS 签名公网 URL。不能把手机临时文件路径或电脑局域网 URL 发给上游。
状态为 `queued → running → succeeded / failed`，进度未知时不虚构百分比。结果经过服务端保存后才标记完成。

## 创作模板

`data` 包括 `title/category/kind/family/description/prompt/coverAssetId/cover/preview/model/resolution/ratio/quality/duration/mode/requiredImages/sort/published`。
`family` 为 `style` 或 `inspiration`，`kind` 为 `image` 或 `video`。
封面可使用后台上传得到的 `coverAssetId` 或 HTTPS 地址；签名 URL 不作为持久标识。
发布前校验模型状态与参数，`requiredImages` 须在模型参考图数量上下限内。已删除或已下架的模板不能继续提交任务；关联模型下架、维护或删除时，模板对用户隐藏（列表不返回、详情 404），也不能被收藏，收藏数只统计仍可打开的模板。

开发测试仍保留受 `ALLOW_DEMO_LOGIN` 控制的兼容登录端点；默认关闭，production 禁止开启。这只服务于隔离测试，应用没有模拟生成器。

充值、积分、混剪、热门视频、作品审核、通知与监控接口见 [business-api.md](business-api.md)。

服务商层级、扫码登记与总部开通、会员推广码与充值分佣接口见 [partner-api.md](partner-api.md)。用户扫码登记后须由总部开通；尚未开通时 `/config` 不返回模型/分类目录。
