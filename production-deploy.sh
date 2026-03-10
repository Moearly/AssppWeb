#!/bin/bash
#
# 生产服务器部署脚本 - 在服务器上执行此脚本
# 使用方法: bash production-deploy.sh
#

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 AssppWeb v2.0 生产环境部署"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "服务器: $(hostname)"
echo "当前目录: $(pwd)"
echo "当前时间: $(date)"
echo ""

# 步骤 1: 检查当前位置
echo "📍 步骤 1/7: 检查项目目录"
if [ ! -d ".git" ]; then
  echo "❌ 错误: 当前目录不是 Git 仓库"
  echo "   请先 cd 到 /root/AssppWeb 目录"
  exit 1
fi
echo "✅ 当前在正确的项目目录"
echo ""

# 步骤 2: 备份现有配置
echo "💾 步骤 2/7: 备份现有配置"
if [ -f ".env.generated" ]; then
  cp .env.generated .env.generated.backup
  echo "✅ 已备份 .env.generated"
  
  # 显示现有的 API Key
  echo ""
  echo "现有配置:"
  cat .env.generated
  echo ""
else
  echo "⚠️  未找到现有配置，将在部署后生成新配置"
fi
echo ""

# 步骤 3: 拉取最新代码
echo "📥 步骤 3/7: 拉取最新代码"
git fetch origin
CURRENT_COMMIT=$(git rev-parse HEAD)
LATEST_COMMIT=$(git rev-parse origin/main)

if [ "$CURRENT_COMMIT" == "$LATEST_COMMIT" ]; then
  echo "✅ 已是最新代码"
else
  echo "当前版本: ${CURRENT_COMMIT:0:7}"
  echo "最新版本: ${LATEST_COMMIT:0:7}"
  git pull origin main
  echo "✅ 代码已更新"
fi
echo ""

# 步骤 4: 停止旧服务
echo "🛑 步骤 4/7: 停止旧服务"
docker compose down
echo "✅ 旧服务已停止"
echo ""

# 步骤 5: 构建新镜像
echo "🏗️  步骤 5/7: 构建新镜像"
docker compose build --no-cache
echo "✅ 新镜像构建完成"
echo ""

# 步骤 6: 启动新服务
echo "🚀 步骤 6/7: 启动新服务"
if [ -f ".env.generated" ]; then
  echo "使用现有配置启动..."
  source .env.generated
  export ADMIN_API_KEY
  export ACCOUNT_POOL_KEY
  docker compose up -d
else
  echo "使用部署脚本生成配置并启动..."
  bash deploy-manual.sh
fi
echo "✅ 新服务已启动"
echo ""

# 步骤 7: 检查服务状态
echo "🔍 步骤 7/7: 检查服务状态"
sleep 5
echo ""
echo "容器状态:"
docker compose ps
echo ""
echo "最近日志:"
docker compose logs --tail=30
echo ""

# 健康检查
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 健康检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查 API
if curl -s http://localhost:8080/api/settings > /dev/null 2>&1; then
  echo "✅ API 健康检查通过"
  curl -s http://localhost:8080/api/settings | jq .
else
  echo "❌ API 健康检查失败"
fi
echo ""

# 显示访问信息
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 部署完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌐 访问地址:"
echo "   HTTPS: https://chatvpn.site"
echo "   HTTP:  http://156.226.173.202:8080"
echo ""

if [ -f ".env.generated" ]; then
  echo "🔑 管理员 API Key:"
  grep ADMIN_API_KEY .env.generated | cut -d'=' -f2
  echo ""
  echo "请使用此 API Key 在 Web 界面配置管理员权限"
fi

echo ""
echo "📋 后续步骤:"
echo "   1. 访问 https://chatvpn.site"
echo "   2. 验证新界面（应用商店页面应显示白名单列表）"
echo "   3. 配置管理员（管理 → 管理员设置）"
echo "   4. 添加账号到账号池"
echo "   5. 添加应用到白名单"
echo ""
echo "📚 参考文档:"
echo "   - docs/04-管理员配置与部署完整指南.md"
echo "   - docs/生产服务器部署手册.md"
echo "   - docs/应用白名单配置指南.md"
echo ""
