# 脚本管理目录

本目录包含 AssppWeb 的所有管理和部署脚本。

---

## 📂 脚本列表

### 🚀 部署脚本

#### `deploy.sh`
**用途**: 自动部署脚本（本地和服务器通用）

**功能**:
- 自动生成 ADMIN_API_KEY 和 ACCOUNT_POOL_KEY
- 初始化数据库
- 构建 Docker 镜像
- 启动服务

**使用方法**:
```bash
# 本地部署
bash scripts/deploy.sh

# 服务器部署（SSH 到服务器后执行）
cd /root/AssppWeb
bash scripts/deploy.sh
```

---

### 🛠️ 管理工具

#### `admin-cli.sh`
**用途**: 管理员命令行工具

**功能**:
- 账号池管理（添加、删除、查看账号）
- 白名单管理（添加、删除、查看应用）
- 健康检查（检查账号状态）
- 统计信息（查看账号池使用情况）

**使用方法**:
```bash
# 查看帮助
bash scripts/admin-cli.sh help

# 账号池管理
bash scripts/admin-cli.sh pool:list          # 列出所有账号
bash scripts/admin-cli.sh pool:add           # 添加账号
bash scripts/admin-cli.sh pool:delete <id>   # 删除账号
bash scripts/admin-cli.sh pool:stats         # 查看统计

# 白名单管理
bash scripts/admin-cli.sh whitelist:list     # 列出白名单
bash scripts/admin-cli.sh whitelist:add      # 添加应用

# 健康检查
bash scripts/admin-cli.sh health:check       # 检查所有账号
```

---

### 🧪 测试脚本

#### `verify-changes.sh`
**用途**: 验证改造是否完成

**功能**:
- 检查前端改造（PoolStorePage 白名单功能）
- 检查部署脚本是否存在
- 检查文档是否创建
- 检查后端鉴权是否配置

**使用方法**:
```bash
bash scripts/verify-changes.sh
```

---

## ⚠️ 安全提示

### 不要提交的文件

以下类型的脚本**不应该**提交到 Git：

```bash
# ❌ 包含密码或密钥的脚本
scripts/deploy-with-password.sh
scripts/server-credentials.sh
scripts/*-secret.sh

# ❌ 个人配置脚本
scripts/my-*.sh
scripts/local-*.sh
```

这些已在 `.gitignore` 中配置。

### 创建个人部署脚本（可选）

如果需要创建包含服务器密码的个人脚本，命名规则：

```bash
# 创建个人脚本（不会被 Git 追踪）
touch scripts/deploy-production.sh
chmod +x scripts/deploy-production.sh

# 在脚本中使用环境变量而非硬编码
#!/bin/bash
SERVER=${DEPLOY_SERVER:-"root@156.226.173.202"}
# 不要写: PASSWORD="your-password"
# 使用: read -sp "Password: " PASSWORD
```

---

## 📚 相关文档

- [生产服务器部署手册](../docs/生产服务器部署手册.md)
- [04-管理员配置与部署完整指南](../docs/04-管理员配置与部署完整指南.md)
- [应用白名单配置指南](../docs/应用白名单配置指南.md)

---

## 🔄 脚本更新历史

- **2026-03-10**: 整理所有脚本到 scripts/ 目录
- **2026-03-10**: 删除包含密码的不安全脚本
- **2026-03-10**: 简化为 3 个核心脚本

---

## 💡 最佳实践

1. **密码管理**: 使用环境变量或密钥管理工具，不要硬编码密码
2. **权限控制**: 所有脚本设置为可执行 `chmod +x scripts/*.sh`
3. **文档同步**: 修改脚本后及时更新本 README
4. **版本控制**: 通用脚本提交到 Git，个人脚本保留本地

---

**最后更新**: 2026-03-10  
**维护者**: AssppWeb Team
