#!/bin/bash
#
# AssppWeb 账号池模式 - 自动部署脚本
# 自动生成密钥、初始化数据库、构建并启动服务
#

set -e

echo "🚀 AssppWeb 账号池模式部署"
echo "============================="
echo ""

# 1. 检查必要的环境变量
echo "📋 步骤 1/5: 检查环境变量"
echo ""

# 生成或使用现有的 API Key
if [ -z "$ADMIN_API_KEY" ]; then
  ADMIN_API_KEY=$(openssl rand -hex 32)
  echo "🔑 自动生成 ADMIN_API_KEY: $ADMIN_API_KEY"
  echo "   请妥善保存此密钥！"
else
  echo "✅ 使用已配置的 ADMIN_API_KEY"
fi

# 生成或使用现有的加密密钥
if [ -z "$ACCOUNT_POOL_KEY" ]; then
  ACCOUNT_POOL_KEY=$(openssl rand -hex 32)
  echo "🔐 自动生成 ACCOUNT_POOL_KEY: $ACCOUNT_POOL_KEY"
  echo "   请妥善保存此密钥！"
else
  echo "✅ 使用已配置的 ACCOUNT_POOL_KEY"
fi

# 保存到 .env.generated
cat > .env.generated << EOF
# AssppWeb 账号池模式配置
# 生成时间: $(date)

# 管理员 API Key（用于访问管理后台）
ADMIN_API_KEY=$ADMIN_API_KEY

# 账号池加密密钥（用于加密存储 Apple ID 密码）
ACCOUNT_POOL_KEY=$ACCOUNT_POOL_KEY

# 其他配置（可选）
# PORT=8080
# DATA_DIR=./data
# PUBLIC_BASE_URL=https://your-domain.com
# AUTO_CLEANUP_DAYS=7
# AUTO_CLEANUP_MAX_MB=10240
EOF

echo ""
echo "✅ 配置已保存到 .env.generated"
echo ""

# 2. 初始化数据库
echo "💾 步骤 2/5: 初始化数据库"
mkdir -p data
if [ ! -f "data/pool.db" ]; then
  echo "   创建新数据库..."
  # Docker 启动后会自动初始化
else
  echo "   数据库已存在，跳过初始化"
fi

echo ""
echo "✅ 数据库准备完成"
echo ""

# 3. 构建 Docker 镜像
echo "🏗️  步骤 3/5: 构建 Docker 镜像"
docker compose build

echo ""
echo "✅ Docker 镜像构建完成"
echo ""

# 4. 启动服务
echo "🚀 步骤 4/5: 启动服务"
# 将环境变量传递给 docker compose
export ADMIN_API_KEY
export ACCOUNT_POOL_KEY
docker compose up -d

echo ""
echo "✅ 服务已启动"
echo ""

# 5. 检查服务状态
echo "🔍 步骤 5/5: 检查服务状态"
sleep 3  # 等待服务启动
docker compose ps

echo ""
echo "✅ 部署完成！"
echo ""

# 6. 显示管理员配置信息
echo "📋 管理员配置"
echo "===================="
echo ""
echo "🔑 管理员 API Key:"
echo "   $ADMIN_API_KEY"
echo ""
echo "📱 使用方法:"
echo "   1. 打开浏览器访问: http://localhost:8080"
echo "   2. 点击 \"管理\" → \"管理员设置\""
echo "   3. 输入上面的 API Key"
echo "   4. 点击 \"测试连接\" 和 \"保存配置\""
echo ""
echo "⚠️  重要提示:"
echo "   - 请将 API Key 保存到安全的地方"
echo "   - 配置文件已保存到: .env.generated"
echo "   - 如需重新部署，请使用 docker compose down && bash deploy-manual.sh"
echo ""
