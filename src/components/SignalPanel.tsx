import { ArrowDownRight, ArrowUpRight, Calculator, PauseCircle, ShieldAlert } from 'lucide-react';
import type { TradeSignal } from '../types/market.ts';

interface SignalPanelProps {
  signal: TradeSignal;
  onUseSignalInRisk: (signal: TradeSignal) => void;
}

export function SignalPanel({ signal, onUseSignalInRisk }: SignalPanelProps) {
  const theme = {
    BUY: {
      border: 'border-emerald-500/35',
      surface: 'bg-emerald-500/10',
      text: 'text-emerald-400',
      label: 'BUY',
      Icon: ArrowUpRight,
    },
    SELL: {
      border: 'border-rose-500/35',
      surface: 'bg-rose-500/10',
      text: 'text-rose-400',
      label: 'SELL',
      Icon: ArrowDownRight,
    },
    WAIT: {
      border: 'border-amber-500/35',
      surface: 'bg-amber-500/10',
      text: 'text-amber-400',
      label: 'WAIT',
      Icon: PauseCircle,
    },
  }[signal.direction];

  const SignalIcon = theme.Icon;
  const isDirectional = signal.direction !== 'WAIT';

  return (
    <section
      aria-label="Signal Engine"
      className="rounded-xl border border-[#232834] bg-[#12151B] p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-sm font-semibold text-[#F3F4F6]">
            Technical Signal Engine
          </h2>
          <p className="mt-0.5 text-xs text-[#9CA3AF] font-mono tabular-nums">
            {signal.symbol} · {signal.timeframe} ·{' '}
            {new Date(signal.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </p>
        </div>

        <div
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-display text-base font-bold ${theme.border} ${theme.surface} ${theme.text}`}
        >
          <SignalIcon className="h-4 w-4" aria-hidden="true" />
          <span>{theme.label}</span>
        </div>
      </div>

      {/* Trade Levels Grid */}
      <div className="mt-4 grid grid-cols-2 gap-3 border-y border-[#232834] py-3.5">
        <div>
          <div className="text-xs text-[#9CA3AF]">Entry Price / Zone</div>
          <div className="mt-0.5 font-mono text-sm font-semibold text-[#F3F4F6] tabular-nums">
            {signal.entryPrice !== null ? `$${signal.entryPrice.toFixed(2)}` : '--'}
          </div>
          {signal.entryZone && (
            <div className="font-mono text-[11px] text-[#6B7280] tabular-nums">
              Zone ${signal.entryZone.min.toFixed(2)} – ${signal.entryZone.max.toFixed(2)}
            </div>
          )}
        </div>

        <div>
          <div className="text-xs text-[#9CA3AF]">Stop Loss</div>
          <div className="mt-0.5 font-mono text-sm font-semibold text-rose-400 tabular-nums">
            {signal.stopLoss !== null ? `$${signal.stopLoss.toFixed(2)}` : '--'}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#9CA3AF]">Take Profit 1</div>
          <div className="mt-0.5 font-mono text-sm font-semibold text-emerald-400 tabular-nums">
            {signal.takeProfit1 !== null ? `$${signal.takeProfit1.toFixed(2)}` : '--'}
          </div>
          {signal.riskReward1 !== null && (
            <div className="font-mono text-[11px] text-[#6B7280] tabular-nums">
              R:R {signal.riskReward1.toFixed(2)} : 1
            </div>
          )}
        </div>

        <div>
          <div className="text-xs text-[#9CA3AF]">Take Profit 2</div>
          <div className="mt-0.5 font-mono text-sm font-semibold text-emerald-400 tabular-nums">
            {signal.takeProfit2 !== null ? `$${signal.takeProfit2.toFixed(2)}` : '--'}
          </div>
          {signal.riskReward2 !== null && (
            <div className="font-mono text-[11px] text-[#6B7280] tabular-nums">
              R:R {signal.riskReward2.toFixed(2)} : 1
            </div>
          )}
        </div>
      </div>

      {/* Data Quality & Technical Rule Alignment */}
      <div className="mt-3.5 grid grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span>Rule Alignment</span>
            <span className="font-mono text-[#F3F4F6] tabular-nums">
              {signal.confirmationScore}/100
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#1E232D]">
            <div
              className={`h-full transition-all duration-300 ${
                signal.direction === 'BUY'
                  ? 'bg-emerald-500'
                  : signal.direction === 'SELL'
                    ? 'bg-rose-500'
                    : 'bg-amber-500'
              }`}
              style={{ width: `${signal.confirmationScore}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
            <span>Data Quality</span>
            <span className="font-mono text-[#F3F4F6] tabular-nums">
              {signal.dataQualityScore}/100
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#1E232D]">
            <div
              className="h-full bg-sky-400 transition-all duration-300"
              style={{ width: `${signal.dataQualityScore}%` }}
            />
          </div>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-[#6B7280]">
        Rule alignment reflects technical condition count only — never a win probability or profit guarantee.
      </p>

      {/* Supporting Reasons */}
      {signal.reasonsFor.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold text-emerald-400">Reasons Supporting</h3>
          <ul className="mt-1.5 space-y-1.5">
            {signal.reasonsFor.map((reason, idx) => (
              <li key={idx} className="text-xs text-[#D1D5DB] leading-relaxed">
                • {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Counter-arguments / Blockers */}
      {signal.reasonsAgainst.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold text-amber-400">
            {signal.direction === 'WAIT' ? 'Reasons WAIT Is Enforced' : 'Risks & Considerations'}
          </h3>
          <ul className="mt-1.5 space-y-1.5">
            {signal.reasonsAgainst.map((reason, idx) => (
              <li key={idx} className="text-xs text-[#9CA3AF] leading-relaxed">
                • {reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {isDirectional ? (
        <button
          type="button"
          onClick={() => onUseSignalInRisk(signal)}
          className="mt-4 w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border border-[#333A4B] bg-[#171B22] px-4 py-2 text-xs font-medium text-[#F3F4F6] hover:border-amber-400/50 hover:text-amber-300 transition-colors"
        >
          <Calculator className="h-4 w-4" aria-hidden="true" />
          <span>Load Levels into Risk Calculator</span>
        </button>
      ) : (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-[#232834] bg-[#0F1218] px-3 py-2.5 text-xs text-[#9CA3AF]">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
          <span>Read-only analysis: WAIT is enforced until all fail-safes and confirmations pass.</span>
        </div>
      )}
    </section>
  );
}
