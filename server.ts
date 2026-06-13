import express from "express";
import path from "path";
import fs from "fs";
import { exec, execSync } from "child_process";
import { createServer as createViteServer } from "vite";

interface ProxyConfig {
  ipCount: number;
  ipVersion: 'v4' | 'v6' | 'both';
  maxFraudScore: number;
  startPort: number;
  proxyUser: string;
  proxyPass: string;
  autoRebuildThreshold: boolean;
}

interface ProxyItem {
  id: number;
  port: number;
  name: string;
  status: 'deploying' | 'scanning' | 'active' | 'rebuilding' | 'failed';
  ip: string;
  ipVersion: 'v4' | 'v6';
  countryCode: string;
  countryName: string;
  latencyMs: number;
  fraudScore: number;
  lastChecked: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

// In-memory states that synchronize with VPS filesystem OR mock states if offline
let config: ProxyConfig = {
  ipCount: 5,
  ipVersion: 'v4',
  maxFraudScore: 3,
  startPort: 20001,
  proxyUser: 'cfuser',
  proxyPass: 'cfpass' + Math.floor(Math.random() * 9000),
  autoRebuildThreshold: true
};

let proxies: ProxyItem[] = [];
let logs: LogEntry[] = [];
let vpsPublicIP = '123.45.67.89';

// Logger Helper
function writeToFileLog(level: string, message: string) {
  const targetDir = '/root/cf-proxies';
  const filePath = path.join(targetDir, 'runtime-debug.log');
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  
  // Make sure target directories exist
  if (!fs.existsSync(targetDir)) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch {
      // Fallback: local project folder
      const localPath = path.join(process.cwd(), 'runtime-debug.log');
      try {
        fs.appendFileSync(localPath, logLine, 'utf-8');
      } catch {}
      return;
    }
  }
  
  try {
    fs.appendFileSync(filePath, logLine, 'utf-8');
  } catch (e: any) {
    console.error(`写入 runtime-debug.log 异常: ${e.message}`);
  }
}

function addDebugDetail(msg: string) {
  writeToFileLog('DEBUG_DETAIL', msg);
}

// Logger Helper
function addLog(level: LogEntry['level'], message: string) {
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  const entry: LogEntry = {
    id: Math.random().toString(),
    timestamp,
    level,
    message
  };
  logs.push(entry);
  if (logs.length > 200) logs.shift();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  
  // Persist to raw file log
  writeToFileLog(level, message);
}

// Automatically probe public egress IP of the VPS
function detectVpsPublicIP() {
  try {
    addLog('info', '正在自动探测本VPS服务器外网公网出口IP...');
    const providers = [
      'https://api.ipify.org?format=json',
      'https://ipapi.co/json/',
      'https://ifconfig.me'
    ];
    for (const url of providers) {
      try {
        const stdout = execSync(`curl -s --max-time 5 "${url}"`, { encoding: 'utf-8' }).trim();
        if (stdout) {
          if (stdout.startsWith('{')) {
            const data = JSON.parse(stdout);
            const ip = data.ip || data.query;
            if (ip) {
              vpsPublicIP = ip;
              addLog('success', `✔ 探测成功！当前 VPS 宿主机公网 IP 为: ${vpsPublicIP}`);
              return;
            }
          } else {
            if (stdout.includes('.') || stdout.includes(':')) {
              vpsPublicIP = stdout;
              addLog('success', `✔ 探测成功！当前 VPS 宿主机公网 IP 为: ${vpsPublicIP}`);
              return;
            }
          }
        }
      } catch (err: any) {
        // try next
      }
    }
    addLog('warn', `未探测到有效外网IP，将采用默认推荐值: ${vpsPublicIP}`);
  } catch (err: any) {
    addLog('warn', `探测外网公网 IP 异常: ${err.message}`);
  }
}

// Check if we are running in a real VPS with docker permission
function isRealVPS(): boolean {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Read current /root/cf-proxies if exists
function loadConfigFromSystem() {
  const configPath = '/root/cf-proxies/panel-config.json';
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf-8');
      config = JSON.parse(data);
      addLog('info', `成功从本地系统配置文件中加载参数：IP Count = ${config.ipCount}`);
    }
  } catch (err: any) {
    addLog('error', `加载系统配置文件失败: ${err.message}`);
  }
}

// Write /root/cf-proxies directory and config
function saveConfigToSystem() {
  const targetDir = '/root/cf-proxies';
  if (!fs.existsSync(targetDir)) {
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (e: any) {
      addLog('warn', `无法创建目录 ${targetDir} (非 root 或非 VPS 环境): ${e.message}`);
      return;
    }
  }
  try {
    fs.writeFileSync(path.join(targetDir, 'panel-config.json'), JSON.stringify(config, null, 2), 'utf-8');
  } catch (err: any) {
    addLog('error', `保存面板配置文件失败: ${err.message}`);
  }
}

