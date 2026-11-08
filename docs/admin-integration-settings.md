# 后台配置服务接入

超级管理员进入「系统设置 → 服务接入配置」。配置真实存入 MySQL（密钥加密保存）；页面不需要手工执行 SQL。按用户要求，已配置的密钥对超级管理员直接显示原文，请勿截图外传或在公共场合打开该页面。普通运营账号无权读取或修改接入配置。管理员降级对已有会话即时生效，重置管理员密码后旧会话失效。

## 可以在后台填写

| 分组 | 配置项 |
| --- | --- |
| 微信登录 | 小程序 AppID、AppSecret |
| AI 中转站 | API 基础地址、API Key |
| 阿里云 OSS | Region、Bucket、AccessKey ID、AccessKey Secret |
| 微信虚拟支付 | 支付通道、现网/沙箱、加载开关、OfferID、AppKey、消息 Token、EncodingAESKey、iOS 开关 |
| 积分商品 | 商品 ID、名称、售价（元）、到账积分、自定义金额基础商品 |
| 热门视频 | TikHub API 地址、API Key |
| 完成订阅通知 | 模板 ID、微信字段和内容映射 |
| 站点地址 | 公网地址、允许的后台来源 |
| 外部告警 | Webhook 地址 |

整块业务设置已移除：不再配置全站兑换率、最低/最高充值金额、充值/扣费开关、审核开关、告警阈值、推荐词及帮助说明。旧数据库记录保留用于兼容，不再参与运行。虚拟支付按套餐金额和到账积分处理，自定义金额按基础商品的整数份购买；充值由通道配置和商品可用性决定。生成按模型定价扣费；公开作品保留人工审核流程，监控使用内置阈值（每小时失败 5 次、排队 10 分钟），热词由抖音接口提供。商品价格须与微信后台已发布商品一致。账号实际开通、密钥有效性和真机支付仍需实际验证。

已有配置、资料修改在提交前展示确认弹窗；取消、关闭或按 Escape 保留草稿且不提交。确认摘要隐藏密码及密钥。新增记录沿用原创建流程。原 `PUT /api/admin/platform` 返回 410，旧客户端须刷新升级；钱包仍保留兼容字段。

## 首次部署

服务器 `/etc/doubo/doubo.env` 仍需配置启动基础信息：

```dotenv
APP_ENV=production
STORAGE_DRIVER=mysql
MYSQL_DSN="doubo:数据库密码@tcp(数据库地址:3306)/doubo_test?charset=utf8mb4&parseTime=true"
REDIS_ADDR=Redis地址:6379
REDIS_USERNAME=
REDIS_PASSWORD=实际密码
REDIS_DB=0
HTTP_ADDR=127.0.0.1:5173
ADMIN_USER=admin
ADMIN_PASSWORD=至少16位的首次管理员密码
ALLOW_DEMO_LOGIN=false
RUN_WORKER=false
MEDIA_DIR=/opt/doubo/shared/media
```

MySQL、Redis、监听地址、运行环境、服务进程与首次管理员引导凭证需要在连接数据库之前读取，因此不移到后台。已有管理员的密码在「管理账号」中修改。普通商户 APIv3 的证书、私钥文件路径和商户凭证仍由服务器配置；本页管理微信虚拟支付。

微信、OSS、中转等业务凭证可以暂时不填写，API / Worker 仍可启动供管理员配置；缺少对应凭证的功能不会返回演示结果。生产环境未配置 OSS 时禁止媒体上传和媒体生成请求，Worker 暂不领取生成任务，避免已排队的任务回退到本地存储；配置完成后重启恢复。

## 保存与生效

1. 填写或修改分组，点击「保存配置」。页面显示「已保存 · 待重启」。
2. 密钥输入框留空会保留当前值；选中对应「清除」才会移除。首次保存也可以将现有环境配置加密导入数据库，不必重复输入密钥。
3. 同一分组保存到数据库后，数据库值优先于环境文件。明确清空的值不会回退到旧环境变量。未保存过的分组继续使用环境配置。
4. 保存完成后统一重启全部 API 和 Worker：

```bash
sudo systemctl restart doubo@serve doubo@worker
```

