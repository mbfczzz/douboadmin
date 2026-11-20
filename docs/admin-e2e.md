# 后台网页端到端测试（Playwright）

`web/tests` 里的测试连真实 API 运行，需要以下环境，否则会出现大量与代码无关的失败：

1. **用生产构建跑**：`cd web && npx vite build && npx vite preview --host 127.0.0.1 --port 5185`。
   开发服务器里 React StrictMode 会把页面加载的副作用执行两次，「只请求一次」这类断言会多出一次请求。
2. **后端**（内存存储即可）：
   `STORAGE_DRIVER=memory RUN_WORKER=false ALLOW_DEMO_LOGIN=true HTTP_ADDR=127.0.0.1:5183 WEB_ORIGIN=http://127.0.0.1:5185 MEDIA_DIR=../media RELAY_BASE_URL=<中转站测试桩> RELAY_API_KEY=<测试 key> go run ./cmd/server serve`
   - `WEB_ORIGIN` 必须与网页地址一致，否则写操作返回「来源不允许」。
   - `ALLOW_DEMO_LOGIN=true`：用户记录、日志等测试用演示账号登录小程序接口。
   - 网页的 `/api` 代理指向后端：`DOUBO_API_TARGET=http://127.0.0.1:5183`。
3. **同步一次中转站模型**：后台「模型管理 → 同步上游」，或用管理员会话 `POST /api/admin/models/sync`。
   模型相关测试需要中转站目录里的模型。
4. 运行：`cd web && ADMIN_URL=http://127.0.0.1:5185 npx playwright test`（单进程，约 12 分钟）。

不要对着长期运行的旧版后端跑：它的代码和数据都可能落后于当前测试。
