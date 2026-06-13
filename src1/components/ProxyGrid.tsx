import { useState } from 'react';
import { ProxyItem } from '../types';
import { Sparkles, RefreshCw, AlertTriangle, Globe, Trash2, Plus } from 'lucide-react';

interface ProxyGridProps {
  proxies: ProxyItem[];
  onRefreshNode: (id: number) => void;
  onDeleteNode: (id: number) => void;
  onDeleteNodes: (ids: number[]) => void;
  onOpenAddModal: () => void;
}

const COUNTRY_MAP: Record<string, { flag: string; name: string }> = {
  AE: { flag: '🇦🇪', name: '阿联酋' },
  AR: { flag: '🇦🇷', name: '阿根廷' },
  AT: { flag: '🇦🇹', name: '奥地利' },
  AU: { flag: '🇦🇺', name: '澳大利亚' },
  BE: { flag: '🇧🇪', name: '比利时' },
  BR: { flag: '🇧🇷', name: '巴西' },
  CA: { flag: '🇨🇦', name: '加拿大' },
  CH: { flag: '🇨🇭', name: '瑞士' },
  CL: { flag: '🇨🇱', name: '智利' },
  CN: { flag: '🇨🇳', name: '中国' },
  CO: { flag: '🇨🇴', name: '哥伦比亚' },
  CZ: { flag: '🇨🇿', name: '捷克' },
  DE: { flag: '🇩🇪', name: '德国' },
  DK: { flag: '🇩🇰', name: '丹麦' },
  EG: { flag: '🇪🇬', name: '埃及' },
  ES: { flag: '🇪🇸', name: '西班牙' },
  FI: { flag: '🇫🇮', name: '芬兰' },
  FR: { flag: '🇫🇷', name: '法国' },
  GB: { flag: '🇬🇧', name: '英国' },
  GR: { flag: '🇬🇷', name: '希腊' },
  HK: { flag: '🇭🇰', name: '香港' },
  HR: { flag: '🇭🇷', name: '克罗地亚' },
  HU: { flag: '🇭🇺', name: '匈牙利' },
  ID: { flag: '🇮🇩', name: '印尼' },
  IE: { flag: '🇮🇪', name: '爱尔兰' },
  IL: { flag: '🇮🇱', name: '以色列' },
  IN: { flag: '🇮🇳', name: '印度' },
  IT: { flag: '🇮🇹', name: '意大利' },
  JP: { flag: '🇯🇵', name: '日本' },
  KR: { flag: '🇰🇷', name: '韩国' },
  MX: { flag: '🇲🇽', name: '墨西哥' },
  MY: { flag: '🇲🇾', name: '马来西亚' },
  NL: { flag: '🇳🇱', name: '荷兰' },
  NO: { flag: '🇳🇴', name: '挪威' },
  NZ: { flag: '🇳🇿', name: '新西兰' },
  PE: { flag: '🇵🇪', name: '秘鲁' },
  PH: { flag: '🇵🇭', name: '菲律宾' },
  PL: { flag: '🇵🇱', name: '波兰' },
  PT: { flag: '🇵🇹', name: '葡萄牙' },
  RO: { flag: '🇷🇴', name: '罗马尼亚' },
  RU: { flag: '🇷🇺', name: '俄罗斯' },
  SE: { flag: '🇸🇪', name: '瑞典' },
  SG: { flag: '🇸🇬', name: '新加坡' },
  TH: { flag: '🇹🇭', name: '泰国' },
  TR: { flag: '🇹🇷', name: '土耳其' },
  TW: { flag: '🇹🇼', name: '台湾' },
  UA: { flag: '🇺🇦', name: '乌克兰' },
  US: { flag: '🇺🇸', name: '美国' },
  VN: { flag: '🇻🇳', name: '越南' },
  ZA: { flag: '🇿🇦', name: '南非' }
};

