# 报价单新增业务接口

前缀 `/api`。沿用现有会话、管理员 Cookie、版本冲突与错误格式。金额整数单位为分；积分整数单位为百分之一点（100 units = 1 积分）。本页列出字段概要，完整类型位于 `server/internal/core/`。

## 积分、订单与退款

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /wallet | 可用/预留积分、充值规则、设置版本、支付通道是否已配置 |
| GET | /wallet/ledger | 本人最近积分流水 |
| POST | /jobs/quote | 传任务输入，返回 units、configuredUnits、billingEnabled、availableUnits、sufficient |
| GET / POST | /orders | 本人订单 / `{amountFen,settingsVersion,platform}`，创建充值订单需 Idempotency-Key |
| GET | /orders/{id} | 本人订单，不泄露 OpenID 或 prepayId |
| POST | /orders/{id}/pay | `{platform}`，返回原生微信 requestPayment 参数；尚未记为到账 |
| POST | /orders/{id}/refresh | 服务端可信查单后刷新订单状态 |
| POST | /payments/wechat/notify | 微信支付 APIv3 签名/解密通知，无业务 token |
| POST | /payments/wechat/refund-notify | 微信退款签名/解密通知 |
| GET | /admin/orders、/admin/orders/{id} | 管理订单列表/详情 |
| GET | /admin/payments | 独立支付流水，服务端分页；支持 q、status、from、to、page |
| POST | /admin/orders/{id}/refresh | 管理员查单 |
| POST | /admin/orders/{id}/refund | `{reason}`，全额退款；冻结对应积分，同一活动退款单复用 |
| GET | /admin/refunds | 最近退款单 |
| POST | /admin/refunds/{id}/refresh | 刷新退款最终状态 |
| GET | /admin/users/{id}/wallet、/admin/users/{id}/ledger | 用户钱包与流水 |
| POST | /admin/users/{id}/wallet | `{units,note}`，需 Idempotency-Key，支持正/负调整，不能透支 |
| POST | /admin/jobs/{id}/release | `{verified:true,reason}`，管理员核实后释放失败任务待确认积分 |

任务提交 `POST /jobs` 和重试需确认报价，传 `expectedCostUnits`。价格变化返回 409，积分不足返回 402；网络结果未知时保留原幂等键及已确认输入，不能新建第二笔任务。

账本操作引用唯一，订单金额/积分为创建时快照。钱包锁、流水、订单或任务状态在同一个 MySQL 事务提交；支付交易号防止跨订单重复到账。任务失去租约后不能结算。退款成功回收冻结积分，CLOSED 退回可用积分，ABNORMAL 保留待处理。

支付流水从已确认的 `payment_transactions` 关联订单读取，未支付订单、人工调整积分不会混入。`q` 搜索订单号/微信交易号/用户编号；`status` 为 paid/refunding/refunded；`from/to` 按北京时间到账日期筛选，结束日期包含当天。返回 `{items,total,page,size}`，每页 20 条，不受通用列表 500 条上限限制；每条包含实付金额、到账积分、渠道、支付/到账时间、订单状态与关联退款单，不返回 OpenID、预支付凭据或密钥。

## 用户、作品、审核与通知

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| PUT | /me | 原资料更新支持可选 name/phone；版本检查保留 |
| PUT | /admin/users/{id}/status | `{version,disabled,reason}`，启停用户并记录操作者 |
| GET / PUT | /preferences | 用户偏好 / `{version,data}`；通知、自动播放、分析授权、完成订阅 |
| GET | /notifications | `{items,unread}`，当前用户近期通知 |
| PUT | /notifications/{id}/read | 标记本人通知已读 |
| POST | /notifications/read-all | 当前列表全部已读 |
| GET | /works、/admin/works | 本人/管理端已完成媒体作品 |
| DELETE | /works/{id}、/admin/works/{id} | 逻辑删除作品，保留账本和任务审计，分享立即失效 |
| POST | /shares | `{jobId,title,showPrompt}`，本人已审核作品，默认不分享提示词 |
| GET | /shares/{token} | 无需登录，分享失效/删除/驳回时不可访问 |
| GET | /s/{token} | H5 分享页（此路径无 `/api` 前缀） |
| GET | /admin/reviews | 待审与已审核作品 |
| PUT | /admin/reviews/{id} | `{version,status,reason}`，approved/rejected，驳回必填原因 |

作品公开分享须审核通过；关闭平台人工审核开关后新作品自动通过。短链 30 天到期，每次读取重新核验作品/用户/审核状态。私有 OSS 使用短期签名链接；本地媒体目录仅用于开发。

## 热门视频与运营

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /hot/discovery | 是否配置、热词或后台推荐词、排序范围 |
| GET | /hot/videos | q、sort=relevance/likes/recent/views、cursor/searchId/backtrace |
| GET | /hot/videos/{id} | 标题、文案、作者、可用指标、时间、封面/视频 |
| POST | /hot/videos/{id}/import | 创建导入队列任务，需 Idempotency-Key，完成返回 resultAssetId |
| GET / DELETE | /hot/history | 最近关键词/清空近期搜索历史 |
| GET / PUT | /admin/platform | 平台规则和连接状态 / `{version,data}` |
| POST | /events | 用户授权后记录允许的业务事件 |
| GET | /admin/dashboard | days 日期范围，真实业务统计和模型估算成本 |
| GET | /admin/monitor | 节点心跳、运行指标、队列、连接配置状态 |
| GET | /admin/logs、/admin/alerts | 最近脱敏日志/告警 |
| PUT | /admin/alerts/{id}/ack | 确认告警 |

小程序混剪界面保留，`/config` 返回 `mixAvailable=false` 和说明文案。混剪提交、音乐库及本地渲染接口已移除。

搜索缓存 5 分钟，热词缓存 10 分钟；第三方缺失的播放量等保持 null，不补假数。
