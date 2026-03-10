#!/bin/bash
#
# 快速验证改造是否成功
#

set -e

echo "🧪 验证改造..."
echo ""

# 1. 检查前端代码
echo "✅ 检查 PoolStorePage 改造..."
if grep -q "whitelistApps" frontend/src/components/Pool/PoolStorePage.tsx; then
  echo "   ✓ 白名单应用功能已添加"
else
  echo "   ✗ 白名单应用功能未找到"
  exit 1
fi

if grep -q "loadWhitelistApps" frontend/src/components/Pool/PoolStorePage.tsx; then
  echo "   ✓ 加载白名单函数已添加"
else
  echo "   ✗ 加载白名单函数未找到"
  exit 1
fi

# 2. 检查部署脚本
echo ""
echo "✅ 检查部署脚本..."
if [ -f "deploy-manual.sh" ] && [ -x "deploy-manual.sh" ]; then
  echo "   ✓ deploy-manual.sh 存在且可执行"
else
  echo "   ✗ deploy-manual.sh 不存在或不可执行"
  exit 1
fi

# 3. 检查管理员 CLI
echo ""
echo "✅ 检查管理员 CLI..."
if [ -f "admin-cli.sh" ] && [ -x "admin-cli.sh" ]; then
  echo "   ✓ admin-cli.sh 存在且可执行"
else
  echo "   ✗ admin-cli.sh 不存在或不可执行"
  exit 1
fi

# 4. 检查文档
echo ""
echo "✅ 检查文档..."
if [ -f "docs/14-管理员配置与部署完整指南.md" ]; then
  echo "   ✓ 管理员配置文档已创建"
else
  echo "   ✗ 管理员配置文档未找到"
  exit 1
fi

# 5. 检查后端鉴权
echo ""
echo "✅ 检查后端鉴权..."
if grep -q "requireAdminAuth" backend/src/routes/admin/pool.ts; then
  echo "   ✓ 管理员鉴权中间件已应用"
else
  echo "   ✗ 管理员鉴权中间件未找到"
  exit 1
fi

echo ""
echo "🎉 所有检查通过！改造完成！"
echo ""
echo "📋 下一步:"
echo "   1. 部署服务: bash deploy-manual.sh"
echo "   2. 配置管理员: 访问 http://localhost:8080 → 管理 → 管理员设置"
echo "   3. 添加账号: bash admin-cli.sh pool:add"
echo "   4. 添加白名单: 访问 http://localhost:8080 → 管理 → 白名单管理"
echo ""