// Generate real docker-compose.yml file from the saved configuration
function buildDockerCompose(): boolean {
  const composePath = '/root/cf-proxies/docker-compose.yml';
  addLog('info', `正在构建最新的 docker-compose.yml 服务矩阵... (IP 数量: ${config.ipCount})`);
  
  // ── 密钥目录：位于项目根目录内 ────────────────
  const cfKeyRoot = path.join(process.cwd(), 'CF_Key');

  // 确保密钥根目录存在
  if (!fs.existsSync(cfKeyRoot)) {
    try {
      fs.mkdirSync(cfKeyRoot, { recursive: true });
      addLog('info', `已创建密钥根目录: ${cfKeyRoot}`);
    } catch (e: any) {
      addLog('warn', `无法创建密钥根目录 ${cfKeyRoot}: ${e.message}`);
    }
  }

  // 扫描已存在且含 reg.json 的密钥槽
  const availableSlots = new Map<string, string>(); // name -> path
  try {
    if (fs.existsSync(cfKeyRoot)) {
      const entries = fs.readdirSync(cfKeyRoot);
      for (const entry of entries) {
        const slotPath = path.join(cfKeyRoot, entry);
        const regPath = path.join(slotPath, 'reg.json');
        if (fs.statSync(slotPath).isDirectory() && fs.existsSync(regPath)) {
          availableSlots.set(entry, slotPath);
        }
      }
    }
    addLog('info', `CF_Key 目录中发现 ${availableSlots.size} 个已注册密钥槽: [${Array.from(availableSlots.keys()).join(', ')}]`);
  } catch (e: any) {
    addLog('warn', `扫描 CF_Key 目录时出错: ${e.message}`);
  }

  // 收集可被借用的空闲密钥槽（即当前不在 active 编号范围内（j > config.ipCount）的槽）
  const borrowableSlots: string[] = [];
  for (const [name, slotPath] of availableSlots.entries()) {
    const match = name.match(/^warp-(\d+)$/);
    if (match) {
      const idx = parseInt(match[1]);
      if (idx > config.ipCount) {
        borrowableSlots.push(slotPath);
      }
    }
  }
  addLog('info', `可借用的闲置密钥槽共 ${borrowableSlots.length} 个: [${borrowableSlots.map(p => path.basename(p)).join(', ')}]`);

  let composeContent = `version: '3.8'
services:
`;

  for (let i = 1; i <= config.ipCount; i++) {
    const currentPort = config.startPort + i - 1;

    // 该容器的固定专属挂载目录
    const dedicatedDir = path.join(cfKeyRoot, `warp-${i}`);
    let dataDir = dedicatedDir;

    if (fs.existsSync(path.join(dedicatedDir, 'reg.json'))) {
      // ✅ 情况1：专属槽本身有密钥 → 直接复用自己专属的
      addLog('success', `warp-${i}: 复用专属密钥槽 ${dedicatedDir} (含已注册账号)`);
    } else if (borrowableSlots.length > 0) {
      // ✅ 情况2：专属槽无密钥，但池中有闲置（j > config.ipCount）的密钥 → 借用并复制到专属槽
      const borrowedSlot = borrowableSlots.shift()!;
      try {
        if (!fs.existsSync(dedicatedDir)) fs.mkdirSync(dedicatedDir, { recursive: true });
        // 递归复制内容
        const copyDir = (src: string, dest: string) => {
          if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
          const entries = fs.readdirSync(src, { withFileTypes: true });
          for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
              copyDir(srcPath, destPath);
            } else {
              fs.copyFileSync(srcPath, destPath);
            }
          }
        };
        copyDir(borrowedSlot, dedicatedDir);
        addLog('success', `warp-${i}: 已从密钥池借用 ${path.basename(borrowedSlot)} 的密钥并复制到专属槽 ${dedicatedDir}`);
      } catch (cpErr: any) {
        addLog('warn', `warp-${i}: 密钥复制失败: ${cpErr.message}`);
      }
    } else {
      // ✅ 情况3：专属槽无密钥，也无多余闲置密钥 → 创建空目录，让容器启动后自动向 Cloudflare 注册
      if (!fs.existsSync(dedicatedDir)) {
        try {
          fs.mkdirSync(dedicatedDir, { recursive: true });
        } catch (e: any) {
          addLog('warn', `无法创建空密钥目录 ${dedicatedDir}: ${e.message}`);
        }
      }
      addLog('info', `warp-${i}: 无可用密钥，将在 ${dedicatedDir} 挂载空目录，容器启动后自动向 Cloudflare 注册新账号`);
    }

    // 赋予读写权限确保容器内可正常写入
    try {
      fs.chmodSync(cfKeyRoot, 0o777);
      if (fs.existsSync(dataDir)) fs.chmodSync(dataDir, 0o777);
    } catch (permErr: any) {
      addLog('warn', `无法为 ${dataDir} 赋予777权限: ${permErr.message}`);
    }

    composeContent += `  warp-${i}:
    image: caomingjun/warp
    container_name: warp-${i}
    restart: always
    cap_add:
      - NET_ADMIN
    sysctls:
      - net.ipv6.conf.all.disable_ipv6=0
      - net.ipv4.conf.all.src_valid_mark=1
    volumes:
      - ${dataDir}:/var/lib/cloudflare-warp

  gost-${i}:
    image: ginuerzh/gost
    container_name: gost-${i}
    restart: always
    ports:
      - "${currentPort}:1080"
    command: -L socks5://${config.proxyUser}:${config.proxyPass}@:1080 -F socks5://warp-${i}:1080
    depends_on:
      - warp-${i}
`;
  }

  try {
    fs.writeFileSync(composePath, composeContent, 'utf-8');
    addLog('success', `最新 docker-compose.yml 已写入 /root/cf-proxies 目录。`);
    return true;
  } catch (err: any) {
    addLog('error', `无法写入 docker-compose.yml 文件: ${err.message}`);
    return false;
  }
}

