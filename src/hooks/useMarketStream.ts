import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SUPPORTED_TIMEFRAMES,
  type Candle,
  type HealthResponse,
  type MarketCandlesResponse,
  type MarketLatestResponse,
  type Timeframe,
  type TradeSignal,
} from '../types/market.ts';
import {
  analyzeMarketStructure,
  computeIndicatorSeries,
  detectSupportResistance,
  extractLatestIndicators,
} from '../lib/indicators.ts';
import { generateTradeSignal } from '../lib/signalEngine.ts';
import { FRESHNESS_THRESHOLD_MS } from '../lib/validation.ts';
import { buildApiUrl } from '../lib/api.ts';

export function useMarketStream(activeTimeframe: Timeframe) {
  const [latest, setLatest] = useState<MarketLatestResponse | null>(null);
  const [candlesByTf, setCandlesByTf] = useState<Partial<Record<Timeframe, Candle[]>>>({});
  const [signalsHistory, setSignalsHistory] = useState<TradeSignal[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // 1-second clock tick for accurate live freshness calculation
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      const timeframesToFetch = Array.from(
        new Set<Timeframe>([activeTimeframe, 'H1', 'H4', 'D1']),
      );

      const [latestRes, healthRes, signalsRes, ...candleResponses] = await Promise.all([
        fetch(buildApiUrl('/api/market/latest')),
        fetch(buildApiUrl('/api/health')),
        fetch(buildApiUrl('/api/signals')),
        ...timeframesToFetch.map((tf) =>
          fetch(buildApiUrl(`/api/market/candles?timeframe=${tf}`)).then(async (r) => ({
            tf,
            ok: r.ok,
            data: r.ok ? ((await r.json()) as MarketCandlesResponse) : null,
          })),
        ),
      ]);

      if (!latestRes.ok) {
        let message = `API responded with HTTP ${latestRes.status}`;
        try {
          const errBody = (await latestRes.json()) as { error?: string };
          if (errBody.error) message = errBody.error;
        } catch {
          // Non-JSON response (for example, missing VITE_API_BASE_URL on Pages)
        }
        setApiError(message);
      } else {
        const latestData = (await latestRes.json()) as MarketLatestResponse;
        setLatest(latestData);
        setApiError(null);
      }

      if (healthRes.ok) {
        const healthData = (await healthRes.json()) as HealthResponse;
        setHealth(healthData);
      } else {
        try {
          const errHealth = (await healthRes.json()) as HealthResponse & { error?: string };
          if (errHealth && typeof errHealth.ok === 'boolean') {
            setHealth(errHealth);
          }
        } catch {
          // Ignore non-JSON health failure
        }
      }

      if (signalsRes.ok) {
        const sigData = (await signalsRes.json()) as { signals?: TradeSignal[] };
        if (Array.isArray(sigData.signals)) {
          setSignalsHistory(sigData.signals);
        }
      }

      setCandlesByTf((prev) => {
        const next = { ...prev };
        for (const item of candleResponses) {
          if (item.ok && item.data) {
            next[item.tf] = item.data.candles;
          }
        }
        return next;
      });
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Unable to reach backend bridge API.');
    } finally {
      setLoading(false);
    }
  }, [activeTimeframe]);

  useEffect(() => {
    void fetchAllData();
    const interval = window.setInterval(() => {
      void fetchAllData();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [fetchAllData]);

  const snapshot = latest?.snapshot ?? null;

  const liveAgeMs = useMemo(() => {
    if (!snapshot) return null;
    return Math.max(0, nowMs - snapshot.receivedAt);
  }, [snapshot, nowMs]);

  const connectionStatus: 'CONNECTED' | 'STALE' | 'DISCONNECTED' = useMemo(() => {
    if (!snapshot || liveAgeMs === null) return 'DISCONNECTED';
    if (liveAgeMs > 60_000) return 'DISCONNECTED';
    if (liveAgeMs > FRESHNESS_THRESHOLD_MS) return 'STALE';
    return 'CONNECTED';
  }, [snapshot, liveAgeMs]);

  const activeCandles = candlesByTf[activeTimeframe] ?? [];

  const indicatorSeries = useMemo(
    () => computeIndicatorSeries(activeCandles),
    [activeCandles],
  );

  const latestIndicators = useMemo(
    () => extractLatestIndicators(activeCandles, indicatorSeries),
    [activeCandles, indicatorSeries],
  );

  const marketStructure = useMemo(
    () => analyzeMarketStructure(activeCandles),
    [activeCandles],
  );

  const supportResistance = useMemo(
    () => detectSupportResistance(activeCandles, latestIndicators.atr14),
    [activeCandles, latestIndicators.atr14],
  );

  const currentSignal = useMemo(
    () =>
      generateTradeSignal({
        snapshot,
        timeframe: activeTimeframe,
        candlesByTimeframe: candlesByTf,
        nowMs,
      }),
    [snapshot, activeTimeframe, candlesByTf, nowMs],
  );

  const lastCandleTime = useMemo(() => {
    if (activeCandles.length > 0) {
      return activeCandles[activeCandles.length - 1].time;
    }
    return snapshot?.lastCandleTimes?.[activeTimeframe] ?? null;
  }, [activeCandles, snapshot, activeTimeframe]);

  return {
    snapshot,
    connectionStatus,
    liveAgeMs,
    candleCounts: latest?.candleCounts ?? ({} as Partial<Record<Timeframe, number>>),
    activeCandles,
    indicatorSeries,
    latestIndicators,
    marketStructure,
    supportResistance,
    currentSignal,
    signalsHistory,
    health,
    loading,
    apiError,
    lastCandleTime,
    supportedTimeframes: SUPPORTED_TIMEFRAMES,
    refreshNow: fetchAllData,
  };
}
