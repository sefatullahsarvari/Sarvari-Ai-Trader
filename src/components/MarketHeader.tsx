import { Activity, AlertTriangle, WifiOff } from 'lucide-react';
import type { MarketSnapshot, Timeframe } from '../types/market.ts';

interface MarketHeaderProps {
  snapshot: MarketSnapshot | null;
  connectionStatus: 'CONNECTED' | 'STALE' | 'DISCONNECTED';
  ageMs: number | null;
  activeTimeframe: Timeframe;
  lastCandleTime: number | null;
}

function formatAge(ageMs: number | null): string {
  if (ageMs === null) return 'No feed';
  const sec = Math.floor(ageMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${sec % 60}s ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m ago`;
}

export function MarketHeader({
  snapshot,
  connectionStatus,
  ageMs,
  activeTimeframe,
  lastCandleTime,
}: MarketHeaderProps) {
  const digits = snapshot?.digits ?? 2;
  const bidText = snapshot ? snapshot.bid.toFixed(digits) : '--.--';
  const askText = snapshot ? snapshot.ask.toFixed(digits) : '--.--';
  const spreadText = snapshot
    ? `$${snapshot.spread.toFixed(digits)} (${snapshot.spreadPoints} pts)`
    : '--';

  const statusConfig = {
    CONNECTED: {
      label: 'Connected',
      textClass: 'text-emerald-400',
      Icon: Activity,
      liveDot: true,
    },
    STALE: {
      label: 'Stale (>10s)',
      textClass: 'text-amber-400',
      Icon: AlertTriangle,
      liveDot: false,
    },
    DISCONNECTED: {
      label: 'Disconnected',
      textClass: 'text-rose-400',
      Icon: WifiOff,
      liveDot: false,
    },
  }[connectionStatus];

  const StatusIcon = statusConfig.Icon;

  return (
    <section
      aria-label="Market overview"
      className="border-b border-[#232834] bg-[#12151B]"
    >
      <div className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Left: Symbol Identity & Large Readable GOLD Price */}
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs text-[#9CA3AF]">
                <span className="font-semibold text-[#F3F4F6]">
                  {snapshot?.symbol ?? 'GOLD'}
                </span>
                <span aria-hidden="true">·</span>
                <span>Broker: {snapshot?.broker ?? 'XM'}</span>
                <span aria-hidden="true">·</span>
                <span>TF: {activeTimeframe}</span>
              </div>

              <div className="mt-1 flex items-baseline gap-4">
                <div>
                  <span className="block text-[11px] text-[#9CA3AF]">Bid</span>
                  <span className="font-mono text-3xl sm:text-4xl font-semibold tracking-tight text-[#F3F4F6] tabular-nums">
                    {bidText}
                  </span>
                </div>
                <div className="text-[#4B5563] font-mono text-xl">/</div>
                <div>
                  <span className="block text-[11px] text-[#9CA3AF]">Ask</span>
                  <span className="font-mono text-2xl sm:text-3xl font-medium tracking-tight text-[#D1D5DB] tabular-nums">
                    {askText}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Structured Metadata Strip (unboxed text, tabular figures) */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[#232834] pt-3 sm:grid-cols-4 lg:border-t-0 lg:pt-0">
            <div>
              <div className="text-xs text-[#9CA3AF]">Spread</div>
              <div className="mt-0.5 font-mono text-sm font-medium text-[#F3F4F6] tabular-nums">
                {spreadText}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#9CA3AF]">XM Server Time</div>
              <div className="mt-0.5 font-mono text-sm font-medium text-[#F3F4F6] tabular-nums">
                {snapshot ? snapshot.serverTime : '--:--:--'}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#9CA3AF]">Data Freshness</div>
              <div className="mt-0.5 font-mono text-sm font-medium text-[#F3F4F6] tabular-nums">
                {formatAge(ageMs)}
                {lastCandleTime && (
                  <span className="ml-1.5 text-xs text-[#6B7280]">
                    · Bar {new Date(lastCandleTime * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#9CA3AF]">MT5 Bridge</div>
              <div className={`mt-0.5 flex items-center gap-1.5 text-sm font-medium ${statusConfig.textClass}`}>
                {statusConfig.liveDot ? (
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                ) : (
                  <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>{statusConfig.label}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
