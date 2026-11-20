import { useState } from 'react';
import { Check, Copy, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import type { HealthResponse, MarketSnapshot, Timeframe } from '../types/market.ts';
import { buildApiUrl, getApiBaseUrl } from '../lib/api.ts';

interface ConnectionSettingsProps {
  snapshot: MarketSnapshot | null;
  connectionStatus: 'CONNECTED' | 'STALE' | 'DISCONNECTED';
  health: HealthResponse | null;
  lastCandleTime: number | null;
  activeTimeframe: Timeframe;
  onRefresh: () => void;
}

export function ConnectionSettings({
  snapshot,
  connectionStatus,
  health,
  lastCandleTime,
  activeTimeframe,
  onRefresh,
}: ConnectionSettingsProps) {
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  const apiBase = getApiBaseUrl();
  const endpointUrl =
    typeof window !== 'undefined'
      ? `${apiBase || window.location.origin}/api/bridge/mt5`
      : buildApiUrl('/api/bridge/mt5');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(endpointUrl);
      setCopiedEndpoint(true);
      window.setTimeout(() => setCopiedEndpoint(false), 2000);
    } catch {
      // Clipboard blocked in restricted iframe
    }
  };

  return (
    <section
      aria-label="Connection Settings and MT5 Bridge"
      className="grid grid-cols-1 gap-6 lg:grid-cols-12"
    >
      {/* Left: Live Telemetry & Security Guarantee */}
      <div className="lg:col-span-6 rounded-xl border border-[#232834] bg-[#12151B] p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-[#F3F4F6]">
            MT5 Bridge Connection Status
          </h2>
          <button
            type="button"
            onClick={onRefresh}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-[#232834] bg-[#171B22] px-3 text-xs font-medium text-[#D1D5DB] hover:border-[#333A4B] hover:text-white whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Check Health</span>
          </button>
        </div>

        <dl className="mt-4 divide-y divide-[#1D222D]">
          <div className="flex justify-between py-2.5 text-xs">
            <dt className="text-[#9CA3AF]">MT5 Connection Status</dt>
            <dd
              className={`font-mono font-semibold ${
                connectionStatus === 'CONNECTED'
                  ? 'text-emerald-400'
                  : connectionStatus === 'STALE'
                    ? 'text-amber-400'
                    : 'text-rose-400'
              }`}
            >
              {connectionStatus}
            </dd>
          </div>

          <div className="flex justify-between py-2.5 text-xs">
            <dt className="text-[#9CA3AF]">Last Received Update</dt>
            <dd className="font-mono text-[#F3F4F6] tabular-nums">
              {snapshot
                ? new Date(snapshot.receivedAt).toLocaleString()
                : 'No packet received yet'}
            </dd>
          </div>

          <div className="flex justify-between py-2.5 text-xs">
            <dt className="text-[#9CA3AF]">Last Candle Time ({activeTimeframe})</dt>
            <dd className="font-mono text-[#F3F4F6] tabular-nums">
              {lastCandleTime
                ? new Date(lastCandleTime * 1000).toLocaleString()
                : 'Waiting for candles'}
            </dd>
          </div>

          <div className="flex justify-between py-2.5 text-xs">
            <dt className="text-[#9CA3AF]">Broker Symbol</dt>
            <dd className="font-mono text-[#F3F4F6]">
              {snapshot ? `${snapshot.symbol} (${snapshot.broker})` : 'GOLD (XM)'}
            </dd>
          </div>

          <div className="flex justify-between py-2.5 text-xs">
            <dt className="text-[#9CA3AF]">Backend API Health</dt>
            <dd className="font-mono text-[#F3F4F6]">
              {health ? `${health.ok ? 'Healthy' : 'Degraded'} · ${health.service}` : 'Checking...'}
            </dd>
          </div>

          <div className="flex justify-between py-2.5 text-xs">
            <dt className="text-[#9CA3AF]">Storage Mode</dt>
            <dd className="font-mono text-[#D1D5DB]">{health?.storageMode ?? '--'}</dd>
          </div>

          <div className="flex justify-between py-2.5 text-xs">
            <dt className="text-[#9CA3AF]">API Target</dt>
            <dd className="font-mono text-[#D1D5DB] truncate max-w-[240px]">
              {apiBase || 'Same-origin (/api/*)'}
            </dd>
          </div>

          <div className="flex justify-between py-2.5 text-xs">
            <dt className="text-[#9CA3AF]">Bridge Token Secret</dt>
            <dd className="font-mono text-[#D1D5DB]">
              {health
                ? health.bridgeAuthConfigured
                  ? 'Configured server-side (XM_BRIDGE_TOKEN)'
                  : 'Not yet configured on server'
                : '--'}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3.5 text-xs text-[#D1D5DB]">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" aria-hidden="true" />
          <div className="leading-relaxed">
            <strong className="text-[#F3F4F6]">Read-Only Architecture:</strong> SA AI TRADER never asks for your XM trading password or investor password, never stores credentials in browser code, and never places or modifies trades.
          </div>
        </div>
      </div>

      {/* Right: MT5 EA Bridge Endpoint & Setup Guide */}
      <div className="lg:col-span-6 rounded-xl border border-[#232834] bg-[#12151B] p-4 sm:p-6">
        <h2 className="font-display text-base font-semibold text-[#F3F4F6]">
          XM MetaTrader 5 Expert Advisor Setup
        </h2>
        <p className="mt-1 text-xs text-[#9CA3AF] leading-relaxed">
          Attach <span className="font-mono text-[#F3F4F6]">SA_AI_TRADER_BRIDGE.mq5</span> to a GOLD chart inside XM MT5 Desktop. The EA reads live quotes and OHLC bars every 3–5 seconds and posts them securely via HTTPS.
        </p>

        <div className="mt-4">
          <div className="text-xs font-medium text-[#D1D5DB]">Bridge Ingest Endpoint (POST)</div>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg border border-[#232834] bg-[#0B0D10] px-3 py-2.5 font-mono text-xs text-amber-300">
              {endpointUrl}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy endpoint URL"
              className="min-h-[42px] inline-flex items-center gap-1.5 rounded-lg border border-[#232834] bg-[#171B22] px-3 text-xs font-medium text-[#F3F4F6] hover:border-[#333A4B] whitespace-nowrap shrink-0"
            >
              {copiedEndpoint ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copiedEndpoint ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>

        <ol className="mt-5 space-y-2.5 text-xs text-[#D1D5DB] leading-relaxed">
          <li>
            <strong className="text-[#F3F4F6]">1. Set Server Secret:</strong> Configure <span className="font-mono text-[#F3F4F6]">XM_BRIDGE_TOKEN</span> in Cloudflare Worker secrets (<span className="font-mono text-[#9CA3AF]">npx wrangler secret put XM_BRIDGE_TOKEN</span>). Never place this token in frontend files.
          </li>
          <li>
            <strong className="text-[#F3F4F6]">2. Allow WebRequest in MT5:</strong> Open XM MetaTrader 5 &rarr; <span className="text-[#F3F4F6]">Tools &rarr; Options &rarr; Expert Advisors</span> &rarr; enable <span className="text-[#F3F4F6]">Allow WebRequest for listed URL</span> and add your Worker base URL.
          </li>
          <li>
            <strong className="text-[#F3F4F6]">3. Compile & Attach EA:</strong> Compile <span className="font-mono text-[#F3F4F6]">mt5/SA_AI_TRADER_BRIDGE.mq5</span> in MetaEditor, drag onto your XM <span className="font-mono text-[#F3F4F6]">GOLD</span> chart, and paste your endpoint URL and <span className="font-mono text-[#F3F4F6]">XM_BRIDGE_TOKEN</span> into the EA inputs.
          </li>
          <li>
            <strong className="text-[#F3F4F6]">4. Fail-Safe Guarantee:</strong> If MT5 stops sending data for more than 10 seconds, the dashboard automatically locks signals to <span className="font-mono text-amber-400">WAIT</span>.
          </li>
        </ol>

        <div className="mt-5 flex items-center gap-2 text-[11px] text-[#6B7280]">
          <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Token verification happens exclusively server-side using constant-time comparison.</span>
        </div>
      </div>
    </section>
  );
}
