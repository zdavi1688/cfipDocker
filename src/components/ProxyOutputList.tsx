import { useState, useEffect } from 'react';
import { ProxyItem, ProxyConfig } from '../types';
import { ClipboardCopy, Check, FileText, Download, LayoutGrid } from 'lucide-react';

interface ProxyOutputListProps {
  proxies: ProxyItem[];
  config: ProxyConfig;
}

type FormatType = 'standard' | 'url' | 'ap' | 'json';

export default function ProxyOutputList({ proxies, config }: ProxyOutputListProps) {
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<FormatType>('standard');
  const [customIP, setCustomIP] = useState('');

  // Automatically detect the VPS IP on component initialization
  useEffect(() => {
    // 1. Try to extract from the panel's direct hostname URL
    const hostname = window.location.hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' || hostname.startsWith('192.168.') || hostname.startsWith('10.');
    
    if (hostname && !isLocal) {
      setCustomIP(hostname);
    }

    // 2. Query the dynamically probed true pubic IP from VPS backend
    const fetchVpsIP = async () => {
      try {
        const res = await fetch('/api/vps-ip');
        if (res.ok) {
          const data = await res.json();
          if (data.ip && data.ip !== '0.0.0.0' && data.ip !== '127.0.0.1') {
            setCustomIP(data.ip);
          }
        }
      } catch (err) {
        console.warn("无法从服务端接口拉取公网出口IP:", err);
      }
    };
    fetchVpsIP();
  }, []);

  // SOCKS5 lists logic
  const getOutputText = () => {
    const vpsIP = customIP.trim() || '123.45.67.89'; // Default fallback vps ip if unresolved
    const activeNodes = proxies.filter(p => p.status === 'active');
    
    if (activeNodes.length === 0) {
      return '# 正在加载代理节点，或者代理暂未初始化完毕...\n# Nodes are initializing...';
    }

    return activeNodes.map(p => {
      if (format === 'standard') {
        // Standard IP:Port:User:Pass
        return `${vpsIP}:${p.port}:${config.proxyUser}:${config.proxyPass}`;
      } else if (format === 'url') {
        // Full url: socks5://user:pass@IP:port
        return `socks5://${config.proxyUser}:${config.proxyPass}@${vpsIP}:${p.port}`;
      } else if (format === 'ap') {
        // AdsPower / Hubstudio format (tab-separated or comma): port, user, pass, type (socks5)
        return `${vpsIP}\t${p.port}\t${config.proxyUser}\t${config.proxyPass}\tsocks5`;
      } else {
        // JSON config output
        return JSON.stringify({
          name: p.name,
          host: vpsIP,
          port: p.port,
          type: 'socks5',
          username: config.proxyUser,
          password: config.proxyPass,
          ip: p.ip,
          country: p.countryName,
          score: p.fraudScore
        });
      }
    }).join('\n');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getOutputText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="proxy-output-list" className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4 mb-4">
        <div>
          <h2 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
            <ClipboardCopy className="w-5 h-5 text-emerald-500" />
            一键复制代理列表 / Batch Credentials Export
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            选择格式并复制，可直接一键填入 AdsPower、Hubstudio 密码管理器或各大养号软件。
          </p>
        </div>

        {/* Formats Selection */}
        <div className="flex bg-zinc-950 rounded-lg p-0.5 border border-zinc-800">
          <button
            onClick={() => setFormat('standard')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
              format === 'standard' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="IP:Port:User:Pass"
          >
            标准格式
          </button>
          <button
            onClick={() => setFormat('url')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
              format === 'url' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="socks5://User:Pass@IP:Port"
          >
            SOCKS5 链接
          </button>
          <button
            onClick={() => setFormat('ap')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
              format === 'ap' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
            title="AdsPower 批量导入制表符格式"
          >
            指纹批导
          </button>
          <button
            onClick={() => setFormat('json')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
              format === 'json' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            JSON 配置
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {/* Dynamic VPS IP override wrapper */}
        <div className="bg-zinc-950 border border-zinc-850 rounded-lg p-3.5 flex flex-col sm:flex-row items-center gap-3 justify-between">
          <span className="text-xs text-zinc-400 font-medium">VPS 外网 IP 映射 (已自动精确侦测，支持人工修改)：</span>
          <div className="relative w-full sm:w-auto">
            <input
              type="text"
              placeholder="已自动载入宿主机真实 IP"
              value={customIP}
              onChange={(e) => setCustomIP(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 font-mono px-3 py-1.5 focus:border-emerald-500 focus:outline-none w-full sm:w-56"
            />
          </div>
        </div>

        {/* Textarea results block */}
        <div className="relative">
          <textarea
            readOnly
            value={getOutputText()}
            className="w-full h-40 bg-zinc-950 text-zinc-300 font-mono text-xs p-4 rounded-xl border border-zinc-850 focus:outline-none resize-none leading-relaxed scrollbar-thin select-all"
          />
          <button
            onClick={handleCopy}
            className="absolute right-3.5 bottom-3.5 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-lg font-bold text-xs transition-colors shadow-sm select-none"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                已复制！
              </>
            ) : (
              <>
                <ClipboardCopy className="w-3.5 h-3.5" />
                全部导出复制 / Copy List
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
