# TryItOut / 试一下

> 重要选择，先试一下。

TryItOut 是一个 AI 多 Agent 决策沙盘。你可以输入副业想法、恋爱困境或重大人生选择，让一组带有不同目标、立场和约束的 AI Agent 共同模拟、博弈和拷打，最后生成风险、机会、路线对比和下一步行动建议。

![TryItOut 首页工具台截图](docs/assets/desktop-home-toolbench.png)

## 这是什么

普通 AI 建议工具通常是：

```text
用户提问 -> AI 给建议
```

TryItOut 想做的是：

```text
用户描述现实选择 -> AI 建立小世界 -> 多个 Agent 压测路线 -> 输出可执行报告
```

它不是预测未来，也不是替你做决定。它的价值是把假设、风险、机会成本和下一步行动摊开，让你在真正行动前先模拟一遍。

## 支持场景

- **副业搞钱沙盘**：让目标客户、竞品、平台流量、执行教练、现金流和风险审计一起压测项目想法。
- **恋爱聊天沙盘**：模拟不同回复方式、情绪边界、关系推进、误解风险和翻车点。
- **重大抉择沙盘**：比较考研/就业、离职/留下、大城市/老家、稳定/高增长等人生路线。

## Agent 能力重点

TryItOut 的核心不是单轮问答，而是把多个 Agent 组织成一个可协作、可质疑、可复盘的推演系统：

- **场景化 Agent 编排**：根据副业、恋爱或人生选择自动组织不同角色，例如目标客户、竞品观察者、执行教练、风险审计、情绪边界观察员和路线评估员。
- **多立场压测**：不同 Agent 会从各自目标和约束出发，暴露薄弱假设、隐藏成本、二阶风险、误解空间和被忽略的机会。
- **深度互动运行时**：可选深度模式支持世界事件、Agent 行动、投票、仲裁、记忆和跨 Agent 校验，让推演更接近一场小型协作实验。
- **可解释结果汇总**：最终报告会把 Agent 讨论沉淀为路线对比、风险机会、后悔风险和 7 天行动计划。
- **多模型编排能力**：通过 AI Gateway 支持 Gemini、Anthropic 和 OpenAI-compatible Provider，Agent 工作流不绑定单一模型服务。

## 核心亮点

- 多 Agent 推演引擎，包含角色卡、激活、组合和安全校验。
- 沉浸式首页工具台，保留可拖拽旋转的 3D 星图球，方便快速选择场景。
- 三类高共鸣场景：副业、恋爱、人生选择。
- 支持快速分阶段推演，也支持更深入的 Agent 互动模式。
- Agent 协作原语包括世界事件、行动、投票、仲裁、记忆、校验和成本记录。
- 推演过程有实时进度和 Agent 协作可视化。
- 报告包含风险、机会、路线对比、后悔风险和 7 天行动计划。
- 支持 Gemini、Anthropic、OpenAI-compatible API。
- 目前已有 300+ 自动化测试覆盖 Prompt、UI、服务端流程、任务恢复、校验和成本记录。

## 截图

| 首页 | 移动端 | 推演过程 |
| --- | --- | --- |
| ![首页](docs/assets/desktop-home-toolbench.png) | ![移动端](docs/assets/mobile-home-toolbench.png) | ![推演过程](docs/assets/desktop-progress-active-collaboration.png) |

## 技术栈

- React 19
- Vite
- TypeScript
- Tailwind CSS
- Express
- Motion
- Gemini / Anthropic / OpenAI-compatible provider
- Node test runner with `tsx --test`

## 目录结构

```text
.
├── frontend/                 # React 应用和 Express 服务端
│   ├── src/components/        # 产品界面、报告页、分享卡片
│   ├── src/server/            # 推演引擎、AI 网关、校验 API
│   ├── src/contracts/         # 任务协议和共享类型
│   └── package.json
├── docs/
│   ├── assets/                # README 精选截图
│   ├── operations/            # 商业部署和运维 Runbook
│   └── plans/                 # 设计和实现记录
├── COMMERCIAL-LICENSE.md      # 商业授权说明
├── LICENSE                    # 当前非商业源码许可
└── README.md
```

## 本地运行

### 环境要求

- Node.js 20+
- npm
- 至少一个 AI Provider Key

### 安装

```bash
cd frontend
npm install
cp .env.example .env
```

编辑 `frontend/.env`，配置至少一个模型服务：

```bash
AI_PROVIDER="gemini"
GEMINI_API_KEY="your_api_key"
```

Anthropic：

```bash
AI_PROVIDER="anthropic"
ANTHROPIC_API_KEY="your_api_key"
```

OpenAI-compatible：

```bash
AI_PROVIDER="openai_compatible"
OPENAI_COMPATIBLE_API_KEY="your_api_key"
OPENAI_COMPATIBLE_BASE_URL="https://api.openai.com/v1"
OPENAI_COMPATIBLE_MODEL_FAST="gpt-4o-mini"
OPENAI_COMPATIBLE_MODEL_BALANCED="gpt-4o"
OPENAI_COMPATIBLE_MODEL_DEEP="gpt-4o"
```

### 启动开发服务

```bash
npm run dev
```

开发服务从 `frontend/server.ts` 启动，同时提供 API 和前端页面。

### 深度 Agent 模式

