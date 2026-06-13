export interface ProxyConfig {
  ipCount: number;
  ipVersion: 'v4' | 'v6' | 'both';
  maxFraudScore: number; // e.g. 15
  startPort: number; // e.g. 10001
  proxyUser: string;
  proxyPass: string;
  autoRebuildThreshold: boolean;
}

export interface ProxyItem {
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

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}
