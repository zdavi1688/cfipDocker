import { useState } from 'react';
import { ProxyItem } from '../types';
import { Sparkles, RefreshCw, AlertTriangle, Globe } from 'lucide-react';

interface ProxyGridProps {
  proxies: ProxyItem[];
  onRefreshNode: (id: number) => void;
}

type FilterStatus = 'all' | 'pristine' | 'clean' | 'rebuilding';

export default function ProxyGrid({ proxies, onRefreshNode }: ProxyGridProps) {
  const [filterState, setFilterState] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = proxies.filter((p) => {
    const matchesSearch = 
      p.ip.includes(searchQuery) || 
      p.port.toString().includes(searchQuery) ||
      p.name.includes(searchQuery);

    if (!matchesSearch) return false;

    if (filterState === 'pristine') return p.status === 'active' && p.fraudScore <= 5;
    if (filterState === 'clean') return p.status === 'active' && p.fraudScore < 15;
    if (filterState === 'rebuilding') return p.status === 'rebuilding' || p.status === 'deploying';
    return true;
  });

  return (
    <div id="proxy-grid" className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4 mb-4">
        <div>
          <h2 className="text-lg font-medium text-zinc-100 flex items-center gap-2">
            <Globe className="w-5 h-5 text-emerald-500" />
            代理节点列表 / Proxy Node Matrix
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            显示当前 VPS 正在运行的 Multi-IP 实例状态（双击可强制重连获取新 IP）
          </p>
        </div>

        {/* Search & Filter */}
        <div className="flex items-center gap-2 max-w-md w-full sm:w-auto">
          <input
            type="text"
            placeholder="搜索 IP 或端口..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 font-mono rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none w-36 sm:w-44"
          />
          <div className="flex bg-zinc-950 rounded-lg p-0.5 border border-zinc-800">
            <button
              onClick={() => setFilterState('all')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                filterState === 'all' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400'
              }`}
            >
              全部 ({proxies.length})
            </button>
            <button
              onClick={() => setFilterState('pristine')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md flex items-center gap-1 ${
                filterState === 'pristine' ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-400'
              }`}
            >
              至臻 (≤5)
            </button>
            <button
              onClick={() => setFilterState('clean')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                filterState === 'clean' ? 'bg-amber-500/10 text-amber-400' : 'text-zinc-400'
              }`}
            >
              干净 (&lt;15)
            </button>
            <button
              onClick={() => setFilterState('rebuilding')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                filterState === 'rebuilding' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-400'
              }`}
            >
              重组中
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-xl bg-zinc-950">
          <AlertTriangle className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <p className="text-sm">没有找到匹配筛选条件的代理节点</p>
          <p className="text-xs text-zinc-600 mt-1">请重置搜索词或重新部署容器</p>
        </div>
      ) : (
        <div className="w-full">
          {/* 表格容器：无左右滚动，宽度完全自适应 */}
          <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/20 divide-y divide-zinc-900/60">
            
            {/* 1. 列表头部标题栏 (与每一行格列完全尺寸对齐) */}
            <div id="proxy-table-header" className="grid grid-cols-[45px_1fr_75px_110px_70px_75px_45px] gap-2 px-4 py-3 bg-zinc-950 text-xs font-bold text-zinc-400 select-none items-center border-b border-zinc-800/80">
              <div className="pl-1">序号</div>
              <div>IP</div>
              <div>端口</div>
              <div>国家/地区</div>
              <div>延迟</div>
              <div>欺诈分</div>
              <div className="text-right pr-2">更新</div>
            </div>

            {/* 2. 列表详细节点项 */}
            {filtered.map((item) => {
              const isPristine = item.status === 'active' && item.fraudScore <= 5;
              const isClean = item.status === 'active' && item.fraudScore < 15;
              const isRebuilding = item.status === 'rebuilding' || item.status === 'deploying';

              // 缩写 + 中文国家，去掉原英文长名字
              const getCountryText = (code: string, fullName: string) => {
                if (fullName === 'Connecting...' || fullName === 'Deploying...') {
                  return fullName;
                }
                const cnCountryNames: Record<string, string> = {
                  US: '美国',
                  JP: '日本',
                  SG: '新加坡',
                  HK: '香港',
                  DE: '德国',
                  GB: '英国',
                  FR: '法国',
                  CA: '加拿大',
                  AU: '澳大利亚',
                  KR: '韩国',
                  NL: '荷兰',
                  TW: '台湾',
                  CN: '中国',
                  RU: '俄罗斯',
                };

                let cnName = cnCountryNames[code.toUpperCase()];
                if (!cnName && fullName) {
                  const match = fullName.match(/[\u4e00-\u9fa5]+/);
                  if (match) {
                    cnName = match[0];
                  } else {
                    cnName = fullName;
                  }
                }
                return `${code.toUpperCase()}（${cnName || code}）`;
              };

              return (
                <div
                  key={item.id}
                  className={`px-4 py-2.5 transition-all grid grid-cols-[45px_1fr_75px_110px_70px_75px_45px] gap-2 items-center hover:bg-zinc-800/20 ${
                    isRebuilding 
                      ? 'bg-zinc-950/40 opacity-70 animate-pulse' 
                      : isPristine
                      ? 'bg-emerald-500/[0.015]'
                      : 'bg-transparent'
                  }`}
                >
                  {/* (1) 序号 */}
                  <div className="pl-1 flex items-center min-w-0">
                    <span className="text-xs font-mono font-bold text-zinc-300">#{item.id}</span>
                  </div>

                  {/* (2) IP */}
                  <div className="min-w-0 flex items-center gap-1.5 overflow-hidden">
                    {isRebuilding ? (
                      <span className="text-xs font-mono text-emerald-500 flex items-center gap-1.5 animate-pulse truncate">
                        <span className="w-1 h-1 rounded-full bg-emerald-500 animate-ping shrink-0"></span>
                        重连中...
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5 min-w-0 truncate">
                        <span className="text-zinc-200 font-mono font-medium text-xs sm:text-sm tracking-tight truncate select-all" title={item.ip}>
                          {item.ip}
                        </span>
                        <span className="text-[9px] font-semibold text-zinc-500 bg-zinc-900 border border-zinc-800 px-1 py-0.2 rounded uppercase shrink-0">
                          {item.ipVersion}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* (3) 端口 */}
                  <div className="flex items-center">
                    <span className="text-xs font-mono font-bold px-1.5 py-0.5 bg-zinc-950 text-emerald-400 border border-zinc-800 rounded">
                      {item.port}
                    </span>
                  </div>

                  {/* (4) 国家/地区 */}
                  <div className="min-w-0">
                    {isRebuilding ? (
                      <span className="text-xs text-zinc-650 italic">--</span>
                    ) : (
                      <span className="text-xs text-zinc-350 flex items-center gap-1 font-sans truncate" title={item.countryName}>
                        <span className="truncate">{getCountryText(item.countryCode, item.countryName)}</span>
                      </span>
                    )}
                  </div>

                  {/* (5) 延迟 */}
                  <div className="font-mono text-xs text-zinc-400 truncate">
                    {isRebuilding ? (
                      <span className="text-zinc-650 font-sans italic">--</span>
                    ) : (
                      <span>{item.latencyMs} ms</span>
                    )}
                  </div>

                  {/* (6) 欺诈分 */}
                  <div className="flex items-center">
                    {isRebuilding ? (
                      <span className="h-5 w-12 bg-zinc-900/40 animate-pulse rounded block"></span>
                    ) : (
                      <div
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-mono font-bold ${
                          isPristine
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : isClean
                            ? 'bg-amber-400/10 text-amber-500 border border-amber-500/15'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                        title={`欺诈评分/Fraud Score: ${item.fraudScore} (越低最净干净度越大)`}
                      >
                        {isPristine && <Sparkles className="w-2.5 h-2.5 text-emerald-400 fill-emerald-400 shrink-0" />}
                        {item.fraudScore}
                      </div>
                    )}
                  </div>

                  {/* (7) 更新 */}
                  <div className="text-right pr-2 shrink-0 flex justify-end">
                    <button
                      onClick={() => onRefreshNode(item.id)}
                      disabled={isRebuilding}
                      className="p-1 rounded hover:bg-zinc-805 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-30"
                      title="手动强制此节点热重启并换 IP 出口"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRebuilding ? 'animate-spin text-emerald-400' : ''}`} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