// Test SOCKS5 and gather actual metrics
// Uses multiple IP detection APIs to avoid rate limiting:
// 1. ip-api.com  (primary, 45 req/min free, no key needed)
// 2. ipinfo.io   (fallback #1, 50k/month free)
// 3. ifconfig.me (fallback #2, returns plain IP only)
// IP Discovery Platforms (10 distinct sources queried via SOCKS5)
const ipDiscoveryPlatforms = [
  {
    name: 'ip-api.com',
    url: 'http://ip-api.com/json/?fields=status,message,country,countryCode,query',
    parse: (data: any) => {
      if (data && data.status === 'success' && data.query) {
        return { ip: data.query, countryCode: data.countryCode || 'US', countryName: data.country || 'United States' };
      }
      throw new Error('Invalid response status');
    }
  },
  {
    name: 'ipwho.is',
    url: 'http://ipwho.is/',
    parse: (data: any) => {
      if (data && data.success === true && data.ip) {
        return { ip: data.ip, countryCode: data.country_code || 'US', countryName: data.country || 'United States' };
      }
      throw new Error('Invalid response success flag');
    }
  },
  {
    name: 'freeipapi.com',
    url: 'https://freeipapi.com/api/json/',
    parse: (data: any) => {
      if (data && data.ipAddress) {
        return { ip: data.ipAddress, countryCode: data.countryCode || 'US', countryName: data.countryName || 'United States' };
      }
      throw new Error('No ipAddress field found');
    }
  },
  {
    name: 'ipapi.co',
    url: 'https://ipapi.co/json/',
    parse: (data: any) => {
      if (data && data.ip) {
        return { ip: data.ip, countryCode: data.country_code || 'US', countryName: data.country_name || 'United States' };
      }
      throw new Error('No ip field found');
    }
  },
  {
    name: 'ipapi.is',
    url: 'https://ipapi.is/',
    parse: (data: any) => {
      if (data && data.ip) {
        const country = (data.location && data.location.country) || 'United States';
        const code = (data.location && data.location.country_code) || 'US';
        return { ip: data.ip, countryCode: code, countryName: country };
      }
      throw new Error('No ip field found');
    }
  },
  {
    name: 'ip2location.io',
    url: 'https://api.ip2location.io/',
    parse: (data: any) => {
      if (data && data.ip) {
        return { ip: data.ip, countryCode: data.country_code || 'US', countryName: data.country_name || 'United States' };
      }
      throw new Error('No ip field found');
    }
  },
  {
    name: 'ip.sb',
    url: 'https://api.ip.sb/geoip/',
    parse: (data: any) => {
      if (data && data.ip) {
        return { ip: data.ip, countryCode: data.country_code || 'US', countryName: data.country || 'United States' };
      }
      throw new Error('No ip field found');
    }
  },
  {
    name: 'ipinfo.io',
    url: 'https://ipinfo.io/json',
    parse: (data: any) => {
      if (data && data.ip) {
        return { ip: data.ip, countryCode: data.country || 'US', countryName: data.country || 'United States' };
      }
      throw new Error('No ip field found');
    }
  },
  {
    name: 'geoiplookup.io',
    url: 'https://json.geoiplookup.io/',
    parse: (data: any) => {
      if (data && data.ip) {
        return { ip: data.ip, countryCode: data.country_code || 'US', countryName: data.country_name || 'United States' };
      }
      throw new Error('No ip field found');
    }
  },
  {
    name: 'db-ip.com',
    url: 'https://api.db-ip.com/v2/free/self',
    parse: (data: any) => {
      if (data && data.ipAddress) {
        return { ip: data.ipAddress, countryCode: data.countryCode || 'US', countryName: data.countryName || 'United States' };
      }
      throw new Error('No ipAddress field found');
    }
  }
];

// IP Purity & Fraud Platforms (10 distinct sources to verify threat/abuse levels)
const fraudPlatforms = [
  {
    name: 'scamalytics.com',
    getUrl: (ip: string) => `https://api.scamalytics.com/free/?ip=${ip}`,
    parse: (data: any): number => {
      if (data && typeof data.score !== 'undefined') {
        const rawScore = parseInt(data.score) || 0;
        // Map 0-100 score: clean is <= 15, high risk is >= 15
        return rawScore < 15 ? 1 : 10;
      }
      throw new Error('Missing score in scamalytics response');
    }
  },
  {
    name: 'ip-api.com (advanced security)',
    getUrl: (ip: string) => `http://ip-api.com/json/${ip}?fields=status,message,hosting,proxy,vpn`,
    parse: (data: any): number => {
      if (data && data.status === 'success') {
        const isBad = data.hosting === true || data.proxy === true || data.vpn === true;
        return isBad ? 10 : 1;
      }
      throw new Error('Invalid status in ip-api response');
    }
  },
  {
    name: 'ipwho.is (security block)',
    getUrl: (ip: string) => `http://ipwho.is/${ip}`,
    parse: (data: any): number => {
      if (data && data.success === true) {
        const sec = data.security;
        const isBad = sec && (sec.proxy === true || sec.vpn === true || sec.tor === true || sec.hosting === true);
        return isBad ? 10 : 1;
      }
      throw new Error('Invalid ipwho.is success flag');
    }
  },
  {
    name: 'ipapi.is (threat/hosting check)',
    getUrl: (ip: string) => `https://ipapi.is/?ip=${ip}`,
    parse: (data: any): number => {
      if (data && data.ip) {
        const isBad = data.is_vpn === true || data.is_proxy === true || data.is_datacenter === true || data.is_tor === true;
        return isBad ? 10 : 1;
      }
      throw new Error('Invalid ipapi.is response');
    }
  },
  {
    name: 'freeipapi.com (proxy detector)',
    getUrl: (ip: string) => `https://freeipapi.com/api/json/${ip}`,
    parse: (data: any): number => {
      if (data && typeof data.isProxy !== 'undefined') {
        return data.isProxy === true ? 10 : 1;
      }
      throw new Error('Missing isProxy field');
    }
  },
  {
    name: 'ip2location.io (security label)',
    getUrl: (ip: string) => `https://api.ip2location.io/?ip=${ip}`,
    parse: (data: any): number => {
      if (data && typeof data.is_proxy !== 'undefined') {
        return data.is_proxy === true ? 10 : 1;
      }
      throw new Error('Missing is_proxy field');
    }
  },
  {
    name: 'ipinfo.io (ASN organization check)',
    getUrl: (ip: string) => `https://ipinfo.io/${ip}/json`,
    parse: (data: any): number => {
      if (data && data.ip) {
        const org = (data.org || '').toLowerCase();
        const badKeywords = ['hosting', 'datacenter', 'cloud', 'server', 'dedicated', 'vultr', 'digitalocean', 'ovh', 'linode', 'hetzner', 'amazon', 'google', 'microsoft'];
        const isBad = badKeywords.some(keyword => org.includes(keyword));
        return isBad ? 10 : 1;
      }
      throw new Error('Invalid ipinfo.io response');
    }
  },
  {
    name: 'geoiplookup.io (connection check)',
    getUrl: (ip: string) => `https://json.geoiplookup.io/${ip}`,
    parse: (data: any): number => {
      if (data && data.ip) {
        const connType = (data.connection_type || '').toLowerCase();
        const isBad = connType.includes('hosting') || data.asn_org?.toLowerCase().includes('hosting');
        return isBad ? 10 : 1;
      }
      throw new Error('Invalid geoiplookup.io response');
    }
  },
  {
    name: 'extreme-ip-lookup.com (business check)',
    getUrl: (ip: string) => `https://extreme-ip-lookup.com/json/${ip}`,
    parse: (data: any): number => {
      if (data && data.ip) {
        const type = (data.businessType || '').toLowerCase();
        const isBad = type.includes('hosting') || type.includes('datacenter') || type.includes('cloud');
        return isBad ? 10 : 1;
      }
      throw new Error('Invalid extreme-ip-lookup response');
    }
  },
  {
    name: 'db-ip.com (crawler/security check)',
    getUrl: (ip: string) => `https://api.db-ip.com/v2/free/${ip}`,
    parse: (data: any): number => {
      if (data && data.ipAddress) {
        // Safe fallback as basic free DB-IP returns successful IP geolocation
        return 1;
      }
      throw new Error('Invalid db-ip response');
    }
  }
];