5. 重启后重新登录后台，确认对应分组不再提示待重启、服务状态正常，再开启积分充值。修改配置不会自动修改 Nginx、证书、小程序 API 地址或微信平台配置。

每个进程启动时读取一次接入配置。多节点必须全部重启，后台的待重启状态以处理当前请求的 API 实例为准，不能证明其他 Worker 已更新。更换中转供应商前先处理在途任务；更换 OSS Bucket / Region 前先迁移原媒体，程序不会自动搬迁。

保存采用版本检查，冲突会保留当前表单，需重新读取再核对；重新读取会放弃该分组未保存的修改。离开页面时已有的未保存提醒仍有效。审计记录保存管理员、字段名和版本，不写入密钥值。

## 支付身份保护

- AppID 必须与小程序项目一致。更换 AppID 时需重新输入对应 AppSecret，并重新编译小程序；更换 OfferID 时需提供对应现网 AppKey。
- 切换接入身份前须先关闭充值。有任何历史订单时，禁止直接切换 AppID / OfferID，须另行安排账户和历史订单迁移。
- 已有订单时，查询、通知与退款所需的密钥可以替换，不能直接清除。暂停充值使用业务开关，不删凭证。
- 微信或虚拟支付配置待重启时，阻止创建新订单及签发新支付；API / Worker 重启后应用新配置。已有订单的到账、查单及退款继续使用订单快照。

## 加密密钥与备份

配置使用 AES-256-GCM 加密后存数据库，密钥由第一次成功保存自动创建，默认路径：

```text
<MEDIA_DIR>/.secrets/integrations.key
```

原生部署默认 `/opt/doubo/shared/media/.secrets/integrations.key`，位于跨版本保留的共享数据目录。该文件不可通过 `/media/` 访问，不进入 Git。Linux 文件权限为 `0600`，服务账号须能读取；多节点使用同一份原始文件。

如需使用其他持久目录，可在环境文件指定 `INTEGRATION_SETTINGS_KEY_FILE` 绝对路径，确保服务账号和 systemd 的可写目录设置允许访问。不要放到每次发布替换的版本目录。

备份、迁移和恢复必须同时保留数据库及原加密密钥文件。数据库已有密文而文件丢失或被替换时，程序会拒绝启动；运行中的服务也会拒绝继续读取、修改接入配置，不会重新生成密钥或静默回退环境配置。应恢复匹配备份。仅有数据库备份无法恢复接入密钥。

## 自定义 /srv 目录的写权限

默认 systemd 单元使用 `ProtectSystem=strict`，只放行 `/opt/doubo/shared`。如果保留 `MEDIA_DIR=/srv/doubo/shared/media`，页面读取可以成功，但首次保存需要在 `.secrets/` 创建密钥，会因写权限不足失败。`APP_ENV=test` 不会关闭 systemd 的文件系统隔离。

保留当前目录时，在服务器执行下面的目录和服务配置，不移动数据或重新生成已有密钥：

```bash
sudo install -d -o doubo -g doubo -m 750 /srv/doubo/shared/media
sudo install -d -o doubo -g doubo -m 700 /srv/doubo/shared/media/.secrets
sudo mkdir -p /etc/systemd/system/doubo@.service.d
sudo tee /etc/systemd/system/doubo@.service.d/media-path.conf >/dev/null <<'EOF'
[Service]
ReadWritePaths=/srv/doubo/shared
EOF
sudo systemctl daemon-reload
sudo systemctl restart doubo@serve doubo@worker
```

仓库的 `deploy/native/media-srv.conf.example` 是同一份可选 drop-in。它追加共享目录写入权限，不放开发布版本目录。若原密钥文件曾由 root 生成或恢复，还需将原文件及其目录的所有者设为 `doubo:doubo`，密钥文件权限保持 `600`，不要删除文件内容。部署脚本不会覆盖 `/etc/systemd/system/doubo@.service.d/` 中的配置。

保存接口会以 `INTEGRATION_KEY_UNAVAILABLE` 返回安全的具体原因；数据库错误仍使用通用提示，详细信息查看 `journalctl -u doubo@serve -n 50 --no-pager`。
