# AssppWeb - 中文说明

> 零信任架构的 iOS 应用下载工具 + 账号池共享模式

基于浏览器的 iOS 应用获取工具，支持两种模式：

1. **零信任模式**（原版）：用户使用自己的 Apple ID，凭证仅存储在浏览器本地
2. **账号池模式**（v2.0 新增）：管理员维护共享账号池，用户无需配置即可下载白名单应用

---

## ✨ 核心特性

### 零信任架构（原版）
- 🔐 **浏览器端加密**：所有 Apple 凭证存储在 IndexedDB，服务器永远无法访问
- 🌐 **WASM 直连**：通过 libcurl.js（Mbed TLS 1.3）在浏览器中直接与 Apple 服务器通信
- 🚫 **服务器盲代理**：服务器仅作为 Wisp 协议盲传 TCP 隧道，无法解密流量

### 账号池模式（v2.0 新增）
- 👥 **零配置使用**：普通用户无需 Apple ID，点击即用
- 🎯 **白名单机制**：管理员预先配置可下载的应用列表，避免 NoAccount 错误
- 🔒 **服务端加密**：共享账号使用 AES-256-GCM 加密存储
- 🏥 **健康检查**：自动检测账号状态，及时处理过期令牌
- 🎛️ **管理员界面**：Web 界面 + CLI 工具双重管理方式

---

## 🚀 快速开始

### 方式一：账号池模式（推荐给团队/组织）

**适用场景**：多人使用，管理员维护账号池和白名单

#### 1. 部署服务器（一键部署）

```bash
git clone https://github.com/your-repo/AssppWeb.git
cd AssppWeb
bash deploy-manual.sh  # 自动生成密钥并启动
```

部署完成后会显示管理员 API Key，请妥善保存。

#### 2. 配置管理员

访问 `http://your-server:8080`：
1. 点击 **"管理"** → **"管理员设置"**
2. 输入部署时生成的 API Key
3. 点击 **"测试连接"** 和 **"保存配置"**

#### 3. 添加账号和应用

**方式 A - Web 界面**（推荐）：
- **账号池管理** → **"添加账号"** → 输入 Apple ID 信息
- **白名单管理** → **"搜索应用"** → 添加应用到白名单

**方式 B - CLI 工具**（推荐运维）：
```bash
# 添加账号
bash admin-cli.sh pool:add

# 添加白名单应用
bash admin-cli.sh whitelist:add

# 查看账号池状态
bash admin-cli.sh pool:stats
```

#### 4. 用户使用

用户访问 `http://your-server:8080`：
1. 点击 **"应用商店"**
2. 点击 **"分配账号"**（自动获取共享账号）
3. 浏览白名单应用列表
4. 点击 **"下载"** → **"安装"**

📚 **详细文档**: [账号池模式快速开始](./docs/账号池模式快速开始.md)

---

### 方式二：零信任模式（个人使用）

**适用场景**：个人使用，自己的 Apple ID

#### 1. 部署服务器

```bash
docker compose up -d --build
```

#### 2. 用户使用

访问 `http://localhost:8080`：
1. 点击 **"账号"** → **"添加账号"**
2. 输入自己的 Apple ID 和密码
3. 点击 **"搜索"** 查找应用
4. 点击 **"下载"** → **"安装"**

📚 **详细文档**: [快速开始](./docs/00-快速开始.md)

---

## 📖 文档

### 新用户入门
- [快速开始](./docs/00-快速开始.md) - 基础使用教程
- [账号池模式快速开始](./docs/账号池模式快速开始.md) - 零配置使用方案
- [管理员配置与部署完整指南](./docs/14-管理员配置与部署完整指南.md) - 管理员部署和配置

### 系统架构
- [技术架构与实现](./docs/01-技术架构与实现.md) - 零信任架构原理
- [账号池改造分析与方案](./docs/03-账号池改造分析与方案.md) - 账号池设计思路

### 部署运维
- [Docker部署指南](./docs/04-Docker部署指南.md) - 容器化部署
- [完整部署指南与经验总结](./docs/12-完整部署指南与经验总结.md) - 生产环境部署
- [部署总结](./docs/部署总结.md) - v2.0 账号池改造总结

### 故障排查
- [故障排查指南](./docs/08-故障排查指南.md) - 常见问题解决
- [NoAccount错误排查与解决方案](./docs/13-NoAccount错误排查与解决方案.md) - NoAccount 错误处理

### 开发相关
- [开发者指南](./docs/05-开发者指南.md) - 开发环境搭建
- [API文档](./docs/07-API文档.md) - 后端 API 接口
- [测试指南](./docs/10-测试指南.md) - 测试规范

📚 **完整文档索引**: [docs/README.md](./docs/README.md)

---

## 🔧 管理员工具

### CLI 工具命令

```bash
# 初始化配置
bash admin-cli.sh setup

# 账号池管理
bash admin-cli.sh pool:list          # 列出所有账号
bash admin-cli.sh pool:add           # 添加账号
bash admin-cli.sh pool:delete <id>   # 删除账号
bash admin-cli.sh pool:stats         # 查看统计

# 白名单管理
bash admin-cli.sh whitelist:list     # 列出白名单
bash admin-cli.sh whitelist:add      # 添加应用

# 健康检查
bash admin-cli.sh health:check       # 检查所有账号
```

