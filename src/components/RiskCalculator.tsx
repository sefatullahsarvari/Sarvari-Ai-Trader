import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RotateCcw, Sparkles } from 'lucide-react';
import {
  calculateGoldRisk,
  DEFAULT_XM_GOLD_SPECS,
} from '../lib/riskCalculator.ts';
import type { TradeSignal, XMContractSpecs } from '../types/market.ts';

interface RiskCalculatorProps {
  currentSignal: TradeSignal;
  syncedSignal: TradeSignal | null;
  liveBid: number | null;
}

export function RiskCalculator({ currentSignal, syncedSignal, liveBid }: RiskCalculatorProps) {
  const [balanceInput, setBalanceInput] = useState<string>('1000');
  const [riskPctInput, setRiskPctInput] = useState<string>('1.0');
  const [entryInput, setEntryInput] = useState<string>('');
  const [slInput, setSlInput] = useState<string>('');
  const [tp1Input, setTp1Input] = useState<string>('');
  const [tp2Input, setTp2Input] = useState<string>('');

  const [specs, setSpecs] = useState<XMContractSpecs>(DEFAULT_XM_GOLD_SPECS);

  // Auto-populate when user clicks "Load Levels into Risk Calculator" from SignalPanel
  useEffect(() => {
    if (!syncedSignal || syncedSignal.direction === 'WAIT') return;
    if (syncedSignal.entryPrice !== null) {
      setEntryInput(syncedSignal.entryPrice.toFixed(2));
    }
    if (syncedSignal.stopLoss !== null) {
      setSlInput(syncedSignal.stopLoss.toFixed(2));
    }
    if (syncedSignal.takeProfit1 !== null) {
      setTp1Input(syncedSignal.takeProfit1.toFixed(2));
    }
    if (syncedSignal.takeProfit2 !== null) {
      setTp2Input(syncedSignal.takeProfit2.toFixed(2));
    }
  }, [syncedSignal]);

  const handleSyncActiveSignal = () => {
    if (currentSignal.direction === 'WAIT') return;
    if (currentSignal.entryPrice !== null) setEntryInput(currentSignal.entryPrice.toFixed(2));
    if (currentSignal.stopLoss !== null) setSlInput(currentSignal.stopLoss.toFixed(2));
    if (currentSignal.takeProfit1 !== null) setTp1Input(currentSignal.takeProfit1.toFixed(2));
    if (currentSignal.takeProfit2 !== null) setTp2Input(currentSignal.takeProfit2.toFixed(2));
  };

  const handleUseLivePrice = () => {
    if (liveBid !== null) {
      setEntryInput(liveBid.toFixed(2));
    }
  };

  const calculation = useMemo(() => {
    const accountBalance = Number(balanceInput);
    const riskPercent = Number(riskPctInput);
    const entryPrice = Number(entryInput);
    const stopLossPrice = Number(slInput);
    const takeProfit1Price = tp1Input.trim() ? Number(tp1Input) : null;
    const takeProfit2Price = tp2Input.trim() ? Number(tp2Input) : null;

    return calculateGoldRisk({
      accountBalance,
      riskPercent,
      entryPrice,
      stopLossPrice,
      takeProfit1Price,
      takeProfit2Price,
      specs,
    });
  }, [balanceInput, riskPctInput, entryInput, slInput, tp1Input, tp2Input, specs]);

  const updateSpec = (key: keyof XMContractSpecs, raw: string) => {
    const val = Number(raw);
    setSpecs((prev) => ({
      ...prev,
      [key]: Number.isFinite(val) ? val : 0,
    }));
  };

  return (
    <section aria-label="Risk Management Calculator" className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left: Position Parameters & XM Specifications */}
      <div className="lg:col-span-7 rounded-xl border border-[#232834] bg-[#12151B] p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[#F3F4F6]">
              XM GOLD Position Risk Calculator
            </h2>
            <p className="mt-0.5 text-xs text-[#9CA3AF]">
              Calculates lot sizing rounded down to broker volume steps so risk never exceeds your limit.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {liveBid !== null && (
              <button
                type="button"
                onClick={handleUseLivePrice}
                className="min-h-[40px] rounded-lg border border-[#232834] bg-[#171B22] px-3 text-xs font-medium text-[#D1D5DB] hover:border-[#333A4B] hover:text-white whitespace-nowrap shrink-0"
              >
                Use Bid ({liveBid.toFixed(2)})
              </button>
            )}
            {currentSignal.direction !== 'WAIT' && (
              <button
                type="button"
                onClick={handleSyncActiveSignal}
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 text-xs font-medium text-amber-300 hover:bg-amber-400/15 whitespace-nowrap shrink-0"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sync Signal</span>
              </button>
            )}
          </div>
        </div>

        {/* Account & Trade Level Inputs */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-[#D1D5DB]">Account Balance (USD)</span>
            <input
              type="number"
              min="0"
              step="any"
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
              placeholder="e.g. 1000"
              className="mt-1.5 w-full min-h-[44px] rounded-lg border border-[#232834] bg-[#0B0D10] px-3 py-2 font-mono text-sm text-[#F3F4F6] tabular-nums focus:border-amber-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[#D1D5DB]">Risk Per Trade (%)</span>
            <input
              type="number"
              min="0.01"
              max="100"
              step="0.1"
              value={riskPctInput}
              onChange={(e) => setRiskPctInput(e.target.value)}
              placeholder="e.g. 1.0"
              className="mt-1.5 w-full min-h-[44px] rounded-lg border border-[#232834] bg-[#0B0D10] px-3 py-2 font-mono text-sm text-[#F3F4F6] tabular-nums focus:border-amber-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[#D1D5DB]">Entry Price</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={entryInput}
              onChange={(e) => setEntryInput(e.target.value)}
              placeholder="Enter GOLD price"
              className="mt-1.5 w-full min-h-[44px] rounded-lg border border-[#232834] bg-[#0B0D10] px-3 py-2 font-mono text-sm text-[#F3F4F6] tabular-nums focus:border-amber-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[#D1D5DB]">Stop Loss Price</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={slInput}
              onChange={(e) => setSlInput(e.target.value)}
              placeholder="Enter Stop Loss price"
              className="mt-1.5 w-full min-h-[44px] rounded-lg border border-[#232834] bg-[#0B0D10] px-3 py-2 font-mono text-sm text-[#F3F4F6] tabular-nums focus:border-amber-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[#9CA3AF]">Take Profit 1 (Optional)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={tp1Input}
              onChange={(e) => setTp1Input(e.target.value)}
              placeholder="Optional TP1"
              className="mt-1.5 w-full min-h-[44px] rounded-lg border border-[#232834] bg-[#0B0D10] px-3 py-2 font-mono text-sm text-[#F3F4F6] tabular-nums focus:border-amber-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-[#9CA3AF]">Take Profit 2 (Optional)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={tp2Input}
              onChange={(e) => setTp2Input(e.target.value)}
              placeholder="Optional TP2"
              className="mt-1.5 w-full min-h-[44px] rounded-lg border border-[#232834] bg-[#0B0D10] px-3 py-2 font-mono text-sm text-[#F3F4F6] tabular-nums focus:border-amber-400 focus:outline-none"
            />
          </label>
        </div>

        {/* Editable XM Contract Specifications */}
        <div className="mt-6 border-t border-[#232834] pt-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold text-[#F3F4F6]">
              XM GOLD Contract Specifications
            </h3>
            <button
              type="button"
              onClick={() => setSpecs(DEFAULT_XM_GOLD_SPECS)}
              className="inline-flex min-h-[36px] items-center gap-1.5 text-xs text-[#9CA3AF] hover:text-[#F3F4F6]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset XM Defaults</span>
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <label className="block">
              <span className="text-[11px] text-[#9CA3AF]">Contract Size</span>
              <input
                type="number"
                step="any"
                value={specs.contractSize}
                onChange={(e) => updateSpec('contractSize', e.target.value)}
                className="mt-1 w-full min-h-[40px] rounded-lg border border-[#232834] bg-[#0B0D10] px-2.5 py-1.5 font-mono text-xs text-[#F3F4F6] tabular-nums focus:border-amber-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-[#9CA3AF]">Min Volume</span>
              <input
                type="number"
                step="0.01"
                value={specs.minVolume}
                onChange={(e) => updateSpec('minVolume', e.target.value)}
                className="mt-1 w-full min-h-[40px] rounded-lg border border-[#232834] bg-[#0B0D10] px-2.5 py-1.5 font-mono text-xs text-[#F3F4F6] tabular-nums focus:border-amber-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-[#9CA3AF]">Volume Step</span>
              <input
                type="number"
                step="0.01"
                value={specs.volumeStep}
                onChange={(e) => updateSpec('volumeStep', e.target.value)}
                className="mt-1 w-full min-h-[40px] rounded-lg border border-[#232834] bg-[#0B0D10] px-2.5 py-1.5 font-mono text-xs text-[#F3F4F6] tabular-nums focus:border-amber-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-[#9CA3AF]">Tick Size</span>
              <input
                type="number"
                step="0.001"
                value={specs.tickSize}
                onChange={(e) => updateSpec('tickSize', e.target.value)}
                className="mt-1 w-full min-h-[40px] rounded-lg border border-[#232834] bg-[#0B0D10] px-2.5 py-1.5 font-mono text-xs text-[#F3F4F6] tabular-nums focus:border-amber-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-[#9CA3AF]">Tick Value ($)</span>
              <input
                type="number"
                step="any"
                value={specs.tickValue}
                onChange={(e) => updateSpec('tickValue', e.target.value)}
                className="mt-1 w-full min-h-[40px] rounded-lg border border-[#232834] bg-[#0B0D10] px-2.5 py-1.5 font-mono text-xs text-[#F3F4F6] tabular-nums focus:border-amber-400 focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#232834] bg-[#0F1218] p-3 text-xs text-[#9CA3AF]">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" aria-hidden="true" />
            <span>
              Broker specifications must be verified inside your XM MT5 terminal (Market Watch &rarr; Right-click GOLD &rarr; Specification). Account tiers such as XM Micro or Standard use different contract sizes.
            </span>
          </div>
        </div>
      </div>

      {/* Right: Calculation Output */}
      <div className="lg:col-span-5 rounded-xl border border-[#232834] bg-[#12151B] p-4 sm:p-6 flex flex-col justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-[#F3F4F6]">
            Position Sizing Output
          </h2>

          {!calculation.valid ? (
            <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="text-sm font-semibold text-amber-300">
                Lot Size Not Recommended
              </div>
              <p className="mt-1.5 text-xs text-[#D1D5DB] leading-relaxed">
                {calculation.reason}
              </p>
            </div>
          ) : (
            <div className="mt-5">
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="text-xs text-emerald-300">Recommended Volume (Lots)</div>
                <div className="mt-1 font-mono text-4xl font-bold text-[#F3F4F6] tabular-nums">
                  {calculation.recommendedLots?.toFixed(2)}
                </div>
                <div className="mt-1 font-mono text-xs text-[#9CA3AF] tabular-nums">
                  Raw unrounded: {calculation.rawLots?.toFixed(4)} lots
                </div>
              </div>

              <dl className="mt-4 divide-y divide-[#1D222D]">
                <div className="flex justify-between py-2.5 text-xs">
                  <dt className="text-[#9CA3AF]">Target Risk Budget</dt>
                  <dd className="font-mono font-medium text-[#F3F4F6] tabular-nums">
                    ${calculation.riskAmount?.toFixed(2)}
                  </dd>
                </div>
                <div className="flex justify-between py-2.5 text-xs">
                  <dt className="text-[#9CA3AF]">Actual Risk at Lot Size</dt>
                  <dd className="font-mono font-medium text-rose-400 tabular-nums">
                    ${calculation.actualRiskAmount?.toFixed(2)} ({calculation.actualRiskPercent?.toFixed(2)}%)
                  </dd>
                </div>
                <div className="flex justify-between py-2.5 text-xs">
                  <dt className="text-[#9CA3AF]">Stop Loss Distance</dt>
                  <dd className="font-mono font-medium text-[#F3F4F6] tabular-nums">
                    ${calculation.stopDistance?.toFixed(2)} ({calculation.stopTicks} ticks)
                  </dd>
                </div>
                {calculation.potentialProfitTp1 !== null && (
                  <div className="flex justify-between py-2.5 text-xs">
                    <dt className="text-[#9CA3AF]">Projected TP1 Gain</dt>
                    <dd className="font-mono font-medium text-emerald-400 tabular-nums">
                      +${calculation.potentialProfitTp1.toFixed(2)} (R:R {calculation.riskReward1}:1)
                    </dd>
                  </div>
                )}
                {calculation.potentialProfitTp2 !== null && (
                  <div className="flex justify-between py-2.5 text-xs">
                    <dt className="text-[#9CA3AF]">Projected TP2 Gain</dt>
                    <dd className="font-mono font-medium text-emerald-400 tabular-nums">
                      +${calculation.potentialProfitTp2.toFixed(2)} (R:R {calculation.riskReward2}:1)
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>

        <p className="mt-6 border-t border-[#232834] pt-3 text-[11px] text-[#6B7280] leading-relaxed">
          SA AI TRADER is strictly a read-only analytical tool. Verify margin requirements, swaps, and contract specs in MT5 before placing any trade manually.
        </p>
      </div>
    </section>
  );
}
