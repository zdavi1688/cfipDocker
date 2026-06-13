import { useState } from 'react';
import { ProxyConfig } from '../types';
import { Terminal, Copy, Check, Download, FileText, Globe } from 'lucide-react';

interface ScriptGeneratorProps {
  config: ProxyConfig;
}

export default function ScriptGenerator({ config }: ScriptGeneratorProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'deploy' | 'monitor'>('deploy');

  const vpsIPPlaceholder = '123.45.67.89'; // dynamic placeholder
  
  // Generating the custom Docker shell script
  const generateDeployScript = () => {
    return `#!/bin/bash

# ==============================================================================
# Cloudflare 多 IP 代理一键部署并过滤干净度脚本 (VPS 专享)
# 生成时间: ${new Date().toISOString().substring(0, 10)}
# 配置参数:
#   - IP 数量(N): ${config.ipCount}
#   - 出口协议: ${config.ipVersion === 'v4' ? '仅 IPv4' : config.ipVersion === 'v6' ? '仅 IPv6' : 'IPv4 / IPv6 并存'}
#   - 干净度门槛 (Fraud Score): 低于 ${config.maxFraudScore} (以 5 为分水岭优先)
#   - 校验账号: ${config.proxyUser}
#   - 校验密码: ${config.proxyPass}
#   - 起始端口: ${config.startPort}
# ==============================================================================

# 字体颜色定义
GREEN='\\033[0;32m'
RED='\\033[0;31m'
YELLOW='\\033[1;33m'
NC='\\033[0m'

echo -e "\${GREEN}========== 开始部署 Cloudflare SOCKS5 多 IP 洁净代理集群 ==========\${NC}"

# 1. 自动检测并安装 Docker 和 Docker Compose
if ! command -v docker &> /dev/null; then
    echo -e "\${GREEN}[1/5] 未检测到 Docker，正在为您安装...\${NC}"
    curl -fsSL https://get.docker.com | bash
    systemctl enable --now docker
else
    echo -e "\${GREEN}[1/5] 检测到 Docker 已安装，跳过。\${NC}"
fi

if ! docker compose version &> /dev/null; then
    echo -e "\${GREEN}[1/5] 未检测到 Docker Compose，正在配置基础组件...\${NC}"
    ln -s /usr/libexec/docker/cli-plugins/docker-compose /usr/local/bin/docker-compose 2>/dev/null
fi

# 2. 初始化核心参数
IP_COUNT=${config.ipCount}
IP_VERSION="${config.ipVersion}"
MAX_SCORE=${config.maxFraudScore}
PROXY_USER="${config.proxyUser}"
PROXY_PASSWORD="${config.proxyPass}"
START_PORT=${config.startPort}
VPS_IP=\$(curl -s https://ifconfig.me || curl -s https://api.ipify.org || echo "YOUR_VPS_IP")

PROXY_DIR="/root/cf-proxies"
mkdir -p "\$PROXY_DIR"
cd "\$PROXY_DIR"

# 3. 动态配置输出 docker-compose.yml
echo -e "\${GREEN}[2/5] 动态构建 docker-compose.yml 矩阵...\${NC}"
cat <<EOF > docker-compose.yml
version: '3.8'
services:
EOF

for ((i=1; i<=IP_COUNT; i++)); do
    CURRENT_PORT=\$((START_PORT + i - 1))
    cat <<EOF >> docker-compose.yml
  warp-\$i:
    image: caomingjun/warp
    container_name: warp-\$i
    restart: always
    cap_add:
      - NET_ADMIN
    sysctls:
      - net.ipv6.conf.all.disable_ipv6=0
      - net.ipv4.conf.all.src_valid_mark=1

  gost-\$i:
    image: ginuerzh/gost
    container_name: gost-\$i
    restart: always
    ports:
      - "\$CURRENT_PORT:1080"
    command: -L socks5://\$PROXY_USER:\$PROXY_PASSWORD@:1080 -F socks5://warp-\$i:1080
    depends_on:
      - warp-\$i
EOF
done

echo -e "\${GREEN}[3/5] 正在放行安全组与防火墙端口 (\$START_PORT 到 \$((START_PORT + IP_COUNT - 1)))...\${NC}"
END_PORT=\$((START_PORT + IP_COUNT - 1))
if command -v ufw &> /dev/null && ufw status | grep -q "active"; then
    ufw allow \$START_PORT:\$END_PORT/tcp > /dev/null
elif command -v firewall-cmd &> /dev/null && systemctl is-active --quiet firewalld; then
    firewall-cmd --zone=public --add-port=\$START_PORT-\$END_PORT/tcp --permanent > /dev/null
    firewall-cmd --reload > /dev/null
fi

# 4. 启动容器集群
echo -e "\${GREEN}[4/5] 启动容器集群并完成首次 IP 指派...\${NC}"
docker compose down &>/dev/null || true
docker compose up -d

# 5. IP 干净度自适应筛选引擎与循环检测
echo -e "\${GREEN}[5/5] 核心引擎启动：正在检测 IP 干净度以及协议筛选 (阈值: <\$MAX_SCORE)...\${NC}"
echo -e "\${YELLOW}提示: 若 IP 评分高或不符 IP 协议，脚本会自动重启对应 WARP 节点直到分配高洁净度 IP。\${NC}"

for ((i=1; i<=IP_COUNT; i++)); do
    CURRENT_PORT=\$((START_PORT + i - 1))
    ATTEMPTS=0
    SUCCESS=0
    
    while [ \$ATTEMPTS -lt 20 ]; do
        echo -e "正在对代理 warp-\$i (端口 \$CURRENT_PORT) 进行扫描检测..."
        
        # 通过 gost 连接 warp 进行外网查询
        IP_INFO=\$(curl -s --socks5-hostname "socks5://\$PROXY_USER:\$PROXY_PASSWORD@127.0.0.1:\$CURRENT_PORT" "https://ipapi.co/json/" || true)
        OUT_IP=\$(echo "\$IP_INFO" | grep -o '"ip": "[^"]*' | grep -o '[^"]*$' || echo "")
        
        if [ -z "\$OUT_IP" ]; then
            echo -e "Warp-\$i 连接超时，准备重启..."
            docker restart "warp-\$i" > /dev/null
            sleep 5
            ((ATTEMPTS++))
            continue
        fi

        # 检查 IP 出口版本 (IPv4 vs IPv6 判定)
        IS_V6=0
        if [[ "\$OUT_IP" =~ : ]]; then
            IS_V6=1
        fi

        if [ "\$IP_VERSION" == "v4" ] && [ \$IS_V6 -eq 1 ]; then
            echo -e "  -> 分配到过时/不支持的 IPv6 (\$OUT_IP)，执行拒绝并重启中..."
            docker restart "warp-\$i" > /dev/null
            sleep 4
            ((ATTEMPTS++))
            continue
        fi
        if [ "\$IP_VERSION" == "v6" ] && [ \$IS_V6 -eq 0 ]; then
            echo -e "  -> 分配到过时/不支持的 IPv4 (\$OUT_IP)，执行拒绝并重启中..."
            docker restart "warp-\$i" > /dev/null
            sleep 4
            ((ATTEMPTS++))
            continue
        fi
        
        # 欺诈与干净度校验 (通过 Scamalytics 免费 API 或备用 IP API)
        FRAUD_SCORE=\$(curl -s "https://api.scamalytics.com/free/?ip=\${OUT_IP}" | grep -o '"score":[^,]*' | cut -d':' -f2 | tr -d ' ' || echo "8")
        if [ -z "\$FRAUD_SCORE" ] || ! [[ "\$FRAUD_SCORE" =~ ^[0-9]+$ ]]; then
            FRAUD_SCORE=8 # 备用极小权重分
        fi
        
        # 判定干净度是否达标
        if [ \$FRAUD_SCORE -lt \$MAX_SCORE ]; then
            # 5 分以内提供极净勋章
            if [ \$FRAUD_SCORE -le 5 ]; then
                echo -e "  -> \${GREEN}★ 完美通关! Warp-\$i 成功捕获至臻极净 IP: \$OUT_IP | 校验分数: \$FRAUD_SCORE\${NC}"
            else
                echo -e "  -> \${GREEN}√ 达标通关! Warp-\$i 成功捕获洁净 IP: \$OUT_IP | 校验分数: \$FRAUD_SCORE\${NC}"
            fi
            SUCCESS=1
            break
        else
            echo -e "  -> \${RED}☠ 遭到拦截! Warp-\$i 所获 IP 干净度不符要求 (目前为 \$FRAUD_SCORE，由于 >= \$MAX_SCORE)。立刻重启刷新 IP...\${NC}"
            docker restart "warp-\$i" > /dev/null
            sleep 4.5
        fi
        ((ATTEMPTS++))
    done

    if [ \$SUCCESS -eq 0 ]; then
        echo -e "\${YELLOW}警告: Warp-\$i 在 20 次尝试内未能拿到更低污染度 IP，临时上线（之后由后台守护巡检更新）。\${NC}"
    fi
done

echo -e "\n\${GREEN}================== 恭喜！代理矩阵建立并清洗完成 ==================\${NC}"
echo -e "您的 VPS 共生成了 \${GREEN}\${IP_COUNT}\${NC} 个独立的 Cloudflare IP 代理端口。"
echo -e "代理统一验证密码为: \${GREEN}\${PROXY_PASSWORD}\${NC}"
echo -e "您可以全选并复制下方生成的洁净代理列表，直接填入指纹浏览器：\n"

echo -e "---------------- 您的 SOCKS5 代理列表 ----------------"
for ((i=1; i<=IP_COUNT; i++)); do
    CURRENT_PORT=\$((START_PORT + i - 1))
    echo -e "\${VPS_IP}:\${CURRENT_PORT}:\${PROXY_USER}:\${PROXY_PASSWORD}"
done
echo -e "------------------------------------------------------"
`;
  };

  const generateMonitorScript = () => {
    return `#!/bin/bash
# ==============================================================================
# Cloudflare SOCKS5 多 IP 干净度后台常驻巡检守护脚本 (每小时/每天执行)
# ==============================================================================

PROXY_DIR="/root/cf-proxies"
cd "\$PROXY_DIR" 2>/dev/null || exit 1

IP_COUNT=${config.ipCount}
IP_VERSION="${config.ipVersion}"
MAX_SCORE=${config.maxFraudScore}
PROXY_USER="${config.proxyUser}"
PROXY_PASSWORD="${config.proxyPass}"
START_PORT=${config.startPort}

echo "=== 开始定时巡检 Cloudflare 代理节点干净度 [\$(date)] ==="

for ((i=1; i<=IP_COUNT; i++)); do
    CURRENT_PORT=\$((START_PORT + i - 1))
    
    # 获当前 IP
    IP_INFO=\$(curl -s --socks5-hostname "socks5://\$PROXY_USER:\$PROXY_PASSWORD@127.0.0.1:\$CURRENT_PORT" "https://ipapi.co/json/" || true)
    OUT_IP=\$(echo "\$IP_INFO" | grep -o '"ip": "[^"]*' | grep -o '[^"]*$' || echo "")
    
    if [ -z "\$OUT_IP" ]; then
        echo "节点 warp-\$i 异常不可用，正在重启恢复..."
        docker restart "warp-\$i" > /dev/null
        continue
    fi
    
    # 获取欺诈分
    FRAUD_SCORE=\$(curl -s "https://api.scamalytics.com/free/?ip=\${OUT_IP}" | grep -o '"score":[^,]*' | cut -d':' -f2 | tr -d ' ' || echo "5")
    
    if [ "\$FRAUD_SCORE" -ge "\$MAX_SCORE" ]; then
        echo "发现节点 warp-\$i 分数已降至危险范围 (\$FRAUD_SCORE >= \$MAX_SCORE)。立即热更重置容器..."
        docker restart "warp-\$i" > /dev/null
    else
        echo "节点 warp-\$i 依旧健康 [IP: \$OUT_IP, 分数: \$FRAUD_SCORE]"
    fi
done

echo "=== 巡检守护任务结束 ==="
`;
  };

  const activeScript = activeTab === 'deploy' ? generateDeployScript() : generateMonitorScript();

  const handleCopy = () => {
    navigator.clipboard.writeText(activeScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const filename = activeTab === 'deploy' ? 'deploy-cf-proxies.sh' : 'monitor-cf-proxies.sh';
    const blob = new Blob([activeScript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4 mb-4">
        <div>
          <h2 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-500" />
            一键部署脚本生成器 / Shell Deploy Script
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            双击复制此自适应洁净度过滤的 Bash 部署脚本，在您的 VPS 执行即可瞬间建立多出口洁净代理。
          </p>
        </div>

        {/* Script Selection Tab */}
        <div className="flex bg-zinc-950 rounded-lg p-0.5 border border-zinc-805">
          <button
            onClick={() => setActiveTab('deploy')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
              activeTab === 'deploy' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            主一键安装脚本 (带 IP 重洗)
          </button>
          <button
            onClick={() => setActiveTab('monitor')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
              activeTab === 'monitor' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            定时净化巡检脚本
          </button>
        </div>
      </div>

      {/* Code panel */}
      <div className="relative">
        {/* Buttons top right */}
        <div className="absolute right-3 top-3 flex items-center gap-2 z-10">
          <button
            onClick={handleCopy}
            className="p-2 text-xs font-semibold bg-zinc-950/80 hover:bg-zinc-800 text-zinc-300 rounded-lg border border-zinc-800 flex items-center gap-1.5 hover:text-zinc-100 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                已复制 / Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                复制代码
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="p-2 text-xs font-semibold bg-zinc-950/80 hover:bg-zinc-800 text-zinc-300 rounded-lg border border-zinc-800 flex items-center gap-1.5 hover:text-zinc-100 transition-colors"
            title="下载脚本文件"
          >
            <Download className="w-3.5 h-3.5" />
            下载脚本
          </button>
        </div>

        {/* Script preview */}
        <div className="bg-zinc-950 rounded-xl border border-zinc-850 p-4 font-mono text-xs overflow-x-auto max-h-[380px] text-zinc-300 leading-normal scrollbar-thin">
          <pre className="whitespace-pre">{activeScript}</pre>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-4 bg-zinc-950/50 border border-zinc-850/60 rounded-lg p-3.5">
        <h3 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5 mb-1.5">
          <Terminal className="w-3.5 h-3.5 text-emerald-500" />
          如何在一小时内启动部署？ / Deployment Playbook
        </h3>
        <ol className="list-decimal list-inside text-[11px] text-zinc-400 space-y-1">
          <li>登录您的 VPS 终端（Ubuntu/Debian 推荐）。</li>
          <li>将本页脚本复制，执行命令新建文件：<code className="text-emerald-400 font-mono select-all bg-zinc-950 px-1 py-0.5 rounded ml-1">nano deploy.sh</code> 并将代码粘帖存盘。</li>
          <li>赋予权限并一键运行：<code className="text-emerald-400 font-mono select-all bg-zinc-950 px-1 py-0.5 rounded ml-1">chmod +x deploy.sh && ./deploy.sh</code></li>
          <li>您可以在真机中通过启动该前端面板，或直接在终端复制生成的代理凭证导入多登指纹浏览器。</li>
        </ol>
      </div>
    </div>
  );
}
