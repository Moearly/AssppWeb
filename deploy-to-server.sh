#!/bin/bash
#
# 部署到生产服务器脚本
#

set -e

SERVER="156.226.173.202"
SERVER_USER="root"
SERVER_PATH="/root/AssppWeb"

echo "🚀 部署到生产服务器"
echo "==================="
echo ""
echo "服务器: $SERVER"
echo "路径: $SERVER_PATH"
echo ""

# 1. 推送代码到 Git
echo "📤 步骤 1/4: 推送代码到 Git"
echo ""
read -p "是否推送到 Git? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  git add .
  git commit -m "部署: 账号池白名单模式 v2.0" || echo "无需提交"
  git push origin main
  echo "✅ 代码已推送"
else
  echo "⚠️  跳过推送，请确保服务器代码是最新的"
fi

echo ""

# 2. SSH 连接到服务器并部署
echo "🔗 步骤 2/4: 连接到服务器"
echo ""

ssh $SERVER_USER@$SERVER << 'ENDSSH'
set -e

cd /root/AssppWeb

echo "📥 步骤 3/4: 拉取最新代码"
git pull origin main

echo ""
echo "🏗️  步骤 4/4: 重新构建并启动"

# 检查是否有 .env.generated
if [ ! -f ".env.generated" ]; then
  echo "⚠️  未找到 .env.generated，生成新配置..."
  bash deploy-manual.sh
else
  echo "✅ 使用现有配置"
  source .env.generated
  export ADMIN_API_KEY
  export ACCOUNT_POOL_KEY
  docker compose down
  docker compose build
  docker compose up -d
fi

echo ""
echo "🔍 检查服务状态"
sleep 3
docker compose ps
docker compose logs --tail=20

echo ""
echo "✅ 部署完成！"
echo ""
echo "访问: https://chatvpn.site"
echo ""

ENDSSH

echo ""
echo "🎉 服务器部署完成！"
echo ""
echo "📋 下一步:"
echo "   1. 访问 https://chatvpn.site"
echo "   2. 配置管理员（如果是首次部署）"
echo "   3. 添加账号和白名单应用"
echo ""