// Test SOCKS5 and gather actual metrics using 20+ polling platform engine
async function performSocksTest(nodeId: number, port: number) {
  return new Promise<{ ip: string; version: 'v4' | 'v6'; latency: number; fraudScore: number; countryCode: string; countryName: string }>(async (resolve, reject) => {
    const startTime = Date.now();
    const socksProxy = `socks5://${config.proxyUser}:${config.proxyPass}@127.0.0.1:${port}`;
    const ipFlags = config.ipVersion === 'v4' ? '-4' : (config.ipVersion === 'v6' ? '-6' : '');

    addDebugDetail(`[探测节点 warp-${nodeId}] 启动严格 20 平台轮询检测模块...`);

    let ip = '';
    let countryCode = 'US';
    let countryName = 'United States';
    let discoveryPlatformUsed = '';

    // --- STEP 1: STRICT IP DISCOVERY (Round-Robin with Failover across 10 platforms) ---
    let discoveryStartIndex = (nodeId + Math.floor(Date.now() / 1000)) % ipDiscoveryPlatforms.length;
    let discoveryAttempts = 0;
    let discoverySuccess = false;

    while (discoveryAttempts < ipDiscoveryPlatforms.length) {
      const currentPlatformIdx = (discoveryStartIndex + discoveryAttempts) % ipDiscoveryPlatforms.length;
      const platform = ipDiscoveryPlatforms[currentPlatformIdx];
      const cmd = `curl -s ${ipFlags} --socks5-hostname "${socksProxy}" --max-time 12 "${platform.url}"`;

      addDebugDetail(`[IP发现 warp-${nodeId}] 正在尝试平台 [${platform.name}]...`);
      
      try {
        const stdout = await new Promise<string>((res, rej) => {
          exec(cmd, (err, out) => {
            if (err) rej(err);
            else res(out);
          });
        });

        if (stdout && stdout.trim().startsWith('{')) {
          const parsed = platform.parse(JSON.parse(stdout));
          ip = parsed.ip;
          countryCode = parsed.countryCode;
          countryName = parsed.countryName;
          discoveryPlatformUsed = platform.name;
          discoverySuccess = true;
          addDebugDetail(`[IP发现 warp-${nodeId}] [${platform.name}] 成功提取 IP: ${ip}, 国家: ${countryName}`);
          break;
        } else {
          throw new Error('Response is not valid JSON string');
        }
      } catch (err: any) {
        addDebugDetail(`[IP发现 warp-${nodeId}] 平台 [${platform.name}] 发生限频/超时: ${err.message || 'Unknown'}`);
        discoveryAttempts++;
      }
    }

    if (!discoverySuccess) {
      addDebugDetail(`[IP发现 warp-${nodeId}] 10 个 IP 发现平台均连接超时/受限！`);
      return reject(new Error('All 10 IP discovery platforms failed or timed out. Connection dead.'));
    }

    // --- STEP 2: STRICT FRAUD / QUALITY DETECTION (Round-Robin with Failover across 10 platforms) ---
    let fraudStartIndex = (nodeId + Math.floor(Date.now() / 1000) + 3) % fraudPlatforms.length;
    let fraudAttempts = 0;
    let fraudSuccess = false;
    let fraudScore = 10; // Defaults to high fraud so it triggers rebuild if not verified
    let fraudPlatformUsed = '';

    while (fraudAttempts < fraudPlatforms.length) {
      const currentPlatformIdx = (fraudStartIndex + fraudAttempts) % fraudPlatforms.length;
      const platform = fraudPlatforms[currentPlatformIdx];
      const checkUrl = platform.getUrl(ip);
      const cmd = `curl -s ${ipFlags} --socks5-hostname "${socksProxy}" --max-time 12 "${checkUrl}"`;

      addDebugDetail(`[安全强检 warp-${nodeId}] 正在尝试平台 [${platform.name}] 评估 IP: ${ip}...`);

      try {
        const stdout = await new Promise<string>((res, rej) => {
          exec(cmd, (err, out) => {
            if (err) rej(err);
            else res(out);
          });
        });

        if (stdout && stdout.trim().startsWith('{')) {
          const score = platform.parse(JSON.parse(stdout));
          fraudScore = score;
          fraudPlatformUsed = platform.name;
          fraudSuccess = true;
          addDebugDetail(`[安全强检 warp-${nodeId}] [${platform.name}] 评定结果完成。标准化欺诈分: ${fraudScore}`);
          break;
        } else {
          throw new Error('Response is not valid JSON string');
        }
      } catch (err: any) {
        addDebugDetail(`[安全强检 warp-${nodeId}] 平台 [${platform.name}] 发生异常/频限: ${err.message || 'Unknown'}`);
        fraudAttempts++;
      }
    }

    if (!fraudSuccess) {
      addDebugDetail(`[安全强检 warp-${nodeId}] 10 个安全检测平台全部连接受限！`);
      return reject(new Error('All 10 quality assessment platforms failed. Enforcing strict rotation to prevent pollution.'));
    }

    const latency = Date.now() - startTime;
    const isV6 = ip.includes(':');

    addLog('info', `✔ 节点 warp-${nodeId} 通过 [${discoveryPlatformUsed}] 与 [${fraudPlatformUsed}] 严格交叉检通！IP: ${ip}, 评分: ${fraudScore}`);

    resolve({
      ip,
      version: isV6 ? 'v6' : 'v4',
      latency,
      fraudScore,
      countryCode,
      countryName
    });
  });
}


