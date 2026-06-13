import { ProxyItem } from '../types';
import { Activity, ShieldAlert, Zap, Globe, Sparkles } from 'lucide-react';

interface ProxyDashboardProps {
  proxies: ProxyItem[];
}

export default function ProxyDashboard({ proxies }: ProxyDashboardProps) {
  const total = proxies.length;
  const active = proxies.filter(p => p.status === 'active').length;
  const deploying = proxies.filter(p => p.status === 'deploying' || p.status === 'rebuilding').length;
  
  // Clean IPs: Score < 15
  const cleanCount = proxies.filter(p => p.status === 'active' && p.fraudScore < 15).length;
  // Pristine IPs: Score <= 5
  const pristineCount = proxies.filter(p => p.status === 'active' && p.fraudScore <= 5).length;
  
  const avgLatency = active > 0 
    ? Math.round(proxies.filter(p => p.status === 'active').reduce((sum, p) => sum + p.latencyMs, 0) / active)
    : 0;
    
  const avgScore = active > 0
    ? parseFloat((proxies.filter(p => p.status === 'active').reduce((sum, p) => sum + p.fraudScore, 0) / active).toFixed(1))
    : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {/* 1. Total Nodes */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400 font-medium">代理节点总数</span>
          <Globe className="w-4 h-4 text-zinc-500" />
        </div>
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-zinc-100">{total}</span>
          <span className="text-xs text-zinc-500">个实例</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>运行中: {active} | 调整中: {deploying}</span>
        </div>
      </div>

      {/* 2. Pristine Level (<5) */}
      <div className="bg-zinc-900 border border-emerald-900/40 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl pointer-events-none"></div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400 font-medium">至臻极净级 (≤5)</span>
          <Sparkles className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-emerald-400">{pristineCount}</span>
          <span className="text-xs text-emerald-500/80">
            {total > 0 ? `${Math.round((pristineCount / total) * 100)}%` : '0%'}
          </span>
        </div>
        <div className="mt-1 text-[10px] text-emerald-500/80 font-medium flex items-center gap-1">
          <span>★ 黄金养号优先配置级</span>
        </div>
      </div>

      {/* 3. Clean Level (<15) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400 font-medium">常规优质级 (&lt;15)</span>
          <Zap className="w-4 h-4 text-amber-500" />
        </div>
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-amber-400">{cleanCount}</span>
          <span className="text-xs text-zinc-500">
            {total > 0 ? `${Math.round((cleanCount / total) * 100)}%` : '0%'}
          </span>
        </div>
        <div className="mt-1 text-[10px] text-zinc-500">
          <span>符合各大指纹浏览器风控要求</span>
        </div>
      </div>

      {/* 4. Avg Fraud Score */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400 font-medium">平均欺诈评分</span>
          <ShieldAlert className="w-4 h-4 text-zinc-500" />
        </div>
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-zinc-100">{avgScore}</span>
          <span className="text-xs text-zinc-500">/ 100</span>
        </div>
        <div className="mt-1 text-[10px] text-zinc-500">
          <span>低于 15 属于高干净度范畴</span>
        </div>
      </div>

      {/* 5. Latency */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400 font-medium">测试平均延迟</span>
          <Activity className="w-4 h-4 text-zinc-500" />
        </div>
        <div className="mt-2.5 flex items-baseline gap-2">
          <span className="text-2xl font-bold font-mono text-emerald-400">{avgLatency}</span>
          <span className="text-xs text-zinc-500">ms</span>
        </div>
        <div className="mt-1 text-[10px] text-zinc-500">
          <span>基于到 Cloudflare 主网实测</span>
        </div>
      </div>
    </div>
  );
}
