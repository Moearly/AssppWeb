#!/bin/bash
#
# AssppWeb 管理员工具 - 命令行配置助手
# 用于快速管理账号池和白名单
#

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置文件路径
ENV_FILE=".env.generated"
API_KEY=""
BASE_URL="${PUBLIC_BASE_URL:-http://localhost:8080}"

# 加载配置
load_config() {
  if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
    API_KEY="$ADMIN_API_KEY"
  fi
}

# 打印帮助
show_help() {
  echo ""
  echo "🔧 AssppWeb 管理员工具"
  echo "===================="
  echo ""
  echo "用法: $0 <命令> [参数]"
  echo ""
  echo "命令:"
  echo "  setup              初始化管理员配置"
  echo "  pool:list          列出所有账号"
  echo "  pool:add           添加账号到账号池"
  echo "  pool:delete <id>   删除指定账号"
  echo "  pool:stats         查看账号池统计"
  echo "  whitelist:list     列出白名单应用"
  echo "  whitelist:add      添加应用到白名单"
  echo "  health:check       检查所有账号健康状态"
  echo "  help               显示帮助信息"
  echo ""
  echo "示例:"
  echo "  $0 setup                    # 首次配置"
  echo "  $0 pool:add                 # 交互式添加账号"
  echo "  $0 pool:list                # 查看所有账号"
  echo "  $0 whitelist:add            # 添加白名单应用"
  echo ""
}

# API 请求
api_request() {
  local method=$1
  local endpoint=$2
  local data=$3
  
  if [ -z "$API_KEY" ]; then
    echo -e "${RED}错误: API Key 未配置${NC}"
    echo "请先运行: $0 setup"
    exit 1
  fi
  
  local url="${BASE_URL}${endpoint}"
  
  if [ -z "$data" ]; then
    curl -s -X "$method" \
      -H "x-admin-key: $API_KEY" \
      -H "Content-Type: application/json" \
      "$url"
  else
    curl -s -X "$method" \
      -H "x-admin-key: $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$data" \
      "$url"
  fi
}

# 初始化配置
cmd_setup() {
  echo -e "${BLUE}🔧 初始化管理员配置${NC}"
  echo ""
  
  if [ -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}检测到已有配置文件: $ENV_FILE${NC}"
    read -p "是否覆盖现有配置？(y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "已取消"
      exit 0
    fi
  fi
  
  # 生成密钥
  echo "生成管理员 API Key..."
  ADMIN_API_KEY=$(openssl rand -hex 32)
  
  echo "生成账号池加密密钥..."
  ACCOUNT_POOL_KEY=$(openssl rand -hex 32)
  
  # 保存配置
  cat > "$ENV_FILE" << EOF
# AssppWeb 管理员配置
# 生成时间: $(date)

ADMIN_API_KEY=$ADMIN_API_KEY
ACCOUNT_POOL_KEY=$ACCOUNT_POOL_KEY
EOF
  
  echo ""
  echo -e "${GREEN}✅ 配置已保存到: $ENV_FILE${NC}"
  echo ""
  echo "管理员 API Key:"
  echo -e "${BLUE}$ADMIN_API_KEY${NC}"
  echo ""
  echo "请妥善保存此密钥！"
  echo ""
  echo "下一步:"
  echo "  1. 启动服务: docker compose up -d"
  echo "  2. 添加账号: $0 pool:add"
  echo ""
}

# 查看账号池统计
cmd_pool_stats() {
  echo -e "${BLUE}📊 账号池统计${NC}"
  echo ""
  
  result=$(api_request GET "/api/admin/pool/stats")
  
  if [ $? -ne 0 ]; then
    echo -e "${RED}请求失败${NC}"
    exit 1
  fi
  
  echo "$result" | jq -r '
    "总账号数: \(.total_accounts)",
    "活跃账号: \(.active_accounts)",
    "禁用账号: \(.disabled_accounts)",
    "使用中: \(.in_use_accounts)",
    "过期账号: \(.expired_accounts)"
  ' || echo "$result"
}

