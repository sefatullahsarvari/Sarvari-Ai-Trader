import { useMemo, useState } from 'react';
import type { SignalDirection, TradeSignal } from '../types/market.ts';

interface SignalHistoryProps {
  signals: TradeSignal[];
}

const STATUS_LABELS: Record<TradeSignal['status'], { text: string; className: string }> = {
  TP2_HIT: { text: 'Verified TP2 Hit', className: 'text-emerald-400' },
  TP1_HIT: { text: 'Verified TP1 Hit', className: 'text-emerald-400' },
  SL_HIT: { text: 'Verified SL Hit', className: 'text-rose-400' },
  PENDING_VERIFICATION: { text: 'Pending Verification', className: 'text-amber-400' },
  INSUFFICIENT_DATA: { text: 'Insufficient Price Data', className: 'text-[#9CA3AF]' },
  NOT_APPLICABLE: { text: 'WAIT (No Entry)', className: 'text-[#9CA3AF]' },
};

export function SignalHistory({ signals }: SignalHistoryProps) {
  const [filterDirection, setFilterDirection] = useState<'ALL' | SignalDirection>('ALL');

  const filtered = useMemo(() => {
    if (filterDirection === 'ALL') return signals;
    return signals.filter((s) => s.direction === filterDirection);
  }, [signals, filterDirection]);

  return (
    <section
      aria-label="Signal History"
      className="rounded-xl border border-[#232834] bg-[#12151B] p-4 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-[#F3F4F6]">
            Verified Signal History
          </h2>
          <p className="mt-0.5 text-xs text-[#9CA3AF]">
            Signals are stored server-side and verified only when real subsequent MT5 candles confirm TP or SL levels.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-[#0B0D10] p-1 border border-[#232834]">
          {(['ALL', 'BUY', 'SELL'] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              onClick={() => setFilterDirection(dir)}
              className={`min-h-[36px] rounded-md px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                filterDirection === dir
                  ? 'bg-[#1E232D] text-[#F3F4F6]'
                  : 'text-[#9CA3AF] hover:text-[#F3F4F6]'
              }`}
            >
              {dir === 'ALL' ? 'All Signals' : dir}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-lg border border-[#232834] bg-[#0F1218] px-4 py-10 text-center">
          <p className="text-sm font-medium text-[#F3F4F6]">No recorded directional signals yet</p>
          <p className="mt-1 text-xs text-[#9CA3AF] max-w-md mx-auto">
            Confirmed BUY or SELL setups evaluated by the backend engine appear here automatically once live MT5 candle history satisfies all confirmations.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#232834] text-[#9CA3AF]">
                <th className="py-3 pr-4 font-medium">Date & Time</th>
                <th className="py-3 pr-4 font-medium">Direction</th>
                <th className="py-3 pr-4 font-medium">TF</th>
                <th className="py-3 pr-4 font-medium text-right">Entry</th>
                <th className="py-3 pr-4 font-medium text-right">SL</th>
                <th className="py-3 pr-4 font-medium text-right">TP1 / TP2</th>
                <th className="py-3 pr-4 font-medium">Signal Reasons</th>
                <th className="py-3 font-medium text-right">Final Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D222D]">
              {filtered.map((sig) => {
                const statusInfo = STATUS_LABELS[sig.status] ?? STATUS_LABELS.PENDING_VERIFICATION;
                const dirColor =
                  sig.direction === 'BUY'
                    ? 'text-emerald-400'
                    : sig.direction === 'SELL'
                      ? 'text-rose-400'
                      : 'text-amber-400';

                return (
                  <tr key={sig.id} className="hover:bg-[#171B22]/60 transition-colors">
                    <td className="py-3 pr-4 font-mono text-[#D1D5DB] tabular-nums whitespace-nowrap">
                      {new Date(sig.timestamp).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className={`py-3 pr-4 font-display font-bold ${dirColor}`}>
                      {sig.direction}
                    </td>
                    <td className="py-3 pr-4 font-mono text-[#D1D5DB]">{sig.timeframe}</td>
                    <td className="py-3 pr-4 text-right font-mono text-[#F3F4F6] tabular-nums">
                      {sig.entryPrice !== null ? `$${sig.entryPrice.toFixed(2)}` : '--'}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-rose-400 tabular-nums">
                      {sig.stopLoss !== null ? `$${sig.stopLoss.toFixed(2)}` : '--'}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono text-emerald-400 tabular-nums whitespace-nowrap">
                      {sig.takeProfit1 !== null ? `$${sig.takeProfit1.toFixed(2)}` : '--'}
                      {sig.takeProfit2 !== null ? ` / $${sig.takeProfit2.toFixed(2)}` : ''}
                    </td>
                    <td className="py-3 pr-4 max-w-xs text-[#9CA3AF]">
                      <span className="line-clamp-2">
                        {sig.reasonsFor[0] ?? sig.reasonsAgainst[0] ?? '--'}
                      </span>
                    </td>
                    <td className={`py-3 text-right font-medium whitespace-nowrap ${statusInfo.className}`}>
                      <div>{statusInfo.text}</div>
                      {sig.verificationNote && (
                        <div className="text-[10px] font-normal text-[#6B7280] mt-0.5">
                          {sig.verificationNote}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