默认使用较快的分阶段推演。若要启用更深入的 Agent 互动、世界事件、投票、仲裁和记忆，需要设置：

```bash
ENABLE_AGENT_INTERACTION_MODE="true"
```

深度模式会产生更多模型调用，因此更慢，也更贵。

### 商用 MVP 模式

商用模式是付费路径，不是内存演示路径。开启后账号、服务端 session、访问码、积分、任务、报告、反馈、分析事件、系统设置和审计日志都必须落到 Postgres；队列必须使用 Redis/BullMQ。

开启商用模式：

```bash
COMMERCIAL_MODE_ENABLED="true"
```

必需的外部服务和密钥：

```bash
DATABASE_URL="postgres://tryitout:tryitout@localhost:5432/tryitout"
REDIS_URL="redis://localhost:6379"
SESSION_SECRET="long-random-secret"
ACCESS_CODE_PEPPER="long-random-pepper"
USER_SECRET_ENCRYPTION_KEY="$(openssl rand -base64 32)"
```

迁移文件在 `frontend/db/migrations/`，按文件名顺序执行；数据库说明见 [`frontend/db/README.md`](frontend/db/README.md)。缺少必需环境变量时，商用模式启动会直接失败。

商用任务必须有服务端 session、足够积分和事务化 credit hold。`COMMERCIAL_MODE_ENABLED=true` 时，未认证的旧版 `/api/simulation-tasks`、`/api/simulations`、`/api/simulations/stream` 不允许绕过积分路径。

队列和价格配置：

```bash
MAX_WEIGHTED_CONCURRENCY="6"
PLATFORM_LEGACY_CREDIT_COST="1"
PLATFORM_DEEP_CREDIT_COST="3"
BYOK_LEGACY_CREDIT_COST="1"
BYOK_DEEP_CREDIT_COST="2"
```

BYOK 自定义模型服务只开放给带有 `custom_model_provider` 权益的用户。用户 API Key 使用 `USER_SECRET_ENCRYPTION_KEY` 做 AES-GCM 加密；Provider URL 必须是 HTTPS、显式允许的 Host，且不能指向 localhost、私网、链路本地地址、云元数据 IP 或不安全重定向。

### Docker Compose 部署

单机 Docker Compose 部署已提供 `app`、`worker`、`postgres`、`redis`：

```bash
cp deploy/docker.env.example deploy/docker.env
# 编辑 deploy/docker.env，填入真实密钥和模型服务 Key。
docker compose build
docker compose up -d postgres redis
```

之后按顺序执行平台化数据库迁移、初始化管理员，再启动 `app` 和 `worker`。完整步骤见 [`docs/operations/docker-deployment.md`](docs/operations/docker-deployment.md)。

## 常用命令

在 `frontend/` 目录运行：

```bash
npm run dev                  # 启动本地服务
npm run worker               # 用 tsx 启动商业 worker
npm run lint                 # TypeScript 类型检查
npm test                     # 运行测试
npm run build                # 构建前端、服务端、worker 和 admin seed
npm start                    # 运行构建后的服务
npm run start:worker         # 运行构建后的 worker
npm run seed:admin             # 初始化 owner/admin
npm run export:access-codes    # 安全导出创建期兑换码 raw payload
```

## 商业部署和运维

商业正式版通过 `COMMERCIAL_MODE_ENABLED=true` 开启，需要 Postgres、Redis、API 进程、worker 进程、会话密钥、兑换码 pepper 和 32 字节 base64 的 `USER_SECRET_ENCRYPTION_KEY`。

Docker Compose 部署见 [`docs/operations/docker-deployment.md`](docs/operations/docker-deployment.md)。更完整的商业平台运维文档见 [`docs/operations/commercial-platform-runbook.md`](docs/operations/commercial-platform-runbook.md)，覆盖数据库迁移、管理员 seed、额度和兑换码、BYOK 密钥加密、队列监控、备份、隐私、安全和故障处理。

## 当前验证状态

- `npm run lint`：TypeScript 类型检查。
- `npm test`：运行前端、服务端、商业后台和脚本测试。
- `npm run build`：构建前端和服务端。Vite 可能提示主 JS chunk 超过 500 kB，这是后续性能优化项。

## 隐私与安全

不要提交：

- `.env` 文件或 API Key；
- 用户真实聊天记录、情感细节、职业财务信息或其他隐私输入；
- `output/agent-debug/*.jsonl` 里的 Prompt 和模型输出；
- 本地日志或运行生成内容。

生成内容只用于模拟和决策参考，不构成投资、法律、医疗、心理、职业、情感或财务建议。

## 授权协议

当前版本不再使用 MIT 协议。

本项目采用非商业源码可见许可，详见 [`LICENSE`](LICENSE)。你可以用于学习、研究、评估和非商业实验。任何商业使用都需要获得作者的书面商业授权，详见 [`COMMERCIAL-LICENSE.md`](COMMERCIAL-LICENSE.md)。

商业使用包括但不限于 SaaS、付费报告、客户项目交付、私有化部署、企业内部业务流程、白标、转售、咨询交付或任何营收相关用途。

## 路线图

- 更完整的部署文档。
- 可离线演示的 Demo Mode。
- 更多模型服务配置示例。
- 报告导出和分享图优化。
- 更多场景模板。
- 前端性能优化和代码分包。
- 更完整的持久化后端。
