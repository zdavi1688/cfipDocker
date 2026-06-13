#!/bin/bash

# ==============================================================================
# Cloudflare SOCKS5 多 IP 代理一键部署后台管理守护套件
# 支持 VPS 真机运行/全网自适应干净度净化过滤
# ==============================================================================

# 1. 字体颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========== 开始执行 Cloudflare 多 IP 代理以及前端管理面板一键部署 ==========${NC}"

# -- 2. 自动安装 Docker 和 Docker Compose (原核心逻辑) --
if ! command -v docker &> /dev/null; then
    echo -e "${GREEN}[1/6] 未检测到 Docker，正在为您安装...${NC}"
    curl -fsSL https://get.docker.com | bash
    systemctl enable --now docker
else
    echo -e "${GREEN}[1/6] 检测到 Docker 已安装，跳过。${NC}"
fi

if ! docker compose version &> /dev/null; then
    echo -e "${GREEN}[1/6] 未检测到 Docker Compose，正在配置基础组件...${NC}"
    ln -s /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose 2>/dev/null
fi

# -- 3. 检测并配置 Node.js 运行环境供前端管理系统使用 --
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}[2/6] 检测到未安装 Node.js，正在为您自动部署极速 Node.js Lts 容器环境...${NC}"
    # Standard installation for Ubuntu / Debian systems of Node.js 20 Lts
    if command -v apt-get &> /dev/null; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    elif command -v yum &> /dev/null; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
        yum install -y nodejs
    else
        echo -e "${RED}无法自动适配您的 Linux 模块版本。请先手动部署 Node.js 以便极速跑起管理面板！${NC}"
    fi
else
    echo -e "${GREEN}[2/6] 检测到 Node.js 已就绪，版本为: $(node -v)${NC}"
fi

# -- 4. 构建并启动管理面板守护进程端口 :59418 --
# 自动检测当前脚本所在的绝对目录，保障在不同 VPS 文件夹（如 /root/cf）部署时皆能完美运行
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
if [ -z "$PROJECT_DIR" ]; then
    PROJECT_DIR=$(pwd)
fi

echo -e "${GREEN}[3/6] 正在初始化 ${PROJECT_DIR} 项目依赖以及编译打包管理面板...${NC}"
cd "$PROJECT_DIR"

# Clean up any potential lock files
rm -rf node_modules/.vite
npm install
NODE_ENV=production npm run build

# Securely kill existing background process running on port 59419
echo -e "${GREEN}[4/6] 正在保障 59419 端口通畅，重加载后台管理器...${NC}"
if command -v fuser &> /dev/null; then
    fuser -k 59419/tcp >/dev/null 2>&1 || true
else
    # Fallback to kill by node processes if fuser not ready
    PID=$(lsof -t -i:59419 2>/dev/null || ps aux | grep 'dist/server.cjs' | grep -v grep | awk '{print $2}')
    if [ ! -z "$PID" ]; then
        kill -9 $PID >/dev/null 2>&1 || true
    fi
fi

# Write defaults JSON configuration so server and client match starting parameter
mkdir -p /root/cf-proxies
IP_COUNT=$1
if [ -z "$IP_COUNT" ]; then
    echo -e "${GREEN}请输入您需要配置的 IP 数量 (例如: 5, 10, 20):${NC}"
    read -p "数量 N = " IP_COUNT
fi

# Verify integer counts
if ! [[ "$IP_COUNT" =~ ^[0-9]+$ ]] || [ "$IP_COUNT" -le 0 ]; then
    echo -e "${RED}错误: 请输入有效的正整数！${NC}"
    exit 1
fi

PROXY_USER="cfuser"
PROXY_PASSWORD=$(tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c 12)
VPS_IP=$(curl -s https://ifconfig.me || curl -s https://api.ipify.org || echo "YOUR_VPS_IP")

cat <<EOF > /root/cf-proxies/panel-config.json
{
  "ipCount": $IP_COUNT,
  "ipVersion": "v4",
  "maxFraudScore": 3,
  "startPort": 20001,
  "proxyUser": "$PROXY_USER",
  "proxyPass": "$PROXY_PASSWORD",
  "autoRebuildThreshold": true
}
EOF

# Start Web server daemon
export NODE_ENV=production
export PORT=59419
nohup node dist/server.cjs > "$PROJECT_DIR/panel.log" 2>&1 &
sleep 2

# -- 5. 自动化构建与启动 Docker 容器群组 (原核心逻辑) --
echo -e "${GREEN}[5/6] 正在初始化多 IP 代理容器组并放行防火墙端口...${NC}"
START_PORT=20001

cat <<EOF > /root/cf-proxies/docker-compose.yml
version: '3.8'
services:
EOF

for ((i=1; i<=IP_COUNT; i++)); do
    CURRENT_PORT=$((START_PORT + i - 1))
    cat <<EOF >> /root/cf-proxies/docker-compose.yml
  warp-$i:
    image: caomingjun/warp
    container_name: warp-$i
    restart: always
    cap_add:
      - NET_ADMIN
    sysctls:
      - net.ipv6.conf.all.disable_ipv6=0
      - net.ipv4.conf.all.src_valid_mark=1

  gost-$i:
    image: ginuerzh/gost
    container_name: gost-$i
    restart: always
    ports:
      - "$CURRENT_PORT:1080"
    command: -L socks5://$PROXY_USER:$PROXY_PASSWORD@:1080 -F socks5://warp-$i:1080
    depends_on:
      - warp-$i
EOF
done

# Clear system firewall rules
END_PORT=$((START_PORT + IP_COUNT - 1))
if command -v ufw &> /dev/null && ufw status | grep -q "active"; then
    ufw allow $START_PORT:$END_PORT/tcp > /dev/null
    ufw allow 59419/tcp > /dev/null
elif command -v firewall-cmd &> /dev/null && systemctl is-active --quiet firewalld; then
    firewall-cmd --zone=public --add-port=$START_PORT-$END_PORT/tcp --permanent > /dev/null
    firewall-cmd --zone=public --add-port=59419/tcp --permanent > /dev/null
    firewall-cmd --reload > /dev/null
fi

# Run docker instances
cd /root/cf-proxies
docker compose down &>/dev/null || true
docker compose up -d

# -- 6. 成功返回汇总 --
echo -e "\n${GREEN}==================== 部署成功！====================${NC}"
echo -e "网页后台控制页面已成功部署！"
echo -e "访问地址: ${GREEN}http://${VPS_IP}:59419${NC}"
echo -e "您可以在该面板中实时修改出口节点数量、IP类型、过滤不干净的污染 IP，并能够一键复制。"
echo -e "------------------------------------------------------"
echo -e "当前 ${IP_COUNT} 个独立代理端口信息:"
echo -e "代理统一验证账号: ${GREEN}${PROXY_USER}${NC}"
echo -e "代理统一验证密码为: ${GREEN}${PROXY_PASSWORD}${NC}"
echo -e "\n复制下方代理列表快速填入指纹浏览器："
echo -e "------------------------------------------------------"
for ((i=1; i<=IP_COUNT; i++)); do
    CURRENT_PORT=$((START_PORT + i - 1))
    echo -e "${VPS_IP}:${CURRENT_PORT}:${PROXY_USER}:${PROXY_PASSWORD}"
done
echo -e "------------------------------------------------------"
echo -e "祝您使用愉快！"
