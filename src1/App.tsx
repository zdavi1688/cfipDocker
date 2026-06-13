import { useState, useEffect, useRef } from 'react';
import { ProxyConfig, ProxyItem, LogEntry } from './types';
import ProxyGrid from './components/ProxyGrid';
import ScriptGenerator from './components/ScriptGenerator';
import ProxyOutputList from './components/ProxyOutputList';
import AddIpModal from './components/AddIpModal';
import { Shield, Terminal, Layers, RefreshCw, MonitorPlay, AlertTriangle, Download, Trash2 } from 'lucide-react';

export default function App() {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [config, setConfig] = useState<ProxyConfig>({
    ipCount: 5,
    ipVersion: 'v4',
    maxFraudScore: 15,
    startPort: 10001,
    proxyUser: 'cfuser',
    proxyPass: 'cfpass' + Math.floor(Math.random() * 900),
    autoRebuildThreshold: true
  });

  const [proxies, setProxies] = useState<ProxyItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isDeploying, setIsDeploying] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'matrix' | 'script' | 'list'>('matrix');
  const [currentTime, setCurrentTime] = useState<string>('');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const terminalRef = useRef<HTMLDivElement>(null);

  // Digital Clock - Shanghai Time (Beijing Time)
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
      setConnectionError("正在与后端管理守护进程建立连接或重置服务组中...");
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
  const handleApplyConfig = async () => {
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
        await fetchState();
      }
    } catch (err) {
      console.error("Config deploy request failed:", err);
    } finally {
      setTimeout(() => setIsDeploying(false), 1500);
    }
  };

  // Refresh single proxy
  const handleRefreshNode = async (id: number) => {
    setProxies(prev => prev.map(p => p.id === id ? { ...p, status: 'rebuilding' } : p));
    try {
      await fetch(`/api/proxies/refresh/${id}`, { method: 'POST' });
      await fetchState();
    } catch (err) {
      console.error("Failed to refresh individual node:", err);
    }
  };

  // Add Dynamic Bulk proxy nodes (Requirement 5)
  const handleAddProxies = async (formData: any) => {
    try {
      const res = await fetch('/api/proxies/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: formData.country,
          quantity: formData.quantity,
          ipVersion: formData.ipVersion,
          username: formData.username,
          password: formData.password,
          startPort: formData.startPort,
          maxFraudScore: formData.maxFraudScore,
          autoRebuild: formData.autoRebuild
        })
      });
      if (res.ok) {
        // Sync config immediately onto UI state
        setConfig(prev => ({
          ...prev,
          proxyUser: formData.username,
          proxyPass: formData.password,
          autoRebuildThreshold: formData.autoRebuild,
          ipVersion: formData.ipVersion,
          maxFraudScore: formData.maxFraudScore,
          startPort: formData.startPort
        }));
        await fetchState();
      } else {
        const err = await res.json();
        alert('部署失败: ' + (err.error || '未知错误'));
      }
    } catch (err) {
      console.error('Failed to add dynamic proxy nodes:', err);
    }
  };

  // Delete live node
  const handleDeleteNode = async (id: number) => {
    if (window.confirm(`确定要删除并注销此 SOCKS5 节点及对应的 Docker 容器实例吗？`)) {
      try {
        const res = await fetch(`/api/proxies/delete/${id}`, {
          method: 'POST'
        });
        if (res.ok) {
          await fetchState();
        } else {
          const err = await res.json();
          alert('删除失败: ' + (err.error || '未知错误'));
        }
      } catch (err) {
        console.error('Failed to delete live proxy node:', err);
      }
    }
  };

  // Batch delete live nodes
  const handleDeleteNodes = async (ids: number[]) => {
    try {
      const res = await fetch(`/api/proxies/delete-batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids })
      });
      if (res.ok) {
        await fetchState();
      } else {
        const err = await res.json();
        alert('批量删除失败: ' + (err.error || '未知错误'));
      }
    } catch (err) {
      console.error('Failed to batch delete live proxy nodes:', err);
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

  // Auto scroll terminal screen
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-zinc-950">
      
      {/* 1. Header Navigation */}
      <header className="bg-zinc-950 border-b border-zinc-900 sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center">
              <Shield className="w-5.5 h-5.5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-zinc-100 tracking-tight">VPS 获取多 CFIP 出口控制中心 (Docker 增强版)</h1>
                <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-405 font-mono px-1.5 py-0.5 rounded font-semibold text-emerald-450">DOCKER HIGH SPEED</span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">自动循环探测重构，拦截欺诈 IP | 物理多容器端口并发纯净架构</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Clock */}
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-805 px-3 py-1.5 rounded-lg select-none">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[10px] text-zinc-500 font-bold font-mono">BEIJING TIME:</span>
              <span className="text-xs font-mono font-bold text-emerald-400 select-all">{currentTime || '08:00:00'}</span>
            </div>
          </div>

        </div>
      </header>

      {/* Connectivity Banner */}
      {connectionError && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2.5 text-center text-xs text-amber-400 flex items-center justify-center gap-2 font-sans select-none animate-pulse">
          <AlertTriangle className="w-4 h-4" />
          <span>{connectionError}</span>
        </div>
      )}

      {/* 2. Main Space Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT PART: Global form controller & navigation & system log (span-4) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Sub View navigation Tabs */}
            <div className="flex bg-zinc-900 border border-zinc-800 p-1 rounded-xl shadow-inner select-none">
              <button
                onClick={() => setActiveSubTab('matrix')}
                className={`flex-1 py-3 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-2 font-sans border ${
                  activeSubTab === 'matrix' 
                    ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/30 shadow-md shadow-emerald-500/5 font-extrabold' 
                    : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850/50 cursor-pointer'
                }`}
              >
                <Layers className={`w-4 h-4 ${activeSubTab === 'matrix' ? 'text-emerald-400 animate-pulse' : 'text-zinc-550'}`} />
                代理控制
              </button>
              <button
                onClick={() => setActiveSubTab('script')}
                className={`flex-1 py-3 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-2 font-sans border ${
                  activeSubTab === 'script' 
                    ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/30 shadow-md shadow-emerald-500/5 font-extrabold' 
                    : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850/50 cursor-pointer'
                }`}
              >
                <Terminal className={`w-4 h-4 ${activeSubTab === 'script' ? 'text-emerald-400 animate-pulse' : 'text-zinc-550'}`} />
                部署脚本
              </button>
              <button
                onClick={() => setActiveSubTab('list')}
                className={`flex-1 py-3 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-2 font-sans border ${
                  activeSubTab === 'list' 
                    ? 'bg-emerald-500/10 text-emerald-450 border-emerald-500/30 shadow-md shadow-emerald-500/5 font-extrabold' 
                    : 'bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850/50 cursor-pointer'
                }`}
              >
                <MonitorPlay className={`w-4 h-4 ${activeSubTab === 'list' ? 'text-emerald-400 animate-pulse' : 'text-zinc-550'}`} />
                批量导出
              </button>
            </div>

            {/* Physical Engine Selector */}
            <div id="physical-engine-selector" className="bg-zinc-900 border border-zinc-805 rounded-xl p-4 shadow-sm space-y-2">
              <label className="block text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5 font-sans select-none">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                底层物理引擎:
              </label>
              <div className="relative">
                <select
                  defaultValue="docker-warp-gost"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none appearance-none cursor-pointer font-sans"
                >
                  <option value="docker-warp-gost" className="bg-zinc-950 text-zinc-200 font-sans">
                    DOCKER-WARP-GOST 引擎 (当前在用)
                  </option>
                  <option value="cfip-light" disabled className="bg-zinc-950 text-zinc-500 font-sans">
                    XX轻量版 (占位暂未启用)
                  </option>
                </select>
                <div className="absolute right-3 top-2.5 text-zinc-500 pointer-events-none text-[9px] select-none">▼</div>
              </div>
            </div>

            {/* Server scheduler log terminal screen */}
            <div className="bg-zinc-900 border border-zinc-805 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-3 select-none">
                <h3 className="text-xs font-bold text-zinc-200 flex items-center gap-2 uppercase font-sans tracking-wide">
                  <Terminal className="text-emerald-500 w-4 h-4" />
                  容器运行监控日志 / System Terminal
                </h3>
                <span className="text-[9px] font-mono text-emerald-450 animate-pulse font-bold">● ACTIVE MONITOR</span>
              </div>

              <div ref={terminalRef} className="bg-zinc-950 border border-zinc-850 rounded-lg p-3 text-xs font-mono h-[280px] overflow-y-auto space-y-1.5 select-all scrollbar-thin">
                {logs.length === 0 ? (
                  <div className="text-zinc-655 italic py-16 text-center animate-pulse font-sans">正在等待 VPS 守护进程推送宿主连接日志流...</div>
                ) : (
                  logs.map((log) => {
                    let color = 'text-zinc-300';
                    if (log.level === 'success') color = 'text-emerald-400 font-semibold';
                    if (log.level === 'warn') color = 'text-amber-400';
                    if (log.level === 'error') color = 'text-rose-400 font-semibold';

                    return (
                      <div key={log.id} className="leading-relaxed break-words text-[11px] font-mono">
                        <span className="text-zinc-600 mr-1.5">[{log.timestamp}]</span>
                        <span className={color}>{log.message}</span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-zinc-800">
                <button
                  onClick={handleDownloadLogs}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-zinc-800 hover:bg-zinc-750 text-zinc-200 transition-colors border border-zinc-700/60 shadow-sm cursor-pointer"
                  title="下载服务器中完整、实时的排障探测日志文件"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  完整排账日志
                </button>
                <button
                  onClick={handleClearLogs}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-rose-400 transition-colors border border-zinc-800 cursor-pointer"
                  title="一键清空服务器的日志记录缓存并复位终端"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  清空日志记录
                </button>
              </div>
            </div>

          </div>

          {/* RIGHT PART: Tab view content (span-8) */}
          <div className="lg:col-span-8 space-y-6 animate-fade-in">
            {activeSubTab === 'matrix' && (
              <ProxyGrid
                proxies={proxies}
                onRefreshNode={handleRefreshNode}
                onDeleteNode={handleDeleteNode}
                onDeleteNodes={handleDeleteNodes}
                onOpenAddModal={() => setIsAddModalOpen(true)}
              />
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

      {/* 3. Footer */}
      <footer className="bg-zinc-950 border-t border-zinc-900 mt-12 py-6 px-6 text-center select-none">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between text-xs text-zinc-500 gap-4">
          <p>© 2026 Cloudflare Multi-IP Proxy Matrix Controller. VPS Cluster Private Console.</p>
          <div className="flex gap-4">
            <span className="flex items-center gap-1 text-[11px] font-mono text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Docker Gost Tunnel Hub: Online
            </span>
          </div>
        </div>
      </footer>

      {/* Modal Popup */}
      <AddIpModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddProxies}
        defaultStartPort={
          proxies.length > 0 
            ? Math.max(...proxies.map((p) => p.port)) + 1 
            : config.startPort
        }
        defaultUsername={config.proxyUser}
        defaultPassword={config.proxyPass}
        defaultAutoRebuild={config.autoRebuildThreshold}
        existingPorts={proxies.map(p => p.port)}
      />
    </div>
  );
}
