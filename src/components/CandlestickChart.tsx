import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, ZoomIn, ZoomOut, Link2 } from 'lucide-react';
import type {
  Candle,
  IndicatorSeries,
  SupportResistanceLevel,
  Timeframe,
  TradeSignal,
} from '../types/market.ts';
import { SUPPORTED_TIMEFRAMES } from '../types/market.ts';

interface CandlestickChartProps {
  candles: Candle[];
  series: IndicatorSeries;
  supportResistance: SupportResistanceLevel[];
  activeTimeframe: Timeframe;
  onSelectTimeframe: (tf: Timeframe) => void;
  currentBid: number | null;
  currentSignal: TradeSignal;
  onOpenBridgeSetup: () => void;
}

interface OverlayToggles {
  ema9: boolean;
  ema21: boolean;
  ema50: boolean;
  ema200: boolean;
  sr: boolean;
  volume: boolean;
  rsi: boolean;
  macd: boolean;
}

function formatCandleTime(unixSec: number, tf: Timeframe): string {
  const d = new Date(unixSec * 1000);
  if (tf === 'D1') {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CandlestickChart({
  candles,
  series,
  supportResistance,
  activeTimeframe,
  onSelectTimeframe,
  currentBid,
  currentSignal,
  onOpenBridgeSetup,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [overlays, setOverlays] = useState<OverlayToggles>({
    ema9: true,
    ema21: true,
    ema50: true,
    ema200: true,
    sr: true,
    volume: true,
    rsi: true,
    macd: true,
  });

  // Visible bar window: count of bars shown and right-edge offset from end
  const [visibleCount, setVisibleCount] = useState<number>(80);
  const [rightOffset, setRightOffset] = useState<number>(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [crosshairY, setCrosshairY] = useState<number | null>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({
    width: 800,
    height: 480,
  });

  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startOffset: number;
  }>({ active: false, startX: 0, startOffset: 0 });

  // Reset pan when timeframe switches
  useEffect(() => {
    setRightOffset(0);
    setHoverIndex(null);
  }, [activeTimeframe]);

  // Responsive container resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      const baseHeight = overlays.rsi && overlays.macd ? 540 : overlays.rsi || overlays.macd ? 450 : 360;
      const mobileHeight = overlays.rsi && overlays.macd ? 440 : overlays.rsi || overlays.macd ? 380 : 310;
      const targetHeight = rect.width < 640 ? mobileHeight : baseHeight;
      setCanvasSize({
        width: Math.max(300, Math.floor(rect.width)),
        height: targetHeight,
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [overlays.rsi, overlays.macd]);

  const toggleOverlay = (key: keyof OverlayToggles) => {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const clampOffset = useCallback(
    (offset: number, count: number) => {
      const maxOffset = Math.max(0, candles.length - Math.min(count, candles.length));
      return Math.max(0, Math.min(maxOffset, Math.round(offset)));
    },
    [candles.length],
  );

  const handleZoom = (direction: 'in' | 'out' | 'reset') => {
    if (direction === 'reset') {
      setVisibleCount(80);
      setRightOffset(0);
      return;
    }
    setVisibleCount((prev) => {
      const next = direction === 'in' ? Math.max(20, Math.round(prev * 0.78)) : Math.min(260, Math.round(prev * 1.25));
      setRightOffset((off) => clampOffset(off, next));
      return next;
    });
  };

  const { startIdx, endIdx, sliceCandles } = useMemo(() => {
    if (candles.length === 0) {
      return { startIdx: 0, endIdx: 0, sliceCandles: [] as Candle[] };
    }
    const clampedCount = Math.min(candles.length, Math.max(20, visibleCount));
    const safeOffset = clampOffset(rightOffset, clampedCount);
    const end = candles.length - safeOffset;
    const start = Math.max(0, end - clampedCount);
    return {
      startIdx: start,
      endIdx: end,
      sliceCandles: candles.slice(start, end),
    };
  }, [candles, visibleCount, rightOffset, clampOffset]);

  // Inspected candle (either hovered via crosshair or latest candle)
  const inspectedGlobalIdx = useMemo(() => {
    if (candles.length === 0) return null;
    if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < sliceCandles.length) {
      return startIdx + hoverIndex;
    }
    return candles.length - 1;
  }, [candles.length, hoverIndex, sliceCandles.length, startIdx]);

  const inspectedCandle = inspectedGlobalIdx !== null ? candles[inspectedGlobalIdx] : null;

  // Draw chart canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || sliceCandles.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvasSize;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padLeft = 10;
    const padRight = 68;
    const padTop = 12;
    const padBottom = 24;
    const plotW = width - padLeft - padRight;

    const showRsi = overlays.rsi;
    const showMacd = overlays.macd;
    const totalSubPanes = (showRsi ? 1 : 0) + (showMacd ? 1 : 0);
    const subPaneH = totalSubPanes > 0 ? (height < 460 ? 74 : 88) : 0;
    const paneGap = 10;
    const mainH = height - padTop - padBottom - totalSubPanes * (subPaneH + paneGap);
    const mainBottom = padTop + mainH;

    // Price domain
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVol = 0;

    for (let i = 0; i < sliceCandles.length; i++) {
      const c = sliceCandles[i];
      const gIdx = startIdx + i;
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume && c.volume > maxVol) maxVol = c.volume;

      const checkEma = (val: number | null) => {
        if (val !== null) {
          if (val < minPrice) minPrice = val;
          if (val > maxPrice) maxPrice = val;
        }
      };
      if (overlays.ema9) checkEma(series.ema9[gIdx]);
      if (overlays.ema21) checkEma(series.ema21[gIdx]);
      if (overlays.ema50) checkEma(series.ema50[gIdx]);
      if (overlays.ema200) checkEma(series.ema200[gIdx]);
    }

    if (currentBid !== null && rightOffset === 0) {
      if (currentBid < minPrice) minPrice = currentBid;
      if (currentBid > maxPrice) maxPrice = currentBid;
    }

    if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice)) return;
    const priceSpan = Math.max(0.5, maxPrice - minPrice);
    minPrice -= priceSpan * 0.08;
    maxPrice += priceSpan * 0.08;

    const priceToY = (p: number) =>
      padTop + ((maxPrice - p) / (maxPrice - minPrice)) * mainH;

    const barStep = plotW / Math.max(1, sliceCandles.length);
    const candleW = Math.max(2, Math.min(12, barStep * 0.68));
    const idxToX = (i: number) => padLeft + (i + 0.5) * barStep;

    // Background grid
    ctx.strokeStyle = '#1B202B';
    ctx.lineWidth = 1;
    const gridRows = 5;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#6B7280';
    ctx.textAlign = 'left';

    for (let r = 0; r <= gridRows; r++) {
      const ratio = r / gridRows;
      const y = Math.round(padTop + ratio * mainH) + 0.5;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();

      const priceLabel = (maxPrice - ratio * (maxPrice - minPrice)).toFixed(2);
      ctx.fillText(priceLabel, padLeft + plotW + 6, y + 4);
    }

    // Support & Resistance levels
    if (overlays.sr && supportResistance.length > 0) {
      for (const level of supportResistance) {
        if (level.price < minPrice || level.price > maxPrice) continue;
        const y = Math.round(priceToY(level.price)) + 0.5;
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = level.type === 'SUPPORT' ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(padLeft + plotW, y);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = level.type === 'SUPPORT' ? '#4ADE80' : '#F87171';
        ctx.fillText(`${level.type === 'SUPPORT' ? 'S' : 'R'} ${level.price.toFixed(2)}`, padLeft + 6, y - 4);
      }
    }

    // Active Signal Entry / SL / TP1 / TP2 reference lines
    if (currentSignal.direction !== 'WAIT' && currentSignal.entryPrice !== null) {
      const drawSigLine = (price: number | null, label: string, color: string) => {
        if (price === null || price < minPrice || price > maxPrice) return;
        const y = Math.round(priceToY(price)) + 0.5;
        ctx.save();
        ctx.setLineDash([2, 3]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(padLeft + plotW, y);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = color;
        ctx.fillText(`${label} ${price.toFixed(2)}`, padLeft + 6, y - 3);
      };
      drawSigLine(currentSignal.entryPrice, 'ENTRY', '#FBBF24');
      drawSigLine(currentSignal.stopLoss, 'SL', '#EF4444');
      drawSigLine(currentSignal.takeProfit1, 'TP1', '#22C55E');
    }

    // Volume histogram at bottom 18% of main pane
    if (overlays.volume && maxVol > 0) {
      const volMaxH = mainH * 0.18;
      for (let i = 0; i < sliceCandles.length; i++) {
        const c = sliceCandles[i];
        if (!c.volume) continue;
        const vh = (c.volume / maxVol) * volMaxH;
        const x = idxToX(i) - candleW / 2;
        ctx.fillStyle = c.close >= c.open ? 'rgba(34, 197, 94, 0.22)' : 'rgba(239, 68, 68, 0.22)';
        ctx.fillRect(x, mainBottom - vh, candleW, vh);
      }
    }

    // Candlesticks
    for (let i = 0; i < sliceCandles.length; i++) {
      const c = sliceCandles[i];
      const x = idxToX(i);
      const isBull = c.close >= c.open;
      const color = isBull ? '#22C55E' : '#EF4444';

      const yHigh = priceToY(c.high);
      const yLow = priceToY(c.low);
      const yOpen = priceToY(c.open);
      const yClose = priceToY(c.close);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, yHigh);
      ctx.lineTo(Math.round(x) + 0.5, yLow);
      ctx.stroke();

      const bodyTop = Math.min(yOpen, yClose);
      const bodyH = Math.max(1.5, Math.abs(yOpen - yClose));
      ctx.fillStyle = color;
      ctx.fillRect(x - candleW / 2, bodyTop, candleW, bodyH);
    }

    // EMA Overlay lines
    const drawOverlayLine = (arr: (number | null)[], color: string) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < sliceCandles.length; i++) {
        const val = arr[startIdx + i];
        if (val === null) {
          started = false;
          continue;
        }
        const x = idxToX(i);
        const y = priceToY(val);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    };

    if (overlays.ema200) drawOverlayLine(series.ema200, '#E5E7EB');
    if (overlays.ema50) drawOverlayLine(series.ema50, '#A855F7');
    if (overlays.ema21) drawOverlayLine(series.ema21, '#F59E0B');
    if (overlays.ema9) drawOverlayLine(series.ema9, '#38BDF8');

    // Live Bid Line
    if (currentBid !== null && currentBid >= minPrice && currentBid <= maxPrice) {
      const bidY = Math.round(priceToY(currentBid)) + 0.5;
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, bidY);
      ctx.lineTo(padLeft + plotW, bidY);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(padLeft + plotW + 2, bidY - 8, 62, 16);
      ctx.fillStyle = '#0B0D10';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.fillText(currentBid.toFixed(2), padLeft + plotW + 6, bidY + 3.5);
    }

    // Sub-panes: RSI & MACD
    let nextPaneTop = mainBottom + paneGap;

    if (showRsi) {
      const pTop = nextPaneTop;
      const pBottom = pTop + subPaneH;

      ctx.strokeStyle = '#232834';
      ctx.lineWidth = 1;
      ctx.strokeRect(padLeft + 0.5, pTop + 0.5, plotW, subPaneH);

      const rsiToY = (v: number) => pTop + ((100 - v) / 100) * subPaneH;
      for (const ref of [70, 50, 30]) {
        const ry = Math.round(rsiToY(ref)) + 0.5;
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = ref === 50 ? '#232834' : 'rgba(156, 163, 175, 0.25)';
        ctx.beginPath();
        ctx.moveTo(padLeft, ry);
        ctx.lineTo(padLeft + plotW, ry);
        ctx.stroke();
        ctx.restore();
      }

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#9CA3AF';
      ctx.fillText('RSI(14)', padLeft + 6, pTop + 12);
      ctx.fillText('70', padLeft + plotW + 6, rsiToY(70) + 3);
      ctx.fillText('30', padLeft + plotW + 6, rsiToY(30) + 3);

      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < sliceCandles.length; i++) {
        const val = series.rsi14[startIdx + i];
        if (val === null) {
          started = false;
          continue;
        }
        const x = idxToX(i);
        const y = rsiToY(val);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      nextPaneTop = pBottom + paneGap;
    }

    if (showMacd) {
      const pTop = nextPaneTop;
      const pBottom = pTop + subPaneH;

      ctx.strokeStyle = '#232834';
      ctx.lineWidth = 1;
      ctx.strokeRect(padLeft + 0.5, pTop + 0.5, plotW, subPaneH);

      let maxAbs = 0.01;
      for (let i = 0; i < sliceCandles.length; i++) {
        const gIdx = startIdx + i;
        const m = series.macdMain[gIdx];
        const s = series.macdSignal[gIdx];
        const h = series.macdHist[gIdx];
        if (m !== null) maxAbs = Math.max(maxAbs, Math.abs(m));
        if (s !== null) maxAbs = Math.max(maxAbs, Math.abs(s));
        if (h !== null) maxAbs = Math.max(maxAbs, Math.abs(h));
      }
      maxAbs *= 1.15;

      const macdToY = (v: number) => pTop + ((maxAbs - v) / (2 * maxAbs)) * subPaneH;
      const zeroY = macdToY(0);

      ctx.strokeStyle = '#2A3140';
      ctx.beginPath();
      ctx.moveTo(padLeft, zeroY);
      ctx.lineTo(padLeft + plotW, zeroY);
      ctx.stroke();

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#9CA3AF';
      ctx.fillText('MACD(12,26,9)', padLeft + 6, pTop + 12);
      ctx.fillText('0.0', padLeft + plotW + 6, zeroY + 3);

      // Histogram bars
      for (let i = 0; i < sliceCandles.length; i++) {
        const h = series.macdHist[startIdx + i];
        if (h === null) continue;
        const x = idxToX(i) - candleW / 2;
        const y = macdToY(h);
        ctx.fillStyle = h >= 0 ? 'rgba(34, 197, 94, 0.55)' : 'rgba(239, 68, 68, 0.55)';
        ctx.fillRect(x, Math.min(y, zeroY), candleW, Math.max(1, Math.abs(y - zeroY)));
      }

      const drawMacdLine = (arr: (number | null)[], color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < sliceCandles.length; i++) {
          const val = arr[startIdx + i];
          if (val === null) {
            started = false;
            continue;
          }
          const x = idxToX(i);
          const y = macdToY(val);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      };

      drawMacdLine(series.macdMain, '#38BDF8');
      drawMacdLine(series.macdSignal, '#F59E0B');

      void pBottom;
    }

    // Time X-Axis labels
    const timeTickStep = Math.max(1, Math.floor(sliceCandles.length / 5));
    ctx.fillStyle = '#6B7280';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < sliceCandles.length; i += timeTickStep) {
      const c = sliceCandles[i];
      const x = idxToX(i);
      const lbl = new Date(c.time * 1000).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      ctx.fillText(lbl, x, height - 6);
    }

    // Crosshair
    if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < sliceCandles.length) {
      const cx = Math.round(idxToX(hoverIndex)) + 0.5;
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#6B7280';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, padTop);
      ctx.lineTo(cx, height - padBottom);
      ctx.stroke();

      if (crosshairY !== null && crosshairY >= padTop && crosshairY <= mainBottom) {
        const cy = Math.round(crosshairY) + 0.5;
        ctx.beginPath();
        ctx.moveTo(padLeft, cy);
        ctx.lineTo(padLeft + plotW, cy);
        ctx.stroke();

        const hoverPrice = maxPrice - ((crosshairY - padTop) / mainH) * (maxPrice - minPrice);
        ctx.fillStyle = '#333A4B';
        ctx.fillRect(padLeft + plotW + 2, cy - 8, 62, 16);
        ctx.fillStyle = '#F3F4F6';
        ctx.textAlign = 'left';
        ctx.fillText(hoverPrice.toFixed(2), padLeft + plotW + 6, cy + 3.5);
      }
      ctx.restore();
    }
  }, [
    sliceCandles,
    series,
    supportResistance,
    overlays,
    canvasSize,
    startIdx,
    currentBid,
    rightOffset,
    hoverIndex,
    crosshairY,
    currentSignal,
  ]);

  const updatePointerCrosshair = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || sliceCandles.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const padLeft = 10;
    const padRight = 68;
    const plotW = canvasSize.width - padLeft - padRight;
    if (x < padLeft || x > padLeft + plotW) {
      setHoverIndex(null);
      setCrosshairY(null);
      return;
    }
    const barStep = plotW / sliceCandles.length;
    const idx = Math.max(0, Math.min(sliceCandles.length - 1, Math.floor((x - padLeft) / barStep)));
    setHoverIndex(idx);
    setCrosshairY(y);
  };

  return (
    <section
      aria-label="Live Candlestick Chart"
      className="rounded-xl border border-[#232834] bg-[#12151B]"
    >
      {/* Chart Toolbar: Timeframes + Overlay Toggles + Zoom */}
      <div className="flex flex-col gap-3 border-b border-[#232834] p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Timeframe Selector */}
          <div className="flex items-center gap-1 overflow-x-auto" role="group" aria-label="Timeframe">
            {SUPPORTED_TIMEFRAMES.map((tf) => {
              const active = tf === activeTimeframe;
              return (
                <button
                  key={tf}
                  type="button"
                  onClick={() => onSelectTimeframe(tf)}
                  className={`min-h-[40px] px-3 rounded-lg text-xs font-mono font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-amber-400 text-[#0B0D10]'
                      : 'bg-[#171B22] text-[#9CA3AF] hover:text-[#F3F4F6] hover:bg-[#1E232D]'
                  }`}
                >
                  {tf}
                </button>
              );
            })}
          </div>

          {/* Zoom & Pan Reset Controls */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleZoom('in')}
              aria-label="Zoom in"
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-[#232834] bg-[#171B22] text-[#D1D5DB] hover:border-[#333A4B] hover:text-white"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleZoom('out')}
              aria-label="Zoom out"
              className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-[#232834] bg-[#171B22] text-[#D1D5DB] hover:border-[#333A4B] hover:text-white"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleZoom('reset')}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-[#232834] bg-[#171B22] px-3 text-xs font-medium text-[#D1D5DB] hover:border-[#333A4B] hover:text-white whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Indicator Toggles + Crosshair OHLC Readout */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['ema9', 'EMA 9', 'text-sky-400'],
                ['ema21', 'EMA 21', 'text-amber-400'],
                ['ema50', 'EMA 50', 'text-purple-400'],
                ['ema200', 'EMA 200', 'text-gray-200'],
                ['sr', 'S/R', 'text-emerald-400'],
                ['volume', 'Vol', 'text-gray-300'],
                ['rsi', 'RSI 14', 'text-sky-300'],
                ['macd', 'MACD', 'text-amber-300'],
              ] as [keyof OverlayToggles, string, string][]
            ).map(([key, label, activeColor]) => {
              const on = overlays[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleOverlay(key)}
                  className={`min-h-[34px] rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                    on
                      ? `border-[#333A4B] bg-[#171B22] ${activeColor}`
                      : 'border-transparent bg-transparent text-[#6B7280] hover:text-[#9CA3AF]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Real-time OHLC Readout */}
          {inspectedCandle && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-[#9CA3AF] tabular-nums">
              <span>{formatCandleTime(inspectedCandle.time, activeTimeframe)}</span>
              <span>
                O <strong className="text-[#F3F4F6] font-medium">{inspectedCandle.open.toFixed(2)}</strong>
              </span>
              <span>
                H <strong className="text-[#F3F4F6] font-medium">{inspectedCandle.high.toFixed(2)}</strong>
              </span>
              <span>
                L <strong className="text-[#F3F4F6] font-medium">{inspectedCandle.low.toFixed(2)}</strong>
              </span>
              <span>
                C <strong className="text-[#F3F4F6] font-medium">{inspectedCandle.close.toFixed(2)}</strong>
              </span>
              {inspectedCandle.volume !== undefined && (
                <span>
                  V <strong className="text-[#F3F4F6] font-medium">{inspectedCandle.volume}</strong>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Canvas Viewport or Strict Empty State */}
      <div ref={containerRef} className="relative w-full overflow-hidden">
        {sliceCandles.length === 0 ? (
          <div className="flex h-[360px] flex-col items-center justify-center px-6 text-center bg-[#0F1218]">
            <p className="font-display text-base font-semibold text-[#F3F4F6]">
              Waiting for MT5 candle data
            </p>
            <p className="mt-1.5 max-w-md text-xs text-[#9CA3AF] leading-relaxed">
              No actual {activeTimeframe} OHLC candles have been received from your XM MetaTrader 5 Expert Advisor bridge yet. Simulated or placeholder candles are never drawn.
            </p>
            <button
              type="button"
              onClick={onOpenBridgeSetup}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#333A4B] bg-[#171B22] px-4 py-2 text-xs font-medium text-[#F3F4F6] hover:border-amber-400/50 hover:text-amber-300 transition-colors"
            >
              <Link2 className="h-4 w-4" aria-hidden="true" />
              <span>View MT5 Bridge Setup</span>
            </button>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="block touch-pan-y cursor-crosshair select-none"
            onWheel={(e) => {
              e.preventDefault();
              handleZoom(e.deltaY < 0 ? 'in' : 'out');
            }}
            onMouseDown={(e) => {
              dragStateRef.current = {
                active: true,
                startX: e.clientX,
                startOffset: rightOffset,
              };
            }}
            onMouseMove={(e) => {
              if (dragStateRef.current.active) {
                const dx = e.clientX - dragStateRef.current.startX;
                const pxPerBar = Math.max(3, (canvasSize.width - 78) / visibleCount);
                const deltaBars = Math.round(dx / pxPerBar);
                setRightOffset(clampOffset(dragStateRef.current.startOffset + deltaBars, visibleCount));
              }
              updatePointerCrosshair(e.clientX, e.clientY);
            }}
            onMouseUp={() => {
              dragStateRef.current.active = false;
            }}
            onMouseLeave={() => {
              dragStateRef.current.active = false;
              setHoverIndex(null);
              setCrosshairY(null);
            }}
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                const t = e.touches[0];
                dragStateRef.current = {
                  active: true,
                  startX: t.clientX,
                  startOffset: rightOffset,
                };
                updatePointerCrosshair(t.clientX, t.clientY);
              }
            }}
            onTouchMove={(e) => {
              if (e.touches.length === 1 && dragStateRef.current.active) {
                const t = e.touches[0];
                const dx = t.clientX - dragStateRef.current.startX;
                const pxPerBar = Math.max(3, (canvasSize.width - 78) / visibleCount);
                const deltaBars = Math.round(dx / pxPerBar);
                setRightOffset(clampOffset(dragStateRef.current.startOffset + deltaBars, visibleCount));
                updatePointerCrosshair(t.clientX, t.clientY);
              }
            }}
            onTouchEnd={() => {
              dragStateRef.current.active = false;
            }}
          />
        )}
      </div>
    </section>
  );
}
