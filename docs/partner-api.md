# 服务商业务 API

前缀 `/api`。管理平台账号与微信小程序用户完全分离。小程序用户使用微信业务 token，扫码登记后由总部开通；尚未开通的业务请求返回 `403` 及 `code=ACTIVATION_REQUIRED`。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | /access | 授权状态与归属；`profileRequired` 和各状态见 [注册与开通](registration.md) |
| POST | /access/sms | `{phone}` 发送短信验证码 |
| POST | /access/profile | `{name,phone,code}` 验证手机号并保存资料（开通前的第一步） |
| POST | /access/join | `{code,method}` 扫码登记，method 为 scan/code；限流。会员开通码 / 推广码登记为会员（推广码记录推荐人），S1 / S2 邀请码登记为对应服务商，绑定码登记为后台创建的服务商本人；均为待开通 |
| GET | /promo | 已开通会员的推广码 `{code, qr}` |
| GET | /me/identity | 已开通账号的身份 `{kind: branch/s1/s2/member, label, partner}` |
| GET / POST | /admin/accounts | 管理平台账号列表与创建；小程序用户不能通过此接口创建 |
| PUT | /admin/accounts/{id} | 编辑管理账号姓名、手机号、角色和启停状态 |
| PUT | /admin/accounts/{id}/password | 重置管理账号密码，最少 16 位 |
| DELETE | /admin/accounts/{id} | 归档管理账号并禁止登录 |
| GET | /admin/me | 当前登录账号、角色、可见菜单及所属服务商 |
| GET | /admin/roles | 角色列表及账号数；服务商账号只返回服务商角色 |
| POST / PUT / DELETE | /admin/roles、/admin/roles/{id} | 超级管理员维护角色 `{name,scope,menus}`；scope 为 platform/partner，创建后不可改 |
| GET / POST | /admin/registrations、/admin/registrations/{用户} | 扫码登记列表（`status` 为 pending/approved/rejected，`q` 搜索）；PUT `{version,approve,reason}` 开通或拒绝（拒绝须填 2–200 字原因）；仅总部 |
| GET / POST | /admin/partners | 直接下级/搜索分页；创建 `{parentId,name,role,account?}`（仅总部；平台下建 branch，分公司下建 s1/s2，S1 下建 s2） |
| GET | /admin/partners/tree | 本人可见范围内的全部服务商记录（含 `role`、`status`、`ownerUser`） |
| GET / PUT | /admin/partners/{id}/account | 下级服务商登录账号；PUT 用于补开、重置密码、换角色或停用 |
| GET | /admin/partners/{id} | 服务商资料、当前价格链和佣金余额；`root` 为总账号 |
| PUT | /admin/partners/{id} | `{version,data}`；名称、状态、子账号售价、向下供货的保留比例 |
| GET / PUT | /admin/partner-policy | 总账号成本与保留比例；写入 `{version,data}`；仅总部 |
| GET / POST | /admin/partners/{id}/codes/{kind} | kind 为 member / s1 / s2 / bind：查看（首次读取时生成）/ 重置。会员开通码所有服务商都有，S1 邀请码仅分公司，S2 邀请码分公司和 S1，绑定码仅后台创建的服务商；已绑定时 bind 返回 `{user}` |
| DELETE | /admin/partners/{id}/codes/bind | 解除绑定并生成新绑定码 |
| GET | /provider | 小程序服务商中心：名称、身份 `role`、状态、会员数 `members`、可用的码 `codes{member,s1?,s2?}`、直接下级 `children`（S2 没有）、后台账号；只返回本服务商及其下级 |
| POST | /provider/password | 扫码登记成为的服务商：开通后台登录（账号为验证手机号）或重置密码，返回 `{account, password}`；密码加密保存，`GET /provider` 在未被后台修改前一直返回 `password`，被修改后返回 `passwordChanged: true` |
| GET | /admin/memberships | 按 provider/用户编号/状态查询会员（含 `referrer` 推荐人；状态 pending/active/disabled/unbound/rejected） |
| GET | /admin/users/{id}/activation | 用户开通来源：`kind` 为 owner/member/none，登记记录 `registration`、会员记录、推荐人 `referrer`、服务商链路 `chain[{id,name,role,status}]` |
| PUT | /admin/memberships/{id} | `{version,status,reason}`；仅对已开通/已停用会员：active/disabled/unbound |
| GET | /admin/commission-ledger | 不可变佣金流水 |
| GET | /admin/orders/{id}/distribution | 订单分佣快照，不返回 OpenID 或支付凭据 |
| GET / POST | /admin/commission-payouts | 提现记录；申请 `{partnerId,amountFen,note}` |
| PUT | /admin/commission-payouts/{id} | `{version,status,reference}`；paid 表示确认已线下打款，cancelled 表示取消 |

服务商账号的所有 `/admin` 请求按角色菜单校验，并限定在本服务商子树内；越权返回 `403`；所属服务商或其上级停用时登录与会话均返回 `403`。`partner-policy`、新增服务商、扫码登记审核、提现处理仅限平台账号。`/admin/accounts` 只管理平台账号。

列表支持 `page`、`q`、`status`、`owner`，返回 `{items,total,page,size}`，每页 20 条。授权绑定另支持 `provider` 精确筛选归属。创建服务商、申请提现需要 `Idempotency-Key`，相同键不同输入返回冲突。

码统一保存在 `share_codes`（以码为键，`kind` 区分会员开通码 / s1 / s2 / bind / promo）；各服务商和会员的当前码另有指针记录；重置写操作日志。扫码登记写入 `registrations`（以用户为键），会员记录 `codeId`、`method`、`referrer` 和时间，之后解绑或重置码都不改写。

售价/成本字段 `retailPer100Fen`、`costPer100Fen` 单位为分，分别表示每 100 元基准算力的售价/成本；`childMarginBps`、`rootMarginBps` 采用万分比，5000 表示 50%。它们不是固定充值套餐。

`GET /wallet` 新增 `pricing = {ready,retailPer100Fen,version,message?}`。创建充值订单在原字段之外需传 `pricingVersion`；分佣快照不返回给普通用户。已存在订单保持原报价，归属改变后不能新发起旧归属订单的支付；已经发生的可信到账仍按原订单结算。

匿名 `/config` 只返回登录/激活引导能力，模型与分类为空。模板、混剪配置、音乐、热门视频发现及小程序分享数据均受激活保护。外部 H5 分享仍可公开访问，但作品所有者必须保持有效授权。

程序入口固定要求用户先扫码登记并经总部开通；登记保留服务商归属、来源码和推荐人。演示登录仅供隔离测试，正式环境禁止启用。