# 列出所有账号
cmd_pool_list() {
  echo -e "${BLUE}📋 账号池列表${NC}"
  echo ""
  
  result=$(api_request GET "/api/admin/pool/accounts")
  
  if [ $? -ne 0 ]; then
    echo -e "${RED}请求失败${NC}"
    exit 1
  fi
  
  # 使用简单的格式化输出（兼容 macOS）
  echo "$result" | jq -r '
    ["ID", "邮箱", "国家", "状态", "最后使用"],
    ["--", "----", "----", "----", "--------"],
    (.[] | [.id, .email, .country, .status, (.last_used // "从未使用")]) | @tsv
  ' | column -t -s $'\t'
}

# 添加账号
cmd_pool_add() {
  echo -e "${BLUE}➕ 添加账号到账号池${NC}"
  echo ""
  
  read -p "Apple ID 邮箱: " email
  read -sp "密码: " password
  echo ""
  read -p "国家/地区 (US): " country
  country=${country:-US}
  
  read -p "设备标识符 (留空自动生成): " device_id
  if [ -z "$device_id" ]; then
    device_id=$(openssl rand -hex 6)
  fi
  
  echo ""
  echo "正在添加账号..."
  
  data=$(jq -n \
    --arg email "$email" \
    --arg password "$password" \
    --arg country "$country" \
    --arg device_id "$device_id" \
    '{email: $email, password: $password, country: $country, deviceIdentifier: $device_id}')
  
  result=$(api_request POST "/api/admin/pool/accounts" "$data")
  
  if echo "$result" | jq -e '.id' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 账号添加成功${NC}"
    echo "$result" | jq -r '
      "ID: \(.id)",
      "邮箱: \(.email)",
      "国家: \(.country)",
      "设备ID: \(.device_identifier)"
    '
  else
    echo -e "${RED}❌ 添加失败${NC}"
    echo "$result" | jq -r '.error // .message // .'
  fi
}

# 删除账号
cmd_pool_delete() {
  local id=$1
  
  if [ -z "$id" ]; then
    echo -e "${RED}错误: 请指定账号ID${NC}"
    echo "用法: $0 pool:delete <id>"
    exit 1
  fi
  
  echo -e "${BLUE}🗑️  删除账号 #$id${NC}"
  echo ""
  
  read -p "确定要删除此账号吗？(y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "已取消"
    exit 0
  fi
  
  result=$(api_request DELETE "/api/admin/pool/accounts/$id")
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 账号已删除${NC}"
  else
    echo -e "${RED}❌ 删除失败${NC}"
    echo "$result"
  fi
}

# 列出白名单
cmd_whitelist_list() {
  echo -e "${BLUE}📋 白名单应用列表${NC}"
  echo ""
  
  result=$(api_request GET "/api/admin/whitelist")
  
  if [ $? -ne 0 ]; then
    echo -e "${RED}请求失败${NC}"
    exit 1
  fi
  
  # 使用简单的格式化输出（兼容 macOS）
  echo "$result" | jq -r '
    ["ID", "Bundle ID", "名称", "版本"],
    ["--", "---------", "----", "----"],
    (.[] | [.id, .bundle_id, .name, .version]) | @tsv
  ' | column -t -s $'\t'
}

# 添加白名单应用
cmd_whitelist_add() {
  echo -e "${BLUE}➕ 添加应用到白名单${NC}"
  echo ""
  
  read -p "Bundle ID (例如: com.tencent.xin): " bundle_id
  read -p "应用名称: " name
  read -p "版本 (可选): " version
  read -p "国家/地区 (US): " country
  country=${country:-US}
  
  echo ""
  echo "正在添加应用..."
  
  data=$(jq -n \
    --arg bundle_id "$bundle_id" \
    --arg name "$name" \
    --arg version "$version" \
    --arg country "$country" \
    '{bundleID: $bundle_id, name: $name, version: $version, country: $country}')
  
  result=$(api_request POST "/api/admin/whitelist" "$data")
  
  if echo "$result" | jq -e '.id' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 应用添加成功${NC}"
    echo "$result" | jq -r '
      "ID: \(.id)",
      "Bundle ID: \(.bundle_id)",
      "名称: \(.name)"
    '
  else
    echo -e "${RED}❌ 添加失败${NC}"
    echo "$result" | jq -r '.error // .message // .'
  fi
}

# 健康检查
cmd_health_check() {
  echo -e "${BLUE}🏥 检查所有账号健康状态${NC}"
  echo ""
  
  result=$(api_request POST "/api/admin/pool/health/check-all")
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 健康检查已触发${NC}"
    echo "请稍后查看结果"
  else
    echo -e "${RED}❌ 检查失败${NC}"
    echo "$result"
  fi
}

# 主函数
main() {
  load_config
  
  if [ $# -eq 0 ]; then
    show_help
    exit 0
  fi
  
  case "$1" in
    setup)
      cmd_setup
      ;;
    pool:stats)
      cmd_pool_stats
      ;;
    pool:list)
      cmd_pool_list
      ;;
    pool:add)
      cmd_pool_add
      ;;
    pool:delete)
      cmd_pool_delete "$2"
      ;;
    whitelist:list)
      cmd_whitelist_list
      ;;
    whitelist:add)
      cmd_whitelist_add
      ;;
    health:check)
      cmd_health_check
      ;;
    help|--help|-h)
      show_help
      ;;
    *)
      echo -e "${RED}未知命令: $1${NC}"
      show_help
      exit 1
      ;;
  esac
}

main "$@"
