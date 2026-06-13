import { useState } from 'react';
import { ProxyConfig } from '../types';
import { Settings, ShieldCheck, HelpCircle, Network, Key, RefreshCw } from 'lucide-react';

interface ProxyConfigFormProps {
  config: ProxyConfig;
  onChange: (config: ProxyConfig) => void;
  onDeploy: () => void;
  isDeploying: boolean;
}

export default function ProxyConfigForm({
  config,
  onChange,
  onDeploy,
  isDeploying
}: ProxyConfigFormProps) {
  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  const handleChange = (key: keyof ProxyConfig, value: any) => {
    onChange({
      ...config,
      [key]: value
    });
  };

  const generateRandomPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pass = '';
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    handleChange('proxyPass', pass);
  };

  return (
    <div id="proxy-config-form" className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-6 border-b border-zinc-800 pb-4">
        <Settings className="w-5 h-5 text-emerald-500" />
        <h2 className="text-lg font-medium text-zinc-100">核心配置中心 / Core Settings</h2>
      </div>

      <div className="space-y-5">
        {/* IP Count */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-1">
              IP 代理节点数量 (N)
              <button
                type="button"
                onClick={() => setShowTooltip(showTooltip === 'ipCount' ? null : 'ipCount')}
                className="text-zinc-500 hover:text-zinc-300 focus:outline-none"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </label>
            <span className="text-xs text-emerald-500 font-mono font-medium">10,001 - {10000 + config.ipCount} 端口范围</span>
          </div>
          
          {showTooltip === 'ipCount' && (
            <div className="mb-2 p-2.5 bg-zinc-850 border border-zinc-800 rounded text-xs text-zinc-400">
              设置希望并行运行的 WARP 容器与独立代理端口的总数量。每个节点拥有专属的外网 IP。
            </div>
          )}

          <div className="grid grid-cols-4 gap-2">
            {[5, 10, 20, 50].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleChange('ipCount', num)}
                className={`py-2 text-sm font-mono rounded-lg border transition-all ${
                  config.ipCount === num
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-semibold'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-250'
                }`}
              >
                {num} 个 IP
              </button>
            ))}
            <div className="col-span-4 mt-2">
              <input
                type="number"
                min="1"
                max="200"
                value={config.ipCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  handleChange('ipCount', Math.max(1, Math.min(200, val)));
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono text-zinc-100 focus:border-emerald-500 focus:outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                placeholder="自定义 IP 数量 (最大 200)"
              />
            </div>
          </div>
        </div>

        {/* IP Version Selection */}
        <div>
          <label className="text-sm font-medium text-zinc-300 flex items-center gap-1.5 mb-2">
            <Network className="w-4 h-4 text-zinc-400" />
            出口网络协议选择 (IP Family)
          </label>
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: 'v4', label: '仅限 IPv4', desc: 'IPv4 Only' },
              { id: 'v6', label: '仅限 IPv6', desc: 'IPv6 Only' },
              { id: 'both', label: 'IPV4 / IPv6 并存', desc: 'No Filter' }
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleChange('ipVersion', opt.id)}
                className={`p-2.5 rounded-lg border flex flex-col items-center justify-center text-center transition-all ${
                  config.ipVersion === opt.id
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-250'
                }`}
              >
                <span className="text-xs font-semibold">{opt.label}</span>
                <span className="text-[10px] text-zinc-500 font-mono">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* IP Cleanliness Filtering Rate */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-zinc-400" />
              IP 干净度过滤阈值 (Max Fraud Score)
            </label>
            <span className="text-xs font-mono font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
              Score &lt; {config.maxFraudScore}
            </span>
          </div>
          <div className="space-y-2 bg-zinc-950 p-3 rounded-lg border border-zinc-850">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
              <span>0 (绝对洁净)</span>
              <span>15 (常规标准)</span>
              <span>50 (极宽松)</span>
            </div>
            <input
              type="range"
              min="2"
              max="50"
              value={config.maxFraudScore}
              onChange={(e) => handleChange('maxFraudScore', parseInt(e.target.value))}
              className="w-full accent-emerald-500 bg-zinc-800 rounded-lg appearance-none h-1.5 cursor-pointer"
            />
            <div className="text-xs text-zinc-400 mt-1 flex items-start gap-1">
              <span className="text-emerald-500 font-semibold">★ 提示：</span>
              <span>自动循环重新建立连接直至 IP 分数低于 {config.maxFraudScore}。系统将设定 {config.maxFraudScore <= 5 ? '5 以内的极净 IP 优先模式' : '常规洁净模式'}。</span>
            </div>
          </div>
        </div>

        {/* Credentials */}
        <div className="space-y-4 pt-2 border-t border-zinc-850">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">SOCKS5 代理账号</label>
              <input
                type="text"
                value={config.proxyUser}
                onChange={(e) => handleChange('proxyUser', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono text-zinc-100 focus:border-emerald-500 focus:outline-none"
                placeholder="cfuser"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1 flex items-center justify-between">
                SOCKS5 校验密码
                <button
                  type="button"
                  onClick={generateRandomPassword}
                  className="text-zinc-500 hover:text-emerald-400 transition-colors flex items-center gap-0.5 text-[10px]"
                  title="生成随机密码"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> 随机
                </button>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={config.proxyPass}
                  onChange={(e) => handleChange('proxyPass', e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-3 pr-8 py-2 text-sm font-mono text-zinc-100 focus:border-emerald-500 focus:outline-none"
                  placeholder="请输入密码"
                />
                <Key className="absolute right-2.5 top-2.5 w-4 h-4 text-zinc-600" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">代理起始对外端口</label>
              <input
                type="number"
                value={config.startPort}
                onChange={(e) => handleChange('startPort', parseInt(e.target.value) || 10001)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm font-mono text-zinc-100 focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="flex items-end">
              <label className="w-full flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 cursor-pointer hover:border-zinc-700 transition-colors select-none">
                <input
                  type="checkbox"
                  checked={config.autoRebuildThreshold}
                  onChange={(e) => handleChange('autoRebuildThreshold', e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-500 bg-zinc-800 border-zinc-700 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-xs text-zinc-400 font-medium">IP 过期/变差时自动重连</span>
              </label>
            </div>
          </div>
        </div>

        {/* Deploy & Apply Actions */}
        <button
          type="button"
          onClick={onDeploy}
          disabled={isDeploying}
          className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 ${
            isDeploying
              ? 'bg-zinc-850 text-zinc-500 border border-zinc-800 cursor-not-allowed'
              : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 hover:shadow-emerald-500/10 cursor-pointer hover:-translate-y-0.5 active:translate-y-0'
          }`}
        >
          {isDeploying ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              正在同步参数并重新扫描中...
            </>
          ) : (
            '立即应用于当前容器群组 / Deploy Node Group'
          )}
        </button>
      </div>
    </div>
  );
}
