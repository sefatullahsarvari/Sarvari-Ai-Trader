import type {
  Candle,
  IndicatorSeries,
  IndicatorSnapshot,
  MarketStructureSummary,
  StructureEvent,
  SupportResistanceLevel,
} from '../types/market.ts';

export function calculateEMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) {
    return result;
  }

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }

  let ema = sum / period;
  result[period - 1] = ema;
  const k = 2 / (period + 1);

  for (let i = period; i < values.length; i++) {
    ema = (values[i] - ema) * k + ema;
    result[i] = ema;
  }

  return result;
}

export function calculateRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (period <= 0 || closes.length < period + 1) {
    return result;
  }

  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) {
      gainSum += change;
    } else {
      lossSum += Math.abs(change);
    }
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - 100 / (1 + rs);
    }
  }

  return result;
}

export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
} {
  const len = closes.length;
  const macd: (number | null)[] = new Array(len).fill(null);
  const signal: (number | null)[] = new Array(len).fill(null);
  const histogram: (number | null)[] = new Array(len).fill(null);

  if (len < slowPeriod + signalPeriod - 1) {
    return { macd, signal, histogram };
  }

  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);

  const macdValues: number[] = [];
  const macdIndices: number[] = [];

  for (let i = 0; i < len; i++) {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (f !== null && s !== null) {
      const val = f - s;
      macd[i] = val;
      macdValues.push(val);
      macdIndices.push(i);
    }
  }

  const signalEma = calculateEMA(macdValues, signalPeriod);
  for (let j = 0; j < signalEma.length; j++) {
    const sigVal = signalEma[j];
    const idx = macdIndices[j];
    if (sigVal !== null && macd[idx] !== null) {
      signal[idx] = sigVal;
      histogram[idx] = (macd[idx] as number) - sigVal;
    }
  }

  return { macd, signal, histogram };
}

export function calculateATR(candles: Candle[], period = 14): (number | null)[] {
  const len = candles.length;
  const result: (number | null)[] = new Array(len).fill(null);
  if (period <= 0 || len < period + 1) {
    return result;
  }

  const trueRanges: number[] = new Array(len).fill(0);
  trueRanges[0] = candles[0].high - candles[0].low;

  for (let i = 1; i < len; i++) {
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prevClose),
      Math.abs(candles[i].low - prevClose),
    );
    trueRanges[i] = tr;
  }

  let sum = 0;
  for (let i = 1; i <= period; i++) {
    sum += trueRanges[i];
  }
  let atr = sum / period;
  result[period] = atr;

  for (let i = period + 1; i < len; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result[i] = atr;
  }

  return result;
}

export function calculateBollingerBands(
  closes: number[],
  period = 20,
  stdDevMultiplier = 2,
): {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
  bandwidth: (number | null)[];
} {
  const len = closes.length;
  const upper: (number | null)[] = new Array(len).fill(null);
  const middle: (number | null)[] = new Array(len).fill(null);
  const lower: (number | null)[] = new Array(len).fill(null);
  const bandwidth: (number | null)[] = new Array(len).fill(null);

  if (len < period) {
    return { upper, middle, lower, bandwidth };
  }

  for (let i = period - 1; i < len; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += closes[j];
    }
    const sma = sum / period;

    let sqDiff = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - sma;
      sqDiff += diff * diff;
    }
    const std = Math.sqrt(sqDiff / period);
    const up = sma + stdDevMultiplier * std;
    const low = sma - stdDevMultiplier * std;

    middle[i] = sma;
    upper[i] = up;
    lower[i] = low;
    bandwidth[i] = sma > 0 ? ((up - low) / sma) * 100 : null;
  }

  return { upper, middle, lower, bandwidth };
}

export function computeIndicatorSeries(candles: Candle[]): IndicatorSeries {
  const closes = candles.map((c) => c.close);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const rsi14 = calculateRSI(closes, 14);
  const { macd: macdMain, signal: macdSignal, histogram: macdHist } = calculateMACD(closes, 12, 26, 9);
  const atr14 = calculateATR(candles, 14);
  const { upper: bbUpper, middle: bbMiddle, lower: bbLower } = calculateBollingerBands(closes, 20, 2);

  return {
    ema9,
    ema21,
    ema50,
    ema200,
    rsi14,
    macdMain,
    macdSignal,
    macdHist,
    atr14,
    bbUpper,
    bbMiddle,
    bbLower,
  };
}

