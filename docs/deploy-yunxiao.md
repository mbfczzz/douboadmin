# 测试环境：云效 Flow + Linux 原生部署

使用 Gitee / GitHub 代码源、云效构建和主机部署；服务器运行 Nginx、Go API、独立 Worker，不需要 Docker。本文以支持 systemd 的 Linux 为前提，目录固定为 `/opt/doubo`。Windows 或由宝塔管理的 Nginx 需要调整安装步骤。

```text
Gitee main → 云效构建 / 测试 → 上传制品 → 测试主机部署
                                         ├─ Nginx：HTTPS、React 静态文件、反向代理
                                         ├─ doubo@serve：Go API，127.0.0.1:8080
                                         └─ doubo@worker：生成任务处理
                                               ↓
                                         MySQL / Redis / 阿里 OSS
```

云效负责构建和发布，不会自动提供业务数据库、Redis 或 OSS。小程序不在服务器运行，仍需在微信开发者工具中编译、上传体验版。

## 1. 准备测试主机

需要 Nginx、curl、Bash、flock。下面仅是 Ubuntu / Debian 的安装示例；其他发行版使用对应包管理器，不要混用安装命令。

```bash
sudo apt-get update
sudo apt-get install -y nginx curl util-linux
```

Alibaba Cloud Linux / Rocky / AlmaLinux 可使用：

```bash
sudo yum install -y nginx curl util-linux
sudo nginx -t
sudo systemctl enable --now nginx
```

按云效“主机组管理”的指引接入 ECS / 自有主机，完成 Runner 及其 Java 环境要求，确认主机在线。构建机和部署机是两个环境：Node 和 Go 只需装在构建机。

准备以下资源：

- MySQL 8：建立空库 `doubo_test`，应用账号需要该库的读写和建表权限。程序迁移建表，不会替你创建数据库或数据库账号。
- Redis：可达的地址、ACL 用户名（无则留空）、密码、逻辑库编号。当前客户端连接单个 Redis 端点；不直接配置 Redis Cluster 节点列表。
- OSS：测试 Bucket、所在 Region、拥有对应对象读写权限的访问凭证。
- 真实小程序 AppID / AppSecret；测试 HTTPS 域名及有效证书。
- 中转站 API Key，用于真实模型调用；支付、抖音 等可按需填写。

数据库、Redis 可使用本机服务或云上实例。云实例应允许测试主机连接。Nginx 对外提供 80/443；API 8080 只监听本机。

## 2. 配置服务器环境

将仓库的 `deploy/native/doubo.env.example` 上传到服务器，保存为 `/etc/doubo/doubo.env`。目录先用 `sudo install -d -m 700 /etc/doubo` 创建，文件所有者设为 `root:root`、权限 `600`。

按实际环境填写：

```dotenv
APP_ENV=production
ADMIN_PASSWORD=自行设置至少16位的新密码
MYSQL_DSN="doubo:数据库密码@tcp(数据库地址:3306)/doubo_test?charset=utf8mb4&parseTime=true"
REDIS_ADDR=Redis地址:6379
REDIS_USERNAME=
REDIS_PASSWORD=实际密码
REDIS_DB=0
WEB_ORIGIN=https://你的测试域名
PUBLIC_BASE_URL=https://你的测试域名
WECHAT_APP_ID=真实AppID
WECHAT_APP_SECRET=真实AppSecret
OSS_REGION=实际Region
OSS_BUCKET=实际Bucket
OSS_ACCESS_KEY_ID=实际AccessKeyID
OSS_ACCESS_KEY_SECRET=实际AccessKeySecret
RELAY_API_KEY=实际中转站密钥
```

请保留示例文件中的其他配置，尤其是 `RUN_WORKER=false`、`ALLOW_DEMO_LOGIN=false`和 `MEDIA_DIR`。测试服务器也使用 production 校验，微信和 OSS 必填，否则 API / Worker 会拒绝启动。没有中转凭证时不会返回假生成结果。

这是 systemd 的 `EnvironmentFile`，不是 Shell 脚本。不要写 `export` 或变量替换；包含空格、特殊字符的值用符合 systemd 规则的引号包围。Go 程序不会自动加载仓库中的 `.env`。支付证书单独放到服务账号可读的位置，在配置中填写绝对路径。

真实配置仅放在服务器，不放进 Git、构建日志或制品。首次部署如果缺少环境文件，脚本会创建空模板并停止，填写后重新运行流水线即可。

## 3. 配置云效流水线

### 代码源

先确认 `deploy/native/` 等部署文件已提交并推送到目标分支。在云效 Flow 新建流水线，添加码云服务连接，选择仓库 `mbfczzzz/douboai`（或使用原 GitHub 仓库） 和分支 `main`。构建工作目录选仓库根目录。先手动触发验证，通过后再开启 main 分支提交触发。

### 构建

使用具备 **Node >=22.12、Go >=1.25** 的 Linux 构建环境，启用自动工具链切换到项目要求的 Go 1.26，执行：

```bash
export GOTOOLCHAIN=auto
bash deploy/native/build.sh
```

如果内置工具版本不满足要求，先在构建环境安装匹配版本或使用自动工具链切换；不要直接降级 `go.mod` 或删除前端版本限制。