export default function ProxyGrid({ proxies, onRefreshNode, onDeleteNode, onDeleteNodes, onOpenAddModal }: ProxyGridProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountryGroup, setSelectedCountryGroup] = useState<string>('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const uniqueCountries = Array.from(new Set(proxies.map((p) => p.countryCode?.toUpperCase()).filter(Boolean)));

  const filtered = proxies.filter((p) => {
    if (selectedCountryGroup !== 'ALL' && p.countryCode?.toUpperCase() !== selectedCountryGroup) {
      return false;
    }

    const matchesSearch = 
      p.ip.includes(searchQuery) || 
      p.port.toString().includes(searchQuery) ||
      p.name.includes(searchQuery);

    return matchesSearch;
  });

  return (
    <div id="proxy-grid" className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 shadow-sm space-y-4">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4 mb-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2 uppercase font-sans tracking-wide">
            <Globe className="w-4 h-4 text-emerald-500" />
            代理节点矩阵 / Proxy Node Matrix
          </h2>
        </div>

        <div className="flex items-center gap-2 max-w-md w-full sm:w-auto select-none">
          {selectedIds.size > 0 && (
            <button
              onClick={() => {
                if (window.confirm(`确定要批量注销回收选中的 ${selectedIds.size} 个 SOCKS5 个节点容器吗？`)) {
                  onDeleteNodes(Array.from(selectedIds));
                  setSelectedIds(new Set());
                }
              }}
              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 hover:border-rose-500/40 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 hover:-translate-y-0.5 font-sans whitespace-nowrap cursor-pointer"
              title="批量删除选中的所有节点"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              删除选中 ({selectedIds.size})
            </button>
          )}
          <input
            type="text"
            placeholder="搜索 IP 或端口..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-350 font-mono rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none w-36 sm:w-44"
          />
          <button
            onClick={onOpenAddModal}
            className="bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition-all shadow-md active:scale-95 hover:-translate-y-0.5 font-sans whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> 增加IP
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pb-2">
        <button
          onClick={() => setSelectedCountryGroup('ALL')}
          className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-all ${
            selectedCountryGroup === 'ALL'
              ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold'
              : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-750 cursor-pointer'
          }`}
        >
          全部 ({proxies.length})
        </button>
        {uniqueCountries.map((code) => {
          const count = proxies.filter((p) => p.countryCode?.toUpperCase() === code).length;
          const meta = COUNTRY_MAP[code] || { flag: '🌐', name: code };
          return (
            <button
              key={code}
              onClick={() => setSelectedCountryGroup(code)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md border flex items-center gap-1 transition-all ${
                selectedCountryGroup === code
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-750 cursor-pointer'
              }`}
            >
              <span>{meta.flag}</span>
              <span>{meta.name}</span>
              <span className="text-[10px] opacity-70 font-mono">({count})</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-500 border border-dashed border-zinc-800 rounded-xl bg-zinc-950 select-none">
          <AlertTriangle className="w-8 h-8 text-zinc-650 mx-auto mb-3" />
          <p className="text-xs font-bold text-zinc-400">尚未分配到对应国家的连接节点，或者过滤干净度中</p>
          <p className="text-[10px] text-zinc-600 mt-1">您可以点击“增加IP”来重新进行多路高速代理部署</p>
        </div>
      ) : (
        <div className="w-full overflow-hidden">
          <div className="border border-zinc-800 rounded-xl overflow-x-auto bg-zinc-950/20 divide-y divide-zinc-900/60 scrollbar-thin">
            
            <div id="proxy-table-header" className="grid grid-cols-[30px_45px_1fr_75px_110px_70px_75px_80px] min-w-[650px] gap-2 px-4 py-3 bg-zinc-950 text-[11px] font-bold text-zinc-400 select-none items-center border-b border-zinc-800/80">
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))}
                  onChange={(e) => {
                    const newSelected = new Set(selectedIds);
                    if (e.target.checked) {
                      filtered.forEach(p => newSelected.add(p.id));
                    } else {
                      filtered.forEach(p => newSelected.delete(p.id));
                    }
                    setSelectedIds(newSelected);
                  }}
                  className="rounded bg-zinc-900 border-zinc-750 text-emerald-500 focus:ring-emerald-500/20 w-3.5 h-3.5 cursor-pointer accent-emerald-500"
                />
              </div>
              <div className="pl-1">序号</div>
              <div>IP出口地址</div>
              <div>端口</div>
              <div>出口归属</div>
              <div>探测延迟</div>
              <div>干净度评分</div>
              <div className="text-right pr-2">操作控制</div>
            </div>

            {filtered.map((item) => {
              const isPristine = item.status === 'active' && item.fraudScore <= 5;
              const isClean = item.status === 'active' && item.fraudScore < 15;
              const isRebuilding = item.status === 'rebuilding' || item.status === 'deploying';

              const getCountryText = (code: string, fullName: string) => {
                if (fullName === 'Connecting...' || fullName === 'Deploying...') {
                  return fullName;
                }
                const cnCountryNames: Record<string, string> = {
                  US: '美国', JP: '日本', SG: '新加坡', HK: '香港', DE: '德国',
                  GB: '英国', FR: '法国', CA: '加拿大', AU: '澳大利亚', KR: '韩国',
                  NL: '荷兰', TW: '台湾', CN: '中国', RU: '俄罗斯'
                };

                let cnName = cnCountryNames[code.toUpperCase()];
                if (!cnName && fullName) {
                  const match = fullName.match(/[\u4e00-\u9fa5]+/);
                  cnName = match ? match[0] : fullName;
                }
                return `${code.toUpperCase()}（${cnName || code}）`;
              };

              const isSelected = selectedIds.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`px-4 py-3 transition-all min-w-[650px] grid grid-cols-[30px_45px_1fr_75px_110px_70px_75px_80px] gap-2 items-center hover:bg-zinc-800/10 ${
                    isSelected
                      ? 'bg-emerald-500/10'
                      : isRebuilding 
                      ? 'bg-zinc-950/40 opacity-70 animate-pulse' 
                      : isPristine
                      ? 'bg-emerald-500/[0.01]'
                      : 'bg-transparent'
                  }`}
                >
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        const newSelected = new Set(selectedIds);
                        if (isSelected) {
                          newSelected.delete(item.id);
                        } else {
                          newSelected.add(item.id);
                        }
                        setSelectedIds(newSelected);
                      }}
                      className="rounded bg-zinc-900 border-zinc-750 text-emerald-500 focus:ring-emerald-500/20 w-3.5 h-3.5 cursor-pointer accent-emerald-500"
                    />
                  </div>

                  <div className="pl-1 flex items-center min-w-0 font-mono">
                    <span className="text-xs font-bold text-zinc-400">#{item.id}</span>
                  </div>

                  <div className="min-w-0 flex items-center gap-1.5 overflow-hidden font-mono">
                    {isRebuilding ? (
                      <span className="text-xs text-emerald-400 flex items-center gap-1.5 animate-pulse truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0"></span>
                        重连指派中...
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5 min-w-0 truncate select-all">
                        <span className="text-zinc-100 font-bold text-xs sm:text-sm tracking-tight truncate" title={item.ip}>
                          {item.ip}
                        </span>
                        <span className="text-[9px] font-bold text-zinc-500 bg-zinc-900 border border-zinc-800 px-1 py-0.2 rounded uppercase shrink-0">
                          {item.ipVersion}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center font-mono">
                    <span className="text-xs font-bold px-1.5 py-0.5 bg-zinc-950 text-emerald-400 border border-zinc-800 rounded">
                      {item.port}
                    </span>
                  </div>

                  <div className="min-w-0 font-sans">
                    {isRebuilding ? (
                      <span className="text-xs text-zinc-600 italic">--</span>
                    ) : (
                      <span className="text-xs text-zinc-355 flex items-center gap-1 truncate" title={item.countryName}>
                        <span className="truncate">{getCountryText(item.countryCode, item.countryName)}</span>
                      </span>
                    )}
                  </div>

                  <div className="font-mono text-xs text-zinc-400 truncate">
                    {isRebuilding ? (
                      <span className="text-zinc-600 font-sans italic">--</span>
                    ) : (
                      <span>{item.latencyMs} ms</span>
                    )}
                  </div>

                  <div className="flex items-center font-mono">
                    {isRebuilding ? (
                      <span className="h-5 w-12 bg-zinc-900/40 animate-pulse rounded block"></span>
                    ) : (
                      <div
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-xs font-bold ${
                          isPristine
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : isClean
                            ? 'bg-amber-400/10 text-amber-500 border border-amber-500/15'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                        title={`欺诈评分: ${item.fraudScore}`}
                      >
                        {isPristine && <Sparkles className="w-2.5 h-2.5 text-emerald-450 fill-emerald-400 shrink-0" />}
                        {item.fraudScore}
                      </div>
                    )}
                  </div>

                  <div className="text-right pr-1 shrink-0 flex justify-end gap-1.5">
                    <button
                      onClick={() => onRefreshNode(item.id)}
                      disabled={isRebuilding}
                      className="p-1 rounded hover:bg-zinc-850 text-zinc-400 hover:text-emerald-400 transition-colors disabled:opacity-30 cursor-pointer"
                      title="手动强制此节点重连指派新出口 IP"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRebuilding ? 'animate-spin text-emerald-500' : ''}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteNode(item.id)}
                      className="p-1 rounded hover:bg-rose-500/10 text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
                      title="注销对应容器并回收"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