---

## 🆚 两种模式对比

| 特性 | 零信任模式 | 账号池模式 |
|------|----------|----------|
| **适用场景** | 个人使用 | 团队/组织使用 |
| **用户配置** | 需要自己的 Apple ID | 无需配置，点击即用 |
| **可下载应用** | 任意应用（需已"获取"） | 白名单应用 |
| **NoAccount 错误** | 可能出现 | 不会出现（白名单） |
| **隐私保护** | 凭证仅存浏览器 | 共享账号服务端加密 |
| **管理成本** | 无 | 需维护账号池和白名单 |
| **多人使用** | 每人独立账号 | 共享账号池 |

---

## 🔐 安全说明

### 零信任模式
- ✅ 所有 Apple 凭证仅存储在用户浏览器 IndexedDB
- ✅ 服务器无法访问用户密码、令牌、Cookie
- ✅ Wisp 协议仅传输加密流量，服务器无法解密

### 账号池模式
- ✅ 共享账号使用 AES-256-GCM 加密存储
- ✅ 管理员 API Key 采用 64 字符十六进制密钥
- ✅ 所有管理操作需要 API Key 鉴权
- ⚠️ 共享账号存储在服务器数据库（已加密）

---

## ❓ 常见问题

### Q: 账号池模式安全吗？

**A**: 账号池模式的共享账号使用 AES-256-GCM 加密存储在服务器数据库。只要 `ACCOUNT_POOL_KEY` 不泄露，数据是安全的。相比零信任模式，账号池模式的隐私保护级别较低（服务器可解密账号），但对于团队/组织使用场景，这是可接受的权衡。

### Q: 用户看不到应用列表？

**A**: 白名单为空。管理员需要先添加应用到白名单：
- Web 界面：**管理** → **白名单管理** → **搜索应用**
- CLI 工具：`bash admin-cli.sh whitelist:add`

### Q: 为什么移除了搜索功能？

**A**: 在账号池模式下，用户如果搜索到白名单之外的应用，下载时会遇到 `MZFinance.NoAccount_message` 错误（因为共享账号未在 App Store "获取"该应用）。改为白名单机制后，用户只能看到管理员预先配置且已"获取"的应用，避免了这个问题。

详见：[NoAccount错误排查与解决方案](./docs/13-NoAccount错误排查与解决方案.md)

### Q: 如何备份数据？

**A**: 备份以下两个文件：
```bash
# 数据库
docker cp assppweb-asspp-1:/app/data/pool.db ./backup/

# 配置文件（包含加密密钥）
cp .env.generated ./backup/
```

**⚠️ 重要**: 如果 `ACCOUNT_POOL_KEY` 丢失，所有加密的账号密码将无法解密！

---

## 🛠️ 技术栈

### 前端
- React 19 + TypeScript
- React Router 7
- Tailwind CSS 4
- Zustand（状态管理）
- libcurl.js（WASM）
- Mbed TLS 1.3

### 后端
- Node.js + Express
- TypeScript + ESM
- SQLite（账号池数据库）
- Wisp 协议（@mercuryworkshop/wisp-js）
- AES-256-GCM（账号加密）

### 部署
- Docker + Docker Compose
- 单容器部署（前后端一体）

---

## 📝 更新日志

### v2.0 - 账号池模式（2026-03-10）

**新增功能**:
- ✅ 账号池管理系统（Web 界面 + CLI 工具）
- ✅ 白名单机制（避免 NoAccount 错误）
- ✅ 管理员 API Key 鉴权
- ✅ 账号健康检查
- ✅ 一键部署脚本

**改造内容**:
- ✅ PoolStorePage 移除搜索，改为白名单列表
- ✅ 自动加载白名单应用
- ✅ 本地搜索过滤（仅在白名单内搜索）

**工具**:
- ✅ `deploy-manual.sh` - 自动部署脚本
- ✅ `admin-cli.sh` - 管理员 CLI 工具
- ✅ `verify-changes.sh` - 改造验证脚本

**文档**:
- ✅ 14-管理员配置与部署完整指南
- ✅ 部署总结

详见：[部署总结](./docs/部署总结.md)

---

## 🙏 致谢

本项目基于 [Lakr233/AssppWeb](https://github.com/Lakr233/AssppWeb) 原版零信任架构，在此基础上新增了账号池共享模式。

感谢原作者的开源贡献！

---

## 📄 许可证

本项目采用与原项目相同的许可证。

---

## 🌐 相关链接

- **原项目**: [Lakr233/AssppWeb](https://github.com/Lakr233/AssppWeb)
- **文档中心**: [docs/README.md](./docs/README.md)
- **问题反馈**: [GitHub Issues](https://github.com/your-repo/AssppWeb/issues)

---

**最后更新**: 2026-03-10  
**版本**: v2.0 - 账号池白名单模式
