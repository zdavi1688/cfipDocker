import React, { useState, useEffect } from 'react';
import { X, Globe, Cpu, ShieldAlert, Key, Hash, RefreshCw } from 'lucide-react';

interface AddIpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (data: {
    country: string;
    quantity: number;
    ipVersion: 'v4' | 'v6' | 'both';
    username: string;
    password: string;
    startPort: number;
    maxFraudScore: number;
    autoRebuild: boolean;
  }) => void;
  defaultStartPort: number;
  defaultUsername?: string;
  defaultPassword?: string;
  defaultAutoRebuild?: boolean;
  existingPorts?: number[];
}

const COUNTRIES = [
  { code: 'ALL', name: '自动分配/不限制 (Any Country)', flag: '🌐' },
  { code: 'US', name: '美国 (United States)', flag: '🇺🇸' },
  { code: 'JP', name: '日本 (Japan)', flag: '🇯🇵' },
  { code: 'SG', name: '新加坡 (Singapore)', flag: '🇸🇬' },
  { code: 'HK', name: '香港 (Hong Kong)', flag: '🇭🇰' },
  { code: 'DE', name: '德国 (Germany)', flag: '🇩🇪' },
  { code: 'GB', name: '英国 (United Kingdom)', flag: '🇬🇧' },
  { code: 'FR', name: '法国 (France)', flag: '🇫🇷' },
  { code: 'CA', name: '加拿大 (Canada)', flag: '🇨🇦' },
  { code: 'AU', name: '澳大利亚 (Australia)', flag: '🇦🇺' },
  { code: 'KR', name: '韩国 (South Korea)', flag: '🇰🇷' },
  { code: 'NL', name: '荷兰 (Netherlands)', flag: '🇳🇱' },
  { code: 'TW', name: '台湾 (Taiwan)', flag: '🇹🇼' }
];

