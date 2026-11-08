# 服务商业务 API

前缀 `/api`。管理平台账号与微信小程序用户完全分离。普通用户使用微信业务 token，可直接申请自动开通，或使用服务商激活码建立归属；尚未开通的业务请求返回 `403` 及 `code=ACTIVATION_REQUIRED`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | /access | 当前身份是否已激活、归属与停用原因 |
| POST | /access/direct | 直接申请并自动开通，不建立服务商归属 |
| POST | /access/redeem | `{code,method?}`；method 为 qr/code，旧客户端未报则记 unknown；同一兑换流程，限流及单次占位 |
| GET / POST | /admin/accounts | 管理平台账号列表与创建；小程序用户不能通过此接口创建 |
| PUT | /admin/accounts/{id} | 编辑管理账号姓名、手机号、角色和启停状态 |
| PUT | /admin/accounts/{id}/password | 重置管理账号密码，最少 16 位 |
| DELETE | /admin/accounts/{id} | 归档管理账号并禁止登录 |
| GET | /admin/me | 当前登录账号、角色、可见菜单及所属服务商 |
| GET | /admin/roles | 角色列表及账号数；服务商账号只返回服务商角色 |
| POST / PUT / DELETE | /admin/roles、/admin/roles/{id} | 超级管理员维护角色 `{name,scope,menus}`；scope 为 platform/partner，创建后不可改 |
| GET / POST | /admin/partners | 直接下级/搜索分页；创建 `{parentId,name,account:{username,password,role}}`，同时开通登录账号 |
| GET / PUT | /admin/partners/{id}/account | 下级服务商登录账号；PUT 用于补开、重置密码、换角色或停用 |
| GET | /admin/partners/{id} | 服务商资料、固定用户额度、当前价格链和佣金余额；`root` 为总账号 |
| PUT | /admin/partners/{id} | `{version,data}`；名称、状态、子账号售价、向下供货的保留比例 |
| GET / PUT | /admin/partner-policy | 总账号成本与保留比例；写入 `{version,data}` |
| GET / POST | /admin/quota-moves | 历史；写入 `{parentId,childId,users,kind,reason}`，kind 为 grant/reclaim |
| GET / POST | /admin/quota-requests | 申请历史；写入 `{partnerId,users,reason}` |
| PUT | /admin/quota-requests/{id} | `{version,approve,reason}`；批准与划拨在同一事务 |
| GET / POST | /admin/activation-codes | 授权码列表；生成 `{partnerId,label,days}` 并预留名额 |
| GET | /admin/activation-codes/{id} | 有效未使用码的正文和二维码 Data URL，仅限本服务商子树内 |
| GET | /admin/activation-codes/{id}/trace | 生成账号/时间、归属、首次激活用户/昵称/时间/方式、当前用户资料及绑定；已使用/撤销码也可查询 |
| DELETE | /admin/activation-codes/{id} | 撤销未使用码，释放预留 |
| GET | /admin/memberships | 按 provider/用户编号/状态查询授权绑定 |
| PUT | /admin/memberships/{id} | `{version,status,reason}`；active/disabled/unbound |
| GET | /admin/commission-ledger | 不可变佣金流水 |
| GET | /admin/orders/{id}/distribution | 订单分佣快照，不返回 OpenID 或支付凭据 |
| GET / POST | /admin/commission-payouts | 提现记录；申请 `{partnerId,amountFen,note}` |
| PUT | /admin/commission-payouts/{id} | `{version,status,reference}`；paid 表示确认已线下打款，cancelled 表示取消 |

服务商账号的所有 `/admin` 请求按角色菜单校验，并限定在本服务商子树内；越权返回 `403`；所属服务商或其上级停用时登录与会话均返回 `403`。`partner-policy`、名额申请审批、提现处理仅限平台账号。`/admin/accounts` 只管理平台账号。

列表支持 `page`、`q`、`status`、`owner`，返回 `{items,total,page,size}`，每页 20 条。授权绑定另支持 `provider` 精确筛选归属。创建服务商、名额划拨/申请、生成码、申请提现需要 `Idempotency-Key`，相同键不同输入返回冲突。

授权码的 `actor` 来自登录身份，`creatorAccount` 来自该登录会话的账号快照，不能由发码请求指定。首次兑换记录 `userId/usedAt/activatedNickname/activationMethod`，原码记录不随用户改名、解绑或更换服务商而被覆盖。trace 仅可查询本服务商子树内的码，不返回完整激活凭证或额外用户隐私字段。

售价/成本字段 `retailPer100Fen`、`costPer100Fen` 单位为分，分别表示每 100 元基准算力的售价/成本；`childMarginBps`、`rootMarginBps` 采用万分比，5000 表示 50%。它们不是固定充值套餐。

`GET /wallet` 新增 `pricing = {ready,retailPer100Fen,version,message?}`。创建充值订单在原字段之外需传 `pricingVersion`；分佣快照不返回给普通用户。已存在订单保持原报价，归属改变后不能新发起旧归属订单的支付；已经发生的可信到账仍按原订单结算。

匿名 `/config` 只返回登录/激活引导能力，模型与分类为空。模板、混剪配置、音乐、热门视频发现及小程序分享数据均受激活保护。外部 H5 分享仍可公开访问，但作品所有者必须保持有效授权。

程序入口固定要求用户先选择开通方式；直接申请自动通过且不产生服务商日志，激活码开通保留服务商归属和完整来源记录。演示登录仅供隔离测试，正式环境禁止启用。
