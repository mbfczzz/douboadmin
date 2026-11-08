# 微信虚拟支付（积分商品直购）

当前实现 `short_series_goods`，同时支持积分套餐和自定义金额购买；自定义金额按基础商品单价换算购买份数，使用同一套积分账本。Go API 自建接收安全模式消息推送，不依赖 CloudBase，也没有新增运行时依赖。支付默认关闭，密钥和商品目录可在「系统设置 → 服务接入配置 → 微信虚拟支付」保存到数据库，或使用服务器环境配置。

## 配置

优先通过后台填写和管理，保存后统一重启 API / Worker；具体权限、环境配置优先级和加密文件备份见[后台接入配置](admin-integration-settings.md)。环境变量方式仍兼容，本地使用被 Git 忽略的 `.env.local`。密钥禁止放入小程序代码或 Git，仅超级管理员可通过管理接口读取；确认摘要隐藏密钥内容。

| 配置 | 用途 |
| --- | --- |
| `PAYMENT_CHANNEL` | 新订单通道：`wechat_jsapi`（默认）或 `wechat_virtual` |
| `WECHAT_VIRTUAL_ENABLED` | 新虚拟订单开关，默认 `false` |
| `WECHAT_VIRTUAL_ENV` | `1` 沙箱、`0` 现网；生产环境禁止启用沙箱 |
| `WECHAT_VIRTUAL_OFFER_ID` | 微信虚拟支付 OfferID，不是普通支付商户号 |
| `WECHAT_VIRTUAL_APP_KEY` | 现网 AppKey |
| `WECHAT_VIRTUAL_SANDBOX_APP_KEY` | 沙箱 AppKey；生产部署必须留空 |
| `WECHAT_VIRTUAL_TOKEN` | 消息推送 Token |
| `WECHAT_VIRTUAL_ENCODING_AES_KEY` | 43 位消息推送 EncodingAESKey |
| `WECHAT_VIRTUAL_PRODUCTS` | JSON 商品目录，默认 `[]` |
| `WECHAT_VIRTUAL_CUSTOM_PRODUCT_ID` | 已发布基础商品 ID，须包含在商品目录中；留空仅开放套餐购买 |
| `WECHAT_VIRTUAL_IOS_ALLOWED` | 默认 `false`；仅现网、开通 IAP 后允许 |

复用 `WECHAT_APP_ID` / `WECHAT_APP_SECRET`。AppSecret、AppKey、推送 Token 和 EncodingAESKey 各不相同。关闭新订单开关后，已配置凭证仍可用于旧订单通知和对账；不要立即删除旧环境凭证。

当前项目的 AppID 为 `wx0ab97e7996a7aca9`，OfferID 为 `1450713037`，二者来自同一个小程序后台。环境示例选择 `wechat_virtual`、现网 `env=0`，支付开关仍默认关闭；补齐新小程序的 AppSecret、现网 AppKey、消息推送凭证和已发布商品后再开启。iOS 支付开关须与微信后台实际开通状态一致。

商品示例仅展示格式，ID 需替换为微信后台已经发布的道具 ID：

```json
[{"id":"REPLACE_PRODUCT_ID","name":"1000积分","amountFen":1000,"pointsUnits":100000}]
```

金额单位为分，积分单位为百分之一积分。示例为10元、1000积分。套餐独立决定价格和到账积分，不再与全站兑换率或服务商报价匹配筛选。例如配置0.1元、10000积分即可购买该套餐。商品价格须与微信后台一致，客户端不能指定到账积分。服务商归属和分佣仍按实际支付金额保存快照，不改变套餐权益。不同权益需要配置对应商品 ID。

## 套餐和自定义金额同时开放

配置已发布的基础商品后，填写 `WECHAT_VIRTUAL_CUSTOM_PRODUCT_ID`，小程序“我的积分”会提供“积分套餐 / 自定义金额”两个入口。仍使用道具直购 `short_series_goods`，没有新增微信代币账户。

例如基础商品 `10001` 的单价为0.1元、每份10积分：用户输入1元，服务端创建10份商品的订单，签名中的 `goodsPrice=10`（单价，分）、`buyQuantity=10`，整笔金额为100分、到账10000 units（100积分）。金额须为基础单价的整数倍，并满足平台最低/最高充值限制；基础商品低于最低充值金额时，可以通过多份购买达到最低金额。

自定义金额必须为基础商品单价的整数倍，到账积分等于单份积分乘以份数；金额和积分总量仍受系统安全上限校验。iPhone 保持已开通 IAP、现网环境及微信金额限制；当前实现对不足1元的基础商品不开放 iPhone 购买，需为该终端配置合适档位。商品及价格变更后，旧订单签名前重新核验；已签发订单继续按原快照核实支付结果。

自定义订单保存基础单价、购买数量、整笔金额和积分，不信任客户端传入的积分数。到账、分佣与全额退款按整笔订单处理，重复通知和退款保持幂等；旧订单缺少数量字段时按1份处理。真实多份支付、通知字段的单价/整单价表现及退款仍须使用已开通账号真机验收。

充值操作绑定当前用户及会话，切换账号后清理原账号的充值草稿和页面状态；旧付款的迟到响应不会影响新账号的充值。服务端拒绝已知来自其他 AppID 的微信身份创建支付订单，查单补偿和通知处理共用数量、单价、总金额与积分快照校验，异常数据不入账。