export function extractLatestIndicators(candles: Candle[], series?: IndicatorSeries): IndicatorSnapshot {
  if (candles.length === 0) {
    return {
      ema9: null,
      ema21: null,
      ema50: null,
      ema200: null,
      rsi14: null,
      macdMain: null,
      macdSignal: null,
      macdHist: null,
      atr14: null,
      bbUpper: null,
      bbMiddle: null,
      bbLower: null,
      bbBandwidth: null,
    };
  }

  const s = series ?? computeIndicatorSeries(candles);
  const last = candles.length - 1;
  const upper = s.bbUpper[last];
  const middle = s.bbMiddle[last];
  const lower = s.bbLower[last];
  const bbBandwidth =
    upper !== null && lower !== null && middle !== null && middle > 0
      ? ((upper - lower) / middle) * 100
      : null;

  return {
    ema9: s.ema9[last],
    ema21: s.ema21[last],
    ema50: s.ema50[last],
    ema200: s.ema200[last],
    rsi14: s.rsi14[last],
    macdMain: s.macdMain[last],
    macdSignal: s.macdSignal[last],
    macdHist: s.macdHist[last],
    atr14: s.atr14[last],
    bbUpper: upper,
    bbMiddle: middle,
    bbLower: lower,
    bbBandwidth,
  };
}

export function detectSupportResistance(
  candles: Candle[],
  atr: number | null,
  lookback = 140,
): SupportResistanceLevel[] {
  if (candles.length < 15) {
    return [];
  }

  const slice = candles.slice(-lookback);
  const swingWindow = 3;
  const rawLevels: { price: number; type: 'SUPPORT' | 'RESISTANCE'; time: number }[] = [];

  for (let i = swingWindow; i < slice.length - swingWindow; i++) {
    const curr = slice[i];
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = i - swingWindow; j <= i + swingWindow; j++) {
      if (j === i) continue;
      if (slice[j].high >= curr.high) isSwingHigh = false;
      if (slice[j].low <= curr.low) isSwingLow = false;
    }

    if (isSwingHigh) {
      rawLevels.push({ price: curr.high, type: 'RESISTANCE', time: curr.time });
    }
    if (isSwingLow) {
      rawLevels.push({ price: curr.low, type: 'SUPPORT', time: curr.time });
    }
  }

  if (rawLevels.length === 0) {
    return [];
  }

  const currentClose = slice[slice.length - 1].close;
  const tolerance = atr && atr > 0 ? Math.max(atr * 0.45, 0.8) : Math.max(currentClose * 0.0008, 1.0);

  const clusters: {
    prices: number[];
    type: 'SUPPORT' | 'RESISTANCE';
    lastTouchedTime: number;
  }[] = [];

  for (const level of rawLevels) {
    const existing = clusters.find((cl) => {
      const avg = cl.prices.reduce((acc, p) => acc + p, 0) / cl.prices.length;
      return Math.abs(avg - level.price) <= tolerance;
    });

    if (existing) {
      existing.prices.push(level.price);
      if (level.time > existing.lastTouchedTime) {
        existing.lastTouchedTime = level.time;
      }
    } else {
      clusters.push({
        prices: [level.price],
        type: level.price >= currentClose ? 'RESISTANCE' : 'SUPPORT',
        lastTouchedTime: level.time,
      });
    }
  }

  const merged: SupportResistanceLevel[] = clusters.map((cl) => {
    const avgPrice = Number((cl.prices.reduce((a, b) => a + b, 0) / cl.prices.length).toFixed(2));
    return {
      price: avgPrice,
      type: avgPrice >= currentClose ? 'RESISTANCE' : 'SUPPORT',
      strength: cl.prices.length,
      lastTouchedTime: cl.lastTouchedTime,
    };
  });

  // Sort by strength desc, then proximity to current price, cap to top 3 supports + 3 resistances
  const supports = merged
    .filter((l) => l.type === 'SUPPORT')
    .sort((a, b) => b.strength - a.strength || Math.abs(currentClose - a.price) - Math.abs(currentClose - b.price))
    .slice(0, 3);

  const resistances = merged
    .filter((l) => l.type === 'RESISTANCE')
    .sort((a, b) => b.strength - a.strength || Math.abs(currentClose - a.price) - Math.abs(currentClose - b.price))
    .slice(0, 3);

  return [...resistances, ...supports].sort((a, b) => b.price - a.price);
}