export default function AddIpModal({
  isOpen,
  onClose,
  onAdd,
  defaultStartPort,
  defaultUsername,
  defaultPassword,
  defaultAutoRebuild = true,
  existingPorts = []
}: AddIpModalProps) {
  const [country, setCountry] = useState(() => {
    try {
      return localStorage.getItem('last_country') || 'ALL';
    } catch {
      return 'ALL';
    }
  });
  
  const [quantity, setQuantity] = useState(() => {
    try {
      const v = localStorage.getItem('last_quantity');
      return v ? parseInt(v, 10) : 5;
    } catch {
      return 5;
    }
  });
  
  const [ipVersion, setIpVersion] = useState<'v4' | 'v6' | 'both'>(() => {
    try {
      return (localStorage.getItem('last_ipVersion') as any) || 'v4';
    } catch {
      return 'v4';
    }
  });
  
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem('last_username') || defaultUsername || 'cfuser';
    } catch {
      return defaultUsername || 'cfuser';
    }
  });
  
  const [password, setPassword] = useState('');
  
  const [startPort, setStartPort] = useState(() => {
    try {
      const v = localStorage.getItem('last_startPort');
      return v ? parseInt(v, 10) : defaultStartPort;
    } catch {
      return defaultStartPort;
    }
  });
  
  const [maxFraudScore, setMaxFraudScore] = useState(() => {
    try {
      const v = localStorage.getItem('last_maxFraudScore');
      return v ? parseInt(v, 10) : 8; // Default changed from 15 to 8
    } catch {
      return 8;
    }
  });
  
  const [autoRebuild, setAutoRebuild] = useState(() => {
    try {
      const v = localStorage.getItem('last_autoRebuild');
      return v !== 'false';
    } catch {
      return defaultAutoRebuild;
    }
  });
  
  const [isRandomPassword, setIsRandomPassword] = useState(true);

  // Helper function to generate an 12-char pristine secure password
  const generateSecurePassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let pass = '';
    for (let i = 0; i < 12; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pass;
  };

  useEffect(() => {
    if (isOpen) {
      // Sync defaults if nothing saved in localStorage yet
      try {
        if (!localStorage.getItem('last_startPort')) {
          setStartPort(defaultStartPort);
        }
        if (!localStorage.getItem('last_username') && defaultUsername) {
          setUsername(defaultUsername);
        }
      } catch {}

      if (isRandomPassword) {
        setPassword(generateSecurePassword());
      } else {
        try {
          setPassword(localStorage.getItem('last_password') || defaultPassword || 'cfpass123');
        } catch {
          setPassword(defaultPassword || 'cfpass123');
        }
      }
    }
  }, [isOpen, defaultStartPort, defaultUsername, defaultPassword, defaultAutoRebuild]);

  // Handle checking/unchecking random password
  const handleRandomToggle = (checked: boolean) => {
    setIsRandomPassword(checked);
    if (checked) {
      setPassword(generateSecurePassword());
    } else {
      try {
        setPassword(localStorage.getItem('last_password') || defaultPassword || '');
      } catch {
        setPassword(defaultPassword || '');
      }
    }
  };

  if (!isOpen) return null;

  // Port collision calculations
  const proposedPorts: number[] = [];
  for (let i = 0; i < quantity; i++) {
    proposedPorts.push(startPort + i);
  }
  const collidingPorts = proposedPorts.filter(p => existingPorts.includes(p));
  const hasCollision = collidingPorts.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (hasCollision) return;

    // Save values to localStorage for persistence
    try {
      localStorage.setItem('last_country', country);
      localStorage.setItem('last_quantity', quantity.toString());
      localStorage.setItem('last_ipVersion', ipVersion);
      localStorage.setItem('last_username', username);
      localStorage.setItem('last_startPort', startPort.toString());
      localStorage.setItem('last_maxFraudScore', maxFraudScore.toString());
      localStorage.setItem('last_autoRebuild', autoRebuild.toString());
      if (!isRandomPassword) {
        localStorage.setItem('last_password', password);
      }
    } catch {}

    onAdd({
      country,
      quantity,
      ipVersion,
      username,
      password: password || 'cfpass123',
      startPort,
      maxFraudScore,
      autoRebuild
    });
    onClose();
  };

  const endPort = startPort + quantity - 1;

  return (
    <div id="add-ip-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-zinc-900 border border-zinc-805 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden transform transition-all animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/45">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/25">
              <Globe className="w-4 h-4 text-emerald-400" />
            </div>
            <h3 className="text-sm font-bold text-zinc-100 font-sans">部署增加新代理容器出口 / Add Proxy Matrix</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Region */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5 font-sans">
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              容器 IP 出口国家 (Warp 自动路由)
            </label>
            <div className="relative">
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-250 focus:border-emerald-500 focus:outline-none appearance-none cursor-pointer font-sans"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code} className="bg-zinc-950 text-zinc-300">
                    {c.flag} {c.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-2.5 text-zinc-500 pointer-events-none text-[9px]">▼</div>
            </div>
          </div>

          {/* Quantity & Protocol */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5 font-sans">
                <Hash className="w-3.5 h-3.5 text-emerald-400" />
                容器数量
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 focus:border-emerald-500 focus:outline-none transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5 font-sans">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                IP 出口协议
              </label>
              <div className="relative">
                <select
                  value={ipVersion}
                  onChange={(e) => setIpVersion(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none appearance-none cursor-pointer"
                >
                  <option value="v4" className="bg-zinc-950 font-sans">IPV4 优先 (Warp4)</option>
                  <option value="v6" className="bg-zinc-950 font-sans">IPV6 优先 (Warp6)</option>
                  <option value="both" className="bg-zinc-950 font-sans">IPV4/IPV6 混合双栈</option>
                </select>
                <div className="absolute right-3 top-2 text-zinc-500 pointer-events-none text-[9px]">▼</div>
              </div>
            </div>
          </div>

          {/* Account credentials */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5 font-sans">
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                连接账号
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 focus:border-emerald-500 focus:outline-none"
                placeholder="cfuser"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5 font-sans">
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  连接密码
                </label>
                <label className="flex items-center gap-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isRandomPassword}
                    onChange={(e) => handleRandomToggle(e.target.checked)}
                    className="w-3 h-3 rounded accent-emerald-500 bg-zinc-950 border-zinc-800"
                  />
                  <span className="text-[10px] text-emerald-400 font-bold">随机密码</span>
                </label>
              </div>
              <input
                type="text"
                value={password}
                disabled={isRandomPassword}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 focus:border-emerald-500 focus:outline-none disabled:bg-zinc-900 disabled:text-zinc-500 disabled:border-zinc-850"
                placeholder={isRandomPassword ? "已自动生成高安全随机密码" : "请输入自定义密码"}
                required
              />
            </div>
          </div>

          {/* Port & Cleanliness */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5 flex items-center gap-1 font-sans">
                <Hash className="w-3.5 h-3.5 text-emerald-400" />
                起始段端口 ({startPort}-{endPort})
              </label>
              <input
                type="number"
                value={startPort}
                onChange={(e) => setStartPort(parseInt(e.target.value) || 10001)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 focus:border-emerald-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5 flex items-center gap-1 font-sans">
                <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
                欺诈阻断最高过滤分值 (&le; {maxFraudScore})
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={maxFraudScore}
                onChange={(e) => setMaxFraudScore(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 focus:border-emerald-500 focus:outline-none"
                placeholder="15"
                required
              />
            </div>
          </div>

          {/* Requirement 5 option: IP expired or degraded auto reconnection */}
          <div className="pt-2">
            <label className="w-full flex items-center gap-2 bg-zinc-950 border border-zinc-805 rounded-xl p-3 cursor-pointer hover:border-zinc-750 transition-colors select-none">
              <input
                type="checkbox"
                checked={autoRebuild}
                onChange={(e) => setAutoRebuild(e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-500 bg-zinc-900 border-zinc-800 focus:ring-0 focus:ring-offset-0 shrink-0"
              />
              <div className="font-sans">
                <div className="text-xs font-bold text-zinc-200">激活：“IP过期 / 变差时自动重连”守护引擎</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">当代理出口 IP 断网、受到污染或评级分劣化时，自动静默重拨极速重获洁净 IP 节点通道（系统每 30-60 分钟自动进行随机分流审计巡检，预防并发检测被限流）。</div>
              </div>
            </label>
          </div>

          {/* Port collision visual warning */}
          {hasCollision && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-sans space-y-1">
              <div className="font-bold flex items-center gap-1">
                <span>⚠️ 端口冲突冲突阻止 / Port Congestion Alert</span>
              </div>
              <div>下列端口已被当前运行中的代理容器占用：</div>
              <div className="font-mono text-[11px] font-bold bg-zinc-950 px-2 py-1 rounded border border-rose-950/40 text-rose-300 tracking-wide select-all">
                {collidingPorts.join(', ')}
              </div>
              <div className="text-[10px] text-zinc-500">请将起始段端口调高，以保证容器网络能成功映射！</div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-zinc-850 text-zinc-300 hover:bg-zinc-800 border border-zinc-800 transition-all font-sans cursor-pointer"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={hasCollision}
              className={`px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-md active:scale-95 font-sans cursor-pointer ${
                hasCollision 
                  ? 'bg-zinc-800 text-zinc-500 border border-zinc-750 cursor-not-allowed shadow-none'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-emerald-500/5'
              }`}
            >
              创建并重置容器
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