微信凭证交换完成后，签发事务按“用户钱包 → 接入配置 → 授权树 → 订单”顺序加锁，再次核验接入配置是否待重启、账号启停、授权和服务商归属。配置变更后等待服务重启再签发新支付。已签发并由微信确认收款的订单继续正常记账，不因后续停用丢失用户资金。

## 调用与安全边界

1. 钱包接口返回当前通道、可用套餐，以及自定义充值的基础商品单价、积分与金额范围；金额由服务端校验并换算为整数份数。
2. 服务器建立不可变订单快照，金额、积分、商品、OfferID、AppID、环境绑定到订单。
3. 小程序获取新的 `wx.login` code；服务器换取 session_key，核对 openid 与订单归属后计算双签名。session_key 不写库、不回传、不作业务令牌。
4. 签名只签发一次。用户取消后须创建新订单；结果未知时查单，不重复使用 outTradeNo。
5. 小程序原样传递 signData 字符串给 `wx.requestVirtualPayment`，不得重新序列化。前端 success 不发积分。
6. 后端核对查单返回的单号、金额、环境、类型和透传数据，在同一事务中记录支付、发积分、记分佣和写发货 outbox。
7. 发货确认失败会由持久化 outbox 重试；后台扫描使用共享租约和分页，通知与查单共用幂等结算。

旧 JSAPI 订单仍走原查询、通知和退款链路，不根据当前通道误路由。两类通知不能跨通道结算。

## 微信后台回调配置

配置公网可访问的消息推送地址，推荐 `https://你的域名/api/payments/virtual/notify`。官方消息推送支持 HTTP 80 端口及 HTTPS 443 端口；联调可用公网 IP 的 HTTP 地址，并以微信后台 URL 验证通过为准。后端默认监听 5173，通过 Nginx 将公网 80/443 的接口请求转发至后端。

- 必须选择**安全模式**，Token / EncodingAESKey 与服务器一致。
- 支持 XML、JSON 加密推送，以及 GET URL 验证；拒绝未加密的业务 POST。
- 订阅发货、退款、投诉/风控及 iOS 退款问询事件。
- 普通处理成功返回 `success`；未完成不返回成功，允许平台重试。
- iOS 退款问询依据数据库状态快速返回加密证据，不伪造消费记录。

## 退款及人工核对边界

- 当前业务仅支持整笔积分商品退款，不支持代币退款、订阅退款或按比例部分回收。
- Android 等通道可从后台申请全额退款，先预留积分；退款接口返回受理不代表完成。查单状态5仅为商户扣款，状态8才是用户侧收款完成。
- Apple 订单禁止调用开发者主动退款接口；用户从 App Store 申请，平台通知后核对回收。
- **外部退款时积分已经消费、收到部分退款、或平台发货状态与本地不一致，必须人工核对。** 已验签通知先持久化，再应用业务；本地交易号尚未入账的通知也会保留。后台“支付管理 → 虚拟支付异常”可筛选、分页查看原因并重试。待重试事件由后台任务自动处理；不会将回收失败伪报为成功。
- 管理员可保存人工核对说明，记录操作者和时间、停止该事件的自动重试；此操作不修改订单、退款或积分。接口为 `POST /api/admin/virtual-payments/events/{id}/retry` 和 `POST /api/admin/virtual-payments/events/{id}/review`（后者要求 `version`、`note`）。
- 新退款在冻结积分前核验微信可退金额、支付交易号和状态。提交结果不确定时保留原退款单和预留积分，并进入异常队列；重试先查原退款结果，必要时沿用原退款单号提交，不能新建另一笔退款。
- 小程序查询超时后可查看订单，或确认原订单仍可能到账后另购一笔。旧订单继续留在充值订单中跟踪，不因超时标记失败；已签发的虚拟支付单不能重新拉起支付。
- 投诉和风控事件只记录供人工处理，不自动申诉；事件详情可能含交易身份信息，仅管理员接口可读，不应复制到公开日志。退款异常需要配置运营巡检；不要在未验收这些流程前放开 iOS。

## 后续提供真实配置后的验收

确认主体能力开通、商品已发布、服务器回调 GET 验证通过；完成沙箱支持场景和真机现网小额支付验证。iOS 需 iOS15+、微信8.0.68+、已开通IAP，且不支持沙箱。真实支付测试必须另外确认，不能仅凭单元测试启用收款。

验收顺序：签名 → 拉起支付 → 加密通知 → 积分到账 → 重复通知 → 通知丢失查单 → 生成扣减 → 全额退款及异常队列 → 新旧通道并存。

运行：服务端 `go test ./internal/virtualpay ./internal/api ./internal/billing ./internal/payments ./internal/wechat`；小程序 `npm run test:virtual-payment`、`npm run test:payment`、`npm run build`。

## 官方协议来源

- https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment.html
- https://developers.weixin.qq.com/miniprogram/dev/api/payment/wx.requestVirtualPayment.html
- https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_query_order.html
- https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_refund_order.html
- https://developers.weixin.qq.com/miniprogram/dev/framework/server-ability/message-push.html

以上实现依据2026-11-06读取的官方页面，尤其注意查询结果 `env_type` 为1/2，而请求 `env` 为0/1。