export function analyzeMarketStructure(candles: Candle[], swingWindow = 3): MarketStructureSummary {
  if (candles.length < 25) {
    return {
      trend: 'UNCLEAR',
      label: 'Insufficient candles for structure',
      lastBOS: null,
      lastCHOCH: null,
      recentSwingHigh: null,
      recentSwingLow: null,
    };
  }

  const slice = candles.slice(-150);
  const swingHighs: { index: number; price: number; time: number }[] = [];
  const swingLows: { index: number; price: number; time: number }[] = [];

  for (let i = swingWindow; i < slice.length - swingWindow; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - swingWindow; j <= i + swingWindow; j++) {
      if (j === i) continue;
      if (slice[j].high >= slice[i].high) isHigh = false;
      if (slice[j].low <= slice[i].low) isLow = false;
    }
    if (isHigh) {
      swingHighs.push({ index: i, price: slice[i].high, time: slice[i].time });
    }
    if (isLow) {
      swingLows.push({ index: i, price: slice[i].low, time: slice[i].time });
    }
  }

  if (swingHighs.length < 2 || swingLows.length < 2) {
    return {
      trend: 'UNCLEAR',
      label: 'Awaiting swing confirmation',
      lastBOS: null,
      lastCHOCH: null,
      recentSwingHigh: swingHighs.length ? swingHighs[swingHighs.length - 1].price : null,
      recentSwingLow: swingLows.length ? swingLows[swingLows.length - 1].price : null,
    };
  }

  const lastSH = swingHighs[swingHighs.length - 1];
  const prevSH = swingHighs[swingHighs.length - 2];
  const lastSL = swingLows[swingLows.length - 1];
  const prevSL = swingLows[swingLows.length - 2];

  const higherHigh = lastSH.price > prevSH.price;
  const higherLow = lastSL.price > prevSL.price;
  const lowerHigh = lastSH.price < prevSH.price;
  const lowerLow = lastSL.price < prevSL.price;

  let trend: MarketStructureSummary['trend'] = 'RANGING';
  let label = 'Consolidation / Mixed Swings';

  if (higherHigh && higherLow) {
    trend = 'BULLISH';
    label = 'Bullish (HH / HL)';
  } else if (lowerHigh && lowerLow) {
    trend = 'BEARISH';
    label = 'Bearish (LH / LL)';
  }

  let lastBOS: StructureEvent | null = null;
  let lastCHOCH: StructureEvent | null = null;

  // Inspect candles after the latest swing points for structural breaks
  const lastCandle = slice[slice.length - 1];
  const searchStart = Math.max(lastSH.index, lastSL.index) + 1;
  for (let i = Math.min(searchStart, slice.length - 1); i < slice.length; i++) {
    const bar = slice[i];
    if (trend === 'BULLISH') {
      if (bar.close > lastSH.price) {
        lastBOS = { type: 'BOS', direction: 'BULLISH', price: lastSH.price, time: bar.time };
      }
      if (bar.close < lastSL.price) {
        lastCHOCH = { type: 'CHOCH', direction: 'BEARISH', price: lastSL.price, time: bar.time };
      }
    } else if (trend === 'BEARISH') {
      if (bar.close < lastSL.price) {
        lastBOS = { type: 'BOS', direction: 'BEARISH', price: lastSL.price, time: bar.time };
      }
      if (bar.close > lastSH.price) {
        lastCHOCH = { type: 'CHOCH', direction: 'BULLISH', price: lastSH.price, time: bar.time };
      }
    } else {
      if (bar.close > lastSH.price) {
        lastBOS = { type: 'BOS', direction: 'BULLISH', price: lastSH.price, time: bar.time };
      } else if (bar.close < lastSL.price) {
        lastBOS = { type: 'BOS', direction: 'BEARISH', price: lastSL.price, time: bar.time };
      }
    }
  }

  // Also capture immediate current-bar break if searchStart === slice.length
  if (!lastBOS && !lastCHOCH) {
    if (trend === 'BULLISH' && lastCandle.close > lastSH.price) {
      lastBOS = { type: 'BOS', direction: 'BULLISH', price: lastSH.price, time: lastCandle.time };
    } else if (trend === 'BEARISH' && lastCandle.close < lastSL.price) {
      lastBOS = { type: 'BOS', direction: 'BEARISH', price: lastSL.price, time: lastCandle.time };
    }
  }

  return {
    trend,
    label,
    lastBOS,
    lastCHOCH,
    recentSwingHigh: lastSH.price,
    recentSwingLow: lastSL.price,
  };
}