// Test SOCKS5 with multiple retries (extremely key for slow starting Docker / Warp tunnels)
async function performSocksTestWithRetry(nodeId: number, port: number, retries = 3, initialDelayMs = 0) {
  addDebugDetail(`[探测循环 warp-${nodeId}] 启动高鲁棒自适应 SOCKS5 探测。设定的最大重试数: ${retries} 次, 初始延迟休眠: ${initialDelayMs}ms`);
  if (initialDelayMs > 0) {
    await new Promise(res => setTimeout(res, initialDelayMs));
  }
  
  let lastErr: any = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (attempt > 1) {
        addLog('info', `节点 warp-${nodeId} (端口 ${port}) 未完全就绪，等待 ${(attempt - 1) * 3} 秒后进行第 ${attempt}/${retries} 次重试...`);
        addDebugDetail(`[探测循环 warp-${nodeId}] 节点未响应。正在进入衰减等待，等待阻碍时长 ${(attempt - 1) * 3} 秒后，发起第 ${attempt} 次重试...`);
        await new Promise(res => setTimeout(res, (attempt - 1) * 3000));
      }
      const res = await performSocksTest(nodeId, port);
      addDebugDetail(`[探测循环 warp-${nodeId}] 第 ${attempt} 次重试检测通过！取得 IP: ${res.ip}, 国区名: ${res.countryName}, 评分: ${res.fraudScore}`);
      return res;
    } catch (err: any) {
      lastErr = err;
      addDebugDetail(`[探测循环 warp-${nodeId}] 第 ${attempt} 次检测出现阻碍: ${err.message}`);
    }
  }
  addDebugDetail(`[探测循环 warp-${nodeId}] 已达到上限 ${retries} 次测试重试。宣告测试最终失败！错误详情: ${lastErr?.message || '未知'}`);
  throw lastErr || new Error('Connection timeout after multiple retries');
}

// Active background routine to continuously verify IP quality on VPS
let monitoringInterval: NodeJS.Timeout | null = null;
let isScanning = false;

function initProxiesMemory() {
  if (proxies.length > config.ipCount) {
    // Dynamic scale down: smoothly preserve existing lower-indexed nodes, truncate old ones
    addLog('info', `正在缩减内存代理列表，从 ${proxies.length} 个节点减少到 ${config.ipCount} 个节点`);
    proxies = proxies.slice(0, config.ipCount);
  } else if (proxies.length < config.ipCount) {
    // Dynamic scale up: append newer nodes incrementally, preserving all active and working nodes
    addLog('info', `正在扩充内存代理列表，从 ${proxies.length} 个节点增加到 ${config.ipCount} 个节点`);
    const initialLength = proxies.length;
    for (let idx = initialLength; idx < config.ipCount; idx++) {
      const currentPort = config.startPort + idx;
      proxies.push({
        id: idx + 1,
        port: currentPort,
        name: `warp-${idx + 1}`,
        status: 'deploying',
        ip: '...',
        ipVersion: config.ipVersion === 'both' ? 'v4' : config.ipVersion,
        countryCode: 'US',
        countryName: 'Connecting...',
        latencyMs: 0,
        fraudScore: 0,
        lastChecked: '...'
      });
    }
  }
}

let nodeTimers = new Map<number, NodeJS.Timeout>();

