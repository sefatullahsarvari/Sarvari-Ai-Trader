import type {
  IndicatorSnapshot,
  MarketSnapshot,
  MarketStructureSummary,
  SupportResistanceLevel,
  Timeframe,
} from '../types/market.ts';
import { MAX_ACCEPTABLE_GOLD_SPREAD } from '../lib/signalEngine.ts';

interface MarketStatusPanelProps {
  snapshot: MarketSnapshot | null;
  connectionStatus: 'CONNECTED' | 'STALE' | 'DISCONNECTED';
  ageMs: number | null;
  indicators: IndicatorSnapshot;
  structure: MarketStructureSummary;
  supportResistance: SupportResistanceLevel[];
  timeframe: Timeframe;
  candleCount: number;
}

export function MarketStatusPanel({
  snapshot,
  connectionStatus,
  ageMs,
  indicators,
  structure,
  supportResistance,
  timeframe,
  candleCount,
}: MarketStatusPanelProps) {
  const spreadCondition = !snapshot
    ? 'Unavailable'
    : snapshot.spread <= 0.35
      ? `Tight ($${snapshot.spread.toFixed(snapshot.digits)})`
      : snapshot.spread <= MAX_ACCEPTABLE_GOLD_SPREAD
        ? `Normal ($${snapshot.spread.toFixed(snapshot.digits)})`
        : `Excessive ($${snapshot.spread.toFixed(snapshot.digits)})`;

  const emaTrend =
    indicators.ema9 !== null &&
    indicators.ema21 !== null &&
    indicators.ema50 !== null &&
    indicators.ema200 !== null
      ? indicators.ema9 > indicators.ema21 && indicators.ema21 > indicators.ema50 && indicators.ema50 > indicators.ema200
        ? 'Bullish EMA Stack'
        : indicators.ema9 < indicators.ema21 && indicators.ema21 < indicators.ema50 && indicators.ema50 < indicators.ema200
          ? 'Bearish EMA Stack'
          : 'Mixed / Transitional'
      : 'Insufficient bars';

  const rsiLabel =
    indicators.rsi14 !== null
      ? `${indicators.rsi14.toFixed(1)} (${
          indicators.rsi14 > 70 ? 'Overbought' : indicators.rsi14 < 30 ? 'Oversold' : 'Neutral'
        })`
      : '--';

  const macdLabel =
    indicators.macdMain !== null && indicators.macdSignal !== null
      ? `${indicators.macdMain >= indicators.macdSignal ? 'Bullish' : 'Bearish'} (${indicators.macdMain.toFixed(2)} / ${indicators.macdSignal.toFixed(2)})`
      : '--';

  const atrLabel =
    indicators.atr14 !== null ? `$${indicators.atr14.toFixed(2)} (${timeframe})` : '--';

  const nearestSupport = supportResistance.filter((l) => l.type === 'SUPPORT')[0];
  const nearestResistance = supportResistance.filter((l) => l.type === 'RESISTANCE').slice(-1)[0];

  const rows: { label: string; value: string; tone?: string }[] = [
    {
      label: 'Current Trend',
      value: emaTrend,
      tone: emaTrend.includes('Bullish')
        ? 'text-emerald-400'
        : emaTrend.includes('Bearish')
          ? 'text-rose-400'
          : 'text-[#F3F4F6]',
    },
    {
      label: 'Market Structure',
      value: structure.label,
    },
    {
      label: 'BOS / CHOCH',
      value: structure.lastCHOCH
        ? `${structure.lastCHOCH.direction} CHOCH @ $${structure.lastCHOCH.price.toFixed(2)}`
        : structure.lastBOS
          ? `${structure.lastBOS.direction} BOS @ $${structure.lastBOS.price.toFixed(2)}`
          : 'No recent break',
    },
    {
      label: 'Volatility (ATR 14)',
      value: atrLabel,
    },
    {
      label: 'Spread Condition',
      value: spreadCondition,
      tone: spreadCondition.startsWith('Excessive') ? 'text-rose-400' : 'text-[#F3F4F6]',
    },
    {
      label: 'Nearest Resistance',
      value: nearestResistance ? `$${nearestResistance.price.toFixed(2)} (${nearestResistance.strength}x)` : '--',
      tone: nearestResistance ? 'text-rose-400' : 'text-[#9CA3AF]',
    },
    {
      label: 'Nearest Support',
      value: nearestSupport ? `$${nearestSupport.price.toFixed(2)} (${nearestSupport.strength}x)` : '--',
      tone: nearestSupport ? 'text-emerald-400' : 'text-[#9CA3AF]',
    },
    {
      label: 'RSI (14)',
      value: rsiLabel,
    },
    {
      label: 'MACD (12,26,9)',
      value: macdLabel,
    },
    {
      label: 'EMA 50 / 200',
      value:
        indicators.ema50 !== null && indicators.ema200 !== null
          ? `$${indicators.ema50.toFixed(2)} / $${indicators.ema200.toFixed(2)}`
          : '--',
    },
    {
      label: 'Data Health',
      value: `${connectionStatus} · ${candleCount} ${timeframe} bars${
        ageMs !== null ? ` · ${Math.floor(ageMs / 1000)}s` : ''
      }`,
      tone:
        connectionStatus === 'CONNECTED'
          ? 'text-emerald-400'
          : connectionStatus === 'STALE'
            ? 'text-amber-400'
            : 'text-rose-400',
    },
  ];

  return (
    <section
      aria-label="Market Status"
      className="rounded-xl border border-[#232834] bg-[#12151B] p-4 sm:p-5"
    >
      <h2 className="font-display text-sm font-semibold text-[#F3F4F6]">
        Market Status & Structure
      </h2>

      <dl className="mt-3 divide-y divide-[#1D222D]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-2.5 text-xs">
            <dt className="text-[#9CA3AF]">{row.label}</dt>
            <dd className={`text-right font-mono font-medium tabular-nums ${row.tone ?? 'text-[#F3F4F6]'}`}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