脚本安装锁定的 npm 依赖，运行前端构建和体积检查、Go 测试，再生成 Linux 静态二进制及最小发布目录 `out/package/`。不会打入 `.env.local`、node_modules、测试数据或本地上传文件。

默认目标为 Linux amd64（x86_64）。服务器是 ARM64 时，构建命令改为：

```bash
GOTOOLCHAIN=auto TARGET_ARCH=arm64 bash deploy/native/build.sh
```

### 构建物上传

在构建任务后添加“构建物上传”：

| 配置项 | 值 |
| --- | --- |
| 上传方式 | 归档至云效公共存储空间，供后续任务拉取并部署 |
| 制品名称 | `doubo-test` |
| 打包路径 | `out/package/`（仅这一项） |
| 制品中包含打包路径的目录 | **不勾选** |

云效会归档此目录。解压后顶层应直接包含 `bin/`、`web/`、`media/`、`deploy/`、`REVISION`，不能多套 `out/package/` 两层目录。

### 主机部署

添加“主机部署”，选择测试主机组和上游 `doubo-test` 制品：

- 下载路径：`/opt/doubo/artifacts/package.tgz`
- 执行用户：`root`
- 部署脚本：

```bash
set -eu
mkdir -p /opt/doubo/releases
release_dir="$(mktemp -d /opt/doubo/releases/test-XXXXXXXX)"
tar -xzf /opt/doubo/artifacts/package.tgz -C "$release_dir"
bash "$release_dir/deploy/native/deploy.sh"
```

首次使用前，在主机创建下载目录：`sudo mkdir -p /opt/doubo/artifacts`。上述引导命令兼容 `sh`，实际发布脚本显式由 `bash` 调用。

脚本串行化同机发布，安装 systemd 单元，停止旧服务、切换版本、执行一次数据库迁移、启动 API / Worker，最后检查数据库 / Redis 就绪和 Worker 进程。单机更新存在短暂中断。迁移或启动失败时，如果存在旧版本则恢复旧应用路径并尝试重启；数据库、环境文件和 systemd 单元不会自动回滚，日志会明确提示。

## 4. 配置 Nginx 和 HTTPS

首次发布后，将 `current/deploy/native/nginx.conf.example` 复制到 Nginx 站点配置目录，例如 `/etc/nginx/conf.d/doubo.conf`。先替换其中域名和证书绝对路径，确认与已有站点没有重复配置，再执行：

```bash
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
curl --fail https://你的测试域名/health/ready
```

后台地址：`https://你的测试域名`，账号为配置的 `ADMIN_USER` / `ADMIN_PASSWORD`。

Nginx 将 `/api/`、`/media/`、`/s/`、`/health/` 原路径转给 Go；不把本地上传目录直接公开。静态文件启用 gzip，哈希资源长期缓存，HTML 每次重新验证。旧哈希资源保留在共享目录，防止已打开的网页在更新后加载子页面失败。部署脚本检查的是本机 API / Worker；HTTPS、证书和外部访问必须再按上面的命令验收。

## 5. 连接小程序与验收

1. 修改 `miniprogram/config.ts` 的 `API_BASE` 为 `https://你的测试域名`，**不追加 `/api`**；小程序 AppID 与服务端一致。
2. 微信平台配置对应 request / uploadFile 合法域名；downloadFile 还要覆盖实际返回的 OSS 下载域名。
3. 开发者工具构建 npm、编译，上传体验版并在手机验证微信登录。
4. 后台“模型管理 → 同步上游”，配置并上架模型、创建和上架模板。空测试库不会自动导入本地临时模板或用户。
5. 创建服务商和激活码 / 二维码，验证未激活用户被拦截、激活后正常使用。真实生成会消耗上游额度，请按需验证。
6. 确认上传、任务状态、生成结果和 OSS 下载正常，再验收已配置的支付等外部服务。

## 6. 日常维护与扩容

```bash
sudo systemctl status doubo@serve doubo@worker
sudo journalctl -u doubo-migrate -u doubo@serve -u doubo@worker -n 100 --no-pager
sudo systemctl restart doubo@serve doubo@worker
readlink -f /opt/doubo/current
```

发布版本保存在 `/opt/doubo/releases/`；上传文件和历史前端资源在 `/opt/doubo/shared/`。配置修改后重启两个服务。定期备份 MySQL 和 OSS，并按保留策略清理旧版本与无引用文件；发布脚本不会自动删除业务数据或历史版本。

以后扩容时，API 节点接同一 MySQL、Redis、OSS，Nginx / 负载均衡转发到多个 API；Worker 可在其他主机独立启动。迁移阶段只能执行一次，不要让多台主机同时执行部署迁移。当前这套脚本用于单主机，不宣称多主机滚动发布或零中断。

云效官方资料：[代码源](https://help.aliyun.com/zh/yunxiao/user-guide/configure-pipeline-source)、[构建物上传](https://help.aliyun.com/zh/yunxiao/user-guide/upload-general-product-warehouse)、[主机部署](https://help.aliyun.com/zh/yunxiao/user-guide/host-deployment-1)、[主机组](https://help.aliyun.com/zh/yunxiao/user-guide/host-group-management)。