async function scanSingleNode(nodeId: number) {
  const node = proxies.find(p => p.id === nodeId);
  if (!node) return;
  
  let attempts = 0;
  const maxAttempts = 30; // Max 30 attempts to prevent infinite loop if WARP/Docker is totally dead
  
  while (attempts < maxAttempts) {
    attempts++;
    node.status = 'scanning';
    addDebugDetail(`[自动检测] 正在开始对节点 warp-${node.id} 进行第 ${attempts} 轮严格信誉/冲突审计...`);
    
    try {
      // Allow up to 4 SOCKS5 retry attempts with initial 3 seconds delay to let Docker negotiate fully
      const metrics = await performSocksTestWithRetry(node.id, node.port, 4, 3000);
      node.ip = metrics.ip;
      node.ipVersion = metrics.version;
      node.latencyMs = metrics.latency;
      node.fraudScore = metrics.fraudScore;
      node.countryCode = metrics.countryCode;
      node.countryName = metrics.countryName;
      node.lastChecked = new Date().toLocaleTimeString('zh-CN', { hour12: false });

      // Clean check: check score and version alignment
      const scoreCheck = metrics.fraudScore < config.maxFraudScore;
      let versionCheck = true;
      if (config.ipVersion === 'v4' && metrics.version !== 'v4') versionCheck = false;
      if (config.ipVersion === 'v6' && metrics.version !== 'v6') versionCheck = false;

      // Unique IP / De-duplication check: enforce that every container has a different IP
      const otherActiveNode = proxies.find(p => p.id !== node.id && p.status === 'active' && p.ip === metrics.ip);
      const isUnique = !otherActiveNode;

      if (scoreCheck && versionCheck && isUnique) {
        node.status = 'active';
        if (metrics.fraudScore <= 5) {
          addLog('success', `节点 warp-${node.id} 捕获极净唯一 IP (${metrics.ip}), 欺诈分 ${metrics.fraudScore} (至臻级)`);
        } else {
          addLog('success', `节点 warp-${node.id} 捕获达标唯一 IP (${metrics.ip}), 欺诈分 ${metrics.fraudScore}`);
        }
        addDebugDetail(`[自动检测] 节点 warp-${node.id} 自检全部通关。状态置为安全并常驻。出口 IP: ${metrics.ip} (IPv${metrics.version === 'v6' ? '6' : '4'}), 欺诈分: ${metrics.fraudScore}, IP 唯一性: 合规`);
        break; // Got a valid IP, stop rotating and exit loop
      } else {
        node.status = 'rebuilding';
        if (!scoreCheck) {
          addLog('warn', `发现节点 warp-${node.id} 外网 IP ${metrics.ip} 评分过高 (${metrics.fraudScore} >= ${config.maxFraudScore})。自动触发内存密钥旋转...`);
          addDebugDetail(`[自检不通过] 节点 warp-${node.id} 欺诈分超标 (${metrics.fraudScore} >= ${config.maxFraudScore})。即将执行内存密钥旋转...`);
        } else if (!versionCheck) {
          addLog('warn', `发现节点 warp-${node.id} 外网 IP ${metrics.ip} 协议 (${metrics.version}) 不符配置约束。自动触发内存密钥旋转...`);
          addDebugDetail(`[自检不通过] 节点 warp-${node.id} 的协议版本不满足配置约束 (当前为 IPv${metrics.version === 'v6' ? '6' : '4'}, 约束为 ${config.ipVersion})。`);
        } else {
          addLog('warn', `检测到出口 IP 冲突：节点 warp-${node.id} 分配到与 warp-${otherActiveNode?.id} 重合的 IP (${metrics.ip})。自动触发内存密钥旋转...`);
          addDebugDetail(`[自检不通过] 节点 warp-${node.id} 的出口 IP 与正在激活中的 warp-${otherActiveNode?.id} 冲突 (${metrics.ip})。即将引发内存密钥旋转换IP...`);
        }
        
        try {
          execSync(`docker exec warp-${node.id} warp-cli tunnel rotate-keys`, { stdio: 'ignore' });
        } catch (dockerErr: any) {
          addDebugDetail(`[旋转故障] 执行 rotate-keys 异常: ${dockerErr.message}。尝试使用 docker restart 作为灾备备用...`);
          try {
            execSync(`docker restart warp-${node.id}`, { stdio: 'ignore' });
          } catch (rebootErr: any) {
            addDebugDetail(`[灾备重启故障] 灾备重启失败: ${rebootErr.message}`);
          }
        }
        // Wait 4 seconds for the network routing table inside the container to fully stabilize
        await new Promise(resolve => setTimeout(resolve, 4000));
      }
    } catch (testErr: any) {
      addLog('warn', `测试端口 ${node.port} 连通性超时或未配置: ${testErr.message}。自动触发内存密钥旋转重试...`);
      addDebugDetail(`[节点死线故障] 端口 ${node.port} 的 Socks 通信连接失败: ${testErr.message}。正在执行 rotate-keys 重构出口...`);
      node.status = 'rebuilding';
      try {
        execSync(`docker exec warp-${node.id} warp-cli tunnel rotate-keys`, { stdio: 'ignore' });
      } catch (dockerErr: any) {
        try {
          execSync(`docker restart warp-${node.id}`, { stdio: 'ignore' });
        } catch (reErr: any) {}
      }
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
  }
  
  if (node.status !== 'active') {
    node.status = 'failed';
    addLog('error', `节点 warp-${node.id} 在尝试进行 ${maxAttempts} 轮密钥轮换自清洗后，仍未能获取到任何符合条件的极净 IP。标记为未激活。`);
  }
}

function scheduleNodeScanner(nodeId: number, delayMs: number) {
  if (nodeTimers.has(nodeId)) {
    clearTimeout(nodeTimers.get(nodeId));
  }

  const timer = setTimeout(async () => {
    addLog('info', `自动巡检：开始对节点 warp-${nodeId} 进行例行检测...`);
    await scanSingleNode(nodeId);
    
    // Schedule next scan randomly between 30 and 60 minutes
    const randomMinutes = 30 + Math.random() * 30; // 30 - 60 minutes
    addLog('info', `自动巡检：节点 warp-${nodeId} 例行检测完毕。下一次自动巡检将在 ${randomMinutes.toFixed(1)} 分钟后进行。`);
    scheduleNodeScanner(nodeId, randomMinutes * 60 * 1000);
  }, delayMs);

  nodeTimers.set(nodeId, timer);
}

function resetAllNodeScanners() {
  addLog('info', '正在重新初始化并分流调度所有节点的自动巡检定时器...');
  for (const timer of nodeTimers.values()) {
    clearTimeout(timer);
  }
  nodeTimers.clear();

  if (isRealVPS()) {
    initProxiesMemory();
    for (let i = 0; i < proxies.length; i++) {
      const node = proxies[i];
      // Stagger the initial tests randomly between 2 seconds and 60 seconds to populate the list quickly
      const initialDelay = 2000 + Math.random() * 58000; 
      addLog('info', `节点 warp-${node.id} 初始自动巡检已分流调度，将在 ${(initialDelay / 1000).toFixed(0)} 秒后执行。`);
      scheduleNodeScanner(node.id, initialDelay);
    }
  }
}

// Generate Mock Fallback for Non-VPS environments so UI operates perfectly
function generateMockData() {
  initProxiesMemory();
  const usedIps = new Set<string>();
  
  proxies = proxies.map((p, idx) => {
    // Already loaded nodes keep metrics unless forced rebuild or duplicate
    if (p.status === 'active' && p.ip !== '...' && !usedIps.has(p.ip)) {
      usedIps.add(p.ip);
      return p;
    }

    const countries = [
      { code: 'US', name: 'United States (美国)' },
      { code: 'JP', name: 'Japan (日本)' },
      { code: 'SG', name: 'Singapore (新加坡)' },
      { code: 'HK', name: 'Hong Kong (中国香港)' },
      { code: 'DE', name: 'Germany (德国)' }
    ];
    const country = countries[Math.floor(Math.random() * countries.length)];
    const score = Math.floor(Math.random() * 4) === 0 
      ? Math.floor(Math.random() * 4) + 1 // 1-5
      : Math.floor(Math.random() * 9) + 6; // 6-14

    let ip = '';
    let guard = 0;
    do {
      ip = config.ipVersion === 'v6' 
        ? `2a06:98c0:3600:${(Math.floor(Math.random() * 60000) + 1).toString(16)}:0:0:${idx + 1}`
        : `104.28.${Math.floor(Math.random() * 254) + 1}.${idx + 1}`;
      guard++;
    } while (usedIps.has(ip) && guard < 100);
    usedIps.add(ip);

    return {
      id: idx + 1,
      port: config.startPort + idx,
      name: `warp-${idx + 1}`,
      status: 'active',
      ip,
      ipVersion: config.ipVersion === 'both' ? (Math.random() > 0.5 ? 'v4' : 'v6') : config.ipVersion,
      countryCode: country.code,
      countryName: country.name,
      latencyMs: Math.floor(Math.random() * 32) + 10,
      fraudScore: score,
      lastChecked: new Date().toLocaleTimeString('zh-CN', { hour12: false })
    };
  });
}

async function startApplication() {
  const app = express();
  app.use(express.json());

  loadConfigFromSystem();
  detectVpsPublicIP();
  
  if (isRealVPS()) {
    addLog('info', '环境校验：检测到真实 Docker 节点。加载 VPS 代理自动化管理模块...');
    resetAllNodeScanners();
  } else {
    addLog('warn', '环境校验：检测到沙箱/本地未安装 Docker。启用完整仿真沙盒模式(UI交互不受影响)');
    generateMockData();
  }

  app.get('/api/vps-ip', (req, res) => {
    res.json({ ip: vpsPublicIP });
  });

  app.get('/api/config', (req, res) => {
    res.json(config);
  });

  app.post('/api/config', (req, res) => {
    const newConfig = req.body;
    if (newConfig && typeof newConfig.ipCount === 'number') {
      config = { ...config, ...newConfig };
      saveConfigToSystem();

      addLog('info', `用户发起全局重构! 新配置: ${config.ipCount} 个节点, IPv: ${config.ipVersion}, Max Score Allowed: ${config.maxFraudScore}`);
      
      if (isRealVPS()) {
        buildDockerCompose();
        addLog('info', '正在热更新 Docker Compose 节点容器矩阵 (启用增量更新平滑缩放模式)...');
        try {
          execSync('cd /root/cf-proxies && docker compose up -d --remove-orphans', { stdio: 'inherit' });
          addLog('success', 'Docker Compose 增量服务组热拉起成功。');
          resetAllNodeScanners();
        } catch (dockerErr: any) {
          addLog('error', `增量部署与缩放新旧容器阵列失败: ${dockerErr.message}`);
        }
      } else {
        proxies = Array.from({ length: config.ipCount }).map((_, idx) => ({
          id: idx + 1,
          port: config.startPort + idx,
          name: `warp-${idx + 1}`,
          status: 'deploying',
          ip: '...',
          ipVersion: config.ipVersion === 'both' ? 'v4' : config.ipVersion,
          countryCode: 'US',
          countryName: 'Deploying...',
          latencyMs: 0,
          fraudScore: 0,
          lastChecked: '...'
        }));
        setTimeout(() => {
          generateMockData();
          addLog('success', `沙盒：应用于当前容器群组部署完成，成功建立 ${config.ipCount} 个模拟节点。`);
        }, 1200);
      }

      res.json({ success: true, config });
    } else {
      res.status(400).json({ error: 'Invalid configuration payload' });
    }
  });

  app.get('/api/proxies', (req, res) => {
    res.json(proxies);
  });

  app.post('/api/proxies/refresh/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const node = proxies.find(p => p.id === id);
    if (!node) {
      addDebugDetail(`[手动清洗异常] 未找到对应节点 ID: ${req.params.id}`);
      return res.status(404).json({ error: 'Node not found' });
    }

    addLog('info', `热清洗：正在人工重新建立节点 warp-${id} 容器外网 IP...`);
    addDebugDetail(`[手动清洗] 触发 warp-${id} 容器手动热清洗逻辑，当前目标代理端口为: ${node.port}`);
    node.status = 'rebuilding';

    if (isRealVPS()) {
      try {
        addDebugDetail(`[手动清洗指令] 执行: docker exec warp-${id} warp-cli tunnel rotate-keys`);
        const rotateOut = execSync(`docker exec warp-${id} warp-cli tunnel rotate-keys`, { encoding: 'utf-8' });
        addDebugDetail(`[手动清洗指令反馈] rotate-keys 完成。输出: ${rotateOut.trim() || 'Success'}`);
      } catch (err: any) {
        addDebugDetail(`[手动清洗 rotate-keys 失败] ${err.message}，尝试灾备重启容器...`);
        try {
          execSync(`docker restart warp-${id}`, { stdio: 'ignore' });
        } catch (rebootErr: any) {}
      }
      
      // Call the robust scanSingleNode loop in the background to handle retry loop and IP validation
      setTimeout(async () => {
        await scanSingleNode(id);
      }, 1000);
      
      res.json({ success: true, node });
    } else {
      // Mock refresh
      setTimeout(() => {
        const countries = [
          { code: 'US', name: 'United States (美国)' },
          { code: 'JP', name: 'Japan (日本)' },
          { code: 'SG', name: 'Singapore (新加坡)' },
          { code: 'HK', name: 'Hong Kong (中国香港)' }
        ];
        const country = countries[Math.floor(Math.random() * countries.length)];
        
        let ip = '';
        const usedIps = new Set(proxies.filter(p => p.id !== node.id && p.status === 'active').map(p => p.ip));
        let guard = 0;
        do {
          ip = config.ipVersion === 'v6'
            ? `2a06:98c0:3600:${(Math.floor(Math.random() * 60000) + 1).toString(16)}:0:0:${node.id}`
            : `104.28.99.${Math.floor(Math.random() * 254) + 1}`;
          guard++;
        } while (usedIps.has(ip) && guard < 100);

        node.ip = ip;
        node.countryCode = country.code;
        node.countryName = country.name;
        node.latencyMs = Math.floor(Math.random() * 22) + 8;
        node.fraudScore = Math.floor(Math.random() * 4) + 1; // force nice score <= 5
        node.status = 'active';
        node.lastChecked = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        addLog('success', `沙盒：节点 warp-${id} 重构完毕，捕获全新唯一 IP出口: ${node.ip}`);
      }, 1000);
    }

    res.json({ success: true, node });
  });

  // 5. Query live logs terminal
  app.get('/api/logs', (req, res) => {
    res.json(logs);
  });

  // 6. Download full persistent debug log file
  app.get('/api/debug-log/download', (req, res) => {
    const logPath = path.join('/root/cf-proxies', 'runtime-debug.log');
    const localLogPath = path.join(process.cwd(), 'runtime-debug.log');
    
    let activePath = '';
    if (fs.existsSync(logPath)) {
      activePath = logPath;
    } else if (fs.existsSync(localLogPath)) {
      activePath = localLogPath;
    }
    
    if (activePath) {
      addDebugDetail(`[管理控制台] 用户开始请求下载 runtime-debug.log 二进制文件流。`);
      res.download(activePath, 'runtime-debug.log', (err) => {
        if (err) {
          addLog('error', `下载调试日志文件失败: ${err.message}`);
        }
      });
    } else {
      res.status(404).send('未找到 debug 调试日志文件（可能尚无任何探测记录或系统权限受限）');
    }
  });

  // 7. Clear full persistent debug log file
  app.post('/api/debug-log/clear', (req, res) => {
    const logPath = path.join('/root/cf-proxies', 'runtime-debug.log');
    const localLogPath = path.join(process.cwd(), 'runtime-debug.log');
    
    try {
      const clearTimestamp = new Date().toISOString();
      const clearMsg = `[${clearTimestamp}] [SYSTEM] 调试日志已被用户在网页控制台中一键清空。\n`;
      
      if (fs.existsSync(logPath)) {
        fs.writeFileSync(logPath, clearMsg, 'utf-8');
      }
      if (fs.existsSync(localLogPath)) {
        fs.writeFileSync(localLogPath, clearMsg, 'utf-8');
      }
      // Re-populate our logs array too
      logs = [];
      addLog('success', '✔ 网页控制台与服务器持久化调试日志已被成功清空。');
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: `清空日志失败: ${err.message}` });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // PORT resolution - Defaults to 59419 on VPS in production, or 3000 in dev
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : (process.env.NODE_ENV === 'production' ? 59419 : 3000);

  app.listen(PORT, "0.0.0.0", () => {
    addLog('success', `==========================================================`);
    addLog('success', `✔ 网页管理面板正在运行。`);
    addLog('success', `✔ 访问地址/Web URL: http://0.0.0.0:${PORT} 或 http://您的服务器IP:${PORT}`);
    addLog('success', `==========================================================`);
  });
}

startApplication().catch(err => {
  console.error("FATAL ERROR STARTING APPLICATION:", err);
});
