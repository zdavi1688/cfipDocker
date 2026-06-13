import { useState, useEffect, useRef } from 'react';
import { ProxyConfig, ProxyItem, LogEntry } from './types';
import ProxyConfigForm from './components/ProxyConfigForm';
import ProxyDashboard from './components/ProxyDashboard';
import ProxyGrid from './components/ProxyGrid';
import ScriptGenerator from './components/ScriptGenerator';
import ProxyOutputList from './components/ProxyOutputList';
import { Shield, Terminal, Layers, RefreshCw, MonitorPlay, AlertTriangle, Download, Trash2 } from 'lucide-react';

export default function App() {
  const [config, setConfig] = useState<ProxyConfig>({
    ipCount: 5,
    ipVersion: 'v4',
    maxFraudScore: 3,
    startPort: 10001,
    proxyUser: 'cfuser',
    proxyPass: 'cfpass',
    autoRebuildThreshold: true
  });

  const [proxies, setProxies] = useState<ProxyItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'matrix' | 'script' | 'list'>('matrix');
  const [currentTime, setCurrentTime] = useState<string>('');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const terminalRef = useRef<HTMLDivElement>(null);

  // Digital Clock in Beijing Time
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      };
      setCurrentTime(new Intl.DateTimeFormat('zh-CN', options).format(now));
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync data with Express backend
  const fetchState = async () => {
    try {
      const pRes = await fetch('/api/proxies');
      if (pRes.ok) {
        const pData = await pRes.json();
        setProxies(pData);
      }

      const lRes = await fetch('/api/logs');
      if (lRes.ok) {
        const lData = await lRes.json();
        setLogs(lData);
      }
      
      setConnectionError(null);
    } catch (err) {
      console.warn("API is currently starting up or offline:", err);
      setConnectionError("正在与后端管理守护进程建立连接...");
    }
  };

  // On mount, load initial configuration
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
        }
      } catch (err) {
        console.warn("Backend not ready yet, using state defaults", err);
      }
    };
    
    loadConfig();
    fetchState();

    // Rapid polls during active sessions
    const interval = setInterval(fetchState, 3000);
    return () => clearInterval(interval);
  }, []);

  // Deploy configuration to Group
  const handleDeploy = async () => {
    setIsDeploying(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config);
        // Instant update
        await fetchState();
      }
    } catch (err) {
      console.error("Deploy request failed:", err);
    } finally {
      setTimeout(() => setIsDeploying(false), 2000); // UI breathing space
    }
  };

  // Refresh single proxy
  const handleRefreshNode = async (id: number) => {
    // Optimistic UI state
    setProxies(prev => prev.map(p => p.id === id ? { ...p, status: 'rebuilding' } : p));
    
    try {
      await fetch(`/api/proxies/refresh/${id}`, { method: 'POST' });
      await fetchState();
    } catch (err) {
      console.error("Failed to refresh individual node:", err);
    }
  };

  const handleDownloadLogs = () => {
    window.open('/api/debug-log/download', '_blank');
  };

  const handleClearLogs = async () => {
    if (window.confirm("确定要清空服务器上的持久化调试日志与终端显示吗？")) {
      try {
        const res = await fetch('/api/debug-log/clear', { method: 'POST' });
        if (res.ok) {
          setLogs([]);
        }
      } catch (err) {
        console.error("清空日志出现网络异常", err);
      }
    }
  };

  // Auto scroll logs without affecting the entire page viewport
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-zinc-950">
      
      {/* 1. Header Banner */}
      <header className="bg-zinc-950 border-b border-zinc-900 sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center">
              <Shield className="w-5.5 h-5.5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-zinc-100 tracking-tight">Cloudflare SOCKS5 多 IP 代理净化中心</h1>
                <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono px-1.5 py-0.5 rounded font-medium">v1.14</span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">自动循环重建直至外网 IP 欺诈度评分低于 15 (优先分配 5 内黄金洁净 IP)</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Beijing Time Display */}
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800/80 px-3 py-1.5 rounded-lg select-none">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs text-zinc-500 font-medium font-mono">BEIJING TIME:</span>
              <span className="text-xs font-mono font-bold text-emerald-400 select-all">{currentTime || '08:00:00'}</span>
            </div>

            {/* Config Port indicator */}
            <div className="hidden md:flex items-center gap-1 bg-zinc-900 border border-zinc-800/80 px-2.5 py-1.5 rounded-lg text-xs font-mono text-zinc-400">
              <span className="text-emerald-500 font-bold">PORT:</span>
              <span>59418 (PANEL_SECURE)</span>
            </div>
          </div>

        </div>
      </header>

      {/* Connection notification if server offline during boot */}
      {connectionError && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2.5 text-center text-xs text-amber-400 flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4 animate-bounce" />
          <span>{connectionError}</span>
        </div>
      )}

      {/* 2. Main Space Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        
        {/* Statistics Widgets removed per user request */}

        {/* Dynamic Section Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT PANELS: ConfigForm & Live Logs Terminal (span-4) */}
          <div className="lg:col-span-4 space-y-6">
            <ProxyConfigForm
              config={config}
              onChange={setConfig}
              onDeploy={handleDeploy}
              isDeploying={isDeploying}
            />

            {/* Activity Stream Terminal */}
            <div className="bg-zinc-900 border border-zinc-805 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-3">
                <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                  <Terminal className="text-emerald-500 w-4 h-4" />
                  服务器调度日志 / Audit Terminal
                </h3>
                <span className="text-[10px] font-mono text-zinc-500 animate-pulse">● LIVE STREAM</span>
              </div>

              {/* Terminal Screen details */}
              <div ref={terminalRef} className="bg-zinc-950 border border-zinc-850 rounded-lg p-3 text-xs font-mono h-[280px] overflow-y-auto space-y-2 select-all scrollbar-thin">
                {logs.length === 0 ? (
                  <div className="text-zinc-600 italic py-8 text-center animate-pulse">正在等待守护进程向控制台推送日志...</div>
                ) : (
                  logs.map((log) => {
                    let color = 'text-zinc-300';
                    if (log.level === 'success') color = 'text-emerald-400';
                    if (log.level === 'warn') color = 'text-amber-400';
                    if (log.level === 'error') color = 'text-rose-400';

                    return (
                      <div key={log.id} className="leading-snug break-all text-[11px]">
                        <span className="text-zinc-500 mr-1.5">[{log.timestamp}]</span>
                        <span className={color}>{log.message}</span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Logger persistence controllers */}
              <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-zinc-800">
                <button
                  onClick={handleDownloadLogs}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-750 text-zinc-200 transition-colors border border-zinc-700/60 shadow-sm"
                  title="下载服务器中完整、实时的排障探测日志文件"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-450" />
                  下载完整排障日志
                </button>
                <button
                  onClick={handleClearLogs}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-rose-400 transition-colors border border-zinc-800"
                  title="一键清空服务器的日志记录缓存并复位终端"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  清空缓存日志
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT PANELS: Layout Tabs, Script Generator, Output List & Grid (span-8) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* View selection tabs */}
            <div className="flex bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
              <button
                onClick={() => setActiveSubTab('matrix')}
                className={`flex-1 py-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  activeSubTab === 'matrix' 
                    ? 'bg-zinc-850 text-zinc-100 shadow-sm border border-zinc-800' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Layers className="w-4 h-4 text-emerald-400" />
                IP 出口矩阵控制 / Instance Matrix
              </button>
              <button
                onClick={() => setActiveSubTab('script')}
                className={`flex-1 py-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  activeSubTab === 'script' 
                    ? 'bg-zinc-850 text-zinc-100 shadow-sm border border-zinc-800' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Terminal className="w-4 h-4 text-emerald-400" />
                一键部署脚本 (精简) / Deploy Shell
              </button>
              <button
                onClick={() => setActiveSubTab('list')}
                className={`flex-1 py-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  activeSubTab === 'list' 
                    ? 'bg-zinc-850 text-zinc-100 shadow-sm border border-zinc-800' 
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <MonitorPlay className="w-4 h-4 text-emerald-400" />
                指纹浏览器批导 / Batch Credentials
              </button>
            </div>

            {/* Displaying active tab */}
            {activeSubTab === 'matrix' && (
              <ProxyGrid proxies={proxies} onRefreshNode={handleRefreshNode} />
            )}

            {activeSubTab === 'script' && (
              <ScriptGenerator config={config} />
            )}

            {activeSubTab === 'list' && (
              <ProxyOutputList proxies={proxies} config={config} />
            )}

          </div>

        </div>

      </main>

      {/* 3. Footer Branding */}
      <footer className="bg-zinc-950 border-t border-zinc-900 mt-12 py-6 px-6 text-center">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between text-xs text-zinc-500 gap-4">
          <p>© 2026 Cloudflare Multi-IP Proxy Manager. 仅限您自己的 VPS 服务器环境部署与运维管理使用。</p>
          <div className="flex gap-4">
            <span className="flex items-center gap-1 text-[11px] font-mono text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Docker Node Agent Mode: Connected
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}
