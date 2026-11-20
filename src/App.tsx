import { useState } from 'react';
import { X } from 'lucide-react';
import { Header, type ActiveTab } from './components/Header.tsx';
import { MarketHeader } from './components/MarketHeader.tsx';
import { CandlestickChart } from './components/CandlestickChart.tsx';
import { SignalPanel } from './components/SignalPanel.tsx';
import { MarketStatusPanel } from './components/MarketStatusPanel.tsx';
import { RiskCalculator } from './components/RiskCalculator.tsx';
import { SignalHistory } from './components/SignalHistory.tsx';
import { ConnectionSettings } from './components/ConnectionSettings.tsx';
import { useMarketStream } from './hooks/useMarketStream.ts';
import { useSignalAlerts } from './hooks/useSignalAlerts.ts';
import type { Timeframe, TradeSignal } from './types/market.ts';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('terminal');
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>('M15');
  const [syncedSignalForRisk, setSyncedSignalForRisk] = useState<TradeSignal | null>(null);

  const {
    snapshot,
    connectionStatus,
    liveAgeMs,
    activeCandles,
    indicatorSeries,
    latestIndicators,
    marketStructure,
    supportResistance,
    currentSignal,
    signalsHistory,
    health,
    apiError,
    lastCandleTime,
    refreshNow,
  } = useMarketStream(activeTimeframe);

  const { alertsEnabled, inAppAlert, toggleAlerts, dismissInAppAlert } =
    useSignalAlerts(currentSignal);

  const handleUseSignalInRisk = (sig: TradeSignal) => {
    setSyncedSignalForRisk(sig);
    setActiveTab('risk');
  };

  return (
    <div className="min-h-screen bg-[#0B0D10] text-[#F3F4F6] pb-20 md:pb-10">
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        alertsEnabled={alertsEnabled}
        onToggleAlerts={toggleAlerts}
      />

      <MarketHeader
        snapshot={snapshot}
        connectionStatus={connectionStatus}
        ageMs={liveAgeMs}
        activeTimeframe={activeTimeframe}
        lastCandleTime={lastCandleTime}
      />

      {/* Alert Toast Banner */}
      {inAppAlert && (
        <div className="mx-auto max-w-[1440px] px-4 pt-4 sm:px-6">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
            <span>{inAppAlert}</span>
            <button
              type="button"
              onClick={dismissInAppAlert}
              aria-label="Dismiss notification"
              className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded text-amber-300 hover:bg-amber-500/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Backend API Connectivity Warning if unreachable */}
      {apiError && (
        <div className="mx-auto max-w-[1440px] px-4 pt-4 sm:px-6">
          <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300">
            Backend API notice: {apiError}. Signal Engine remains locked to WAIT.
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6">
        {activeTab === 'terminal' && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
            <div className="lg:col-span-8 space-y-5">
              <CandlestickChart
                candles={activeCandles}
                series={indicatorSeries}
                supportResistance={supportResistance}
                activeTimeframe={activeTimeframe}
                onSelectTimeframe={setActiveTimeframe}
                currentBid={snapshot?.bid ?? null}
                currentSignal={currentSignal}
                onOpenBridgeSetup={() => setActiveTab('bridge')}
              />

              {/* Quick inline desktop access to Risk & History summary below chart */}
              <div className="hidden lg:block">
                <SignalHistory signals={signalsHistory.slice(0, 8)} />
              </div>
            </div>

            <div className="lg:col-span-4 space-y-5">
              <SignalPanel
                signal={currentSignal}
                onUseSignalInRisk={handleUseSignalInRisk}
              />
              <MarketStatusPanel
                snapshot={snapshot}
                connectionStatus={connectionStatus}
                ageMs={liveAgeMs}
                indicators={latestIndicators}
                structure={marketStructure}
                supportResistance={supportResistance}
                timeframe={activeTimeframe}
                candleCount={activeCandles.length}
              />
            </div>
          </div>
        )}

        {activeTab === 'risk' && (
          <RiskCalculator
            currentSignal={currentSignal}
            syncedSignal={syncedSignalForRisk}
            liveBid={snapshot?.bid ?? null}
          />
        )}

        {activeTab === 'history' && <SignalHistory signals={signalsHistory} />}

        {activeTab === 'bridge' && (
          <ConnectionSettings
            snapshot={snapshot}
            connectionStatus={connectionStatus}
            health={health}
            lastCandleTime={lastCandleTime}
            activeTimeframe={activeTimeframe}
            onRefresh={refreshNow}
          />
        )}
      </main>
    </div>
  );
}
