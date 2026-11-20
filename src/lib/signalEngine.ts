import {
  analyzeMarketStructure,
  computeIndicatorSeries,
  detectSupportResistance,
  extractLatestIndicators,
} from './indicators.ts';
import { FRESHNESS_THRESHOLD_MS } from './validation.ts';
import type {
  Candle,
  MarketSnapshot,
  SignalDirection,
  SupportResistanceLevel,
  Timeframe,
  TradeSignal,
} from '../types/market.ts';

export const MIN_CANDLES_FOR_FULL_ANALYSIS = 205;
export const MAX_ACCEPTABLE_GOLD_SPREAD = 0.65; // $0.65 (65 points on 2-digit XM GOLD)

function getHigherTimeframes(tf: Timeframe): Timeframe[] {
  switch (tf) {
    case 'M1':
      return ['M15', 'H1'];
    case 'M5':
      return ['M30', 'H1'];
    case 'M15':
      return ['H1', 'H4'];
    case 'M30':
      return ['H4', 'D1'];
    case 'H1':
      return ['H4', 'D1'];
    case 'H4':
      return ['D1'];
    case 'D1':
      return [];
  }
}

function getTimeframeSeconds(tf: Timeframe): number {
  switch (tf) {
    case 'M1':
      return 60;
    case 'M5':
      return 300;
    case 'M15':
      return 900;
    case 'M30':
      return 1800;
    case 'H1':
      return 3600;
    case 'H4':
      return 14400;
    case 'D1':
      return 86400;
  }
}

function evaluateHigherTimeframeBias(
  candles: Candle[] | undefined,
): 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'UNAVAILABLE' {
  if (!candles || candles.length < 60) {
    return 'UNAVAILABLE';
  }
  const series = computeIndicatorSeries(candles);
  const ind = extractLatestIndicators(candles, series);
  const structure = analyzeMarketStructure(candles);
  const lastClose = candles[candles.length - 1].close;

  if (ind.ema21 === null || ind.ema50 === null) {
    return 'UNAVAILABLE';
  }

  const emaBull = lastClose > ind.ema21 && ind.ema21 > ind.ema50;
  const emaBear = lastClose < ind.ema21 && ind.ema21 < ind.ema50;
  const above200 = ind.ema200 === null ? true : lastClose > ind.ema200;
  const below200 = ind.ema200 === null ? true : lastClose < ind.ema200;

  if (emaBull && above200 && structure.trend !== 'BEARISH') {
    return 'BULLISH';
  }
  if (emaBear && below200 && structure.trend !== 'BULLISH') {
    return 'BEARISH';
  }
  return 'NEUTRAL';
}

function buildWaitSignal(
  timeframe: Timeframe,
  nowMs: number,
  dataQualityScore: number,
  confirmationScore: number,
  reasonsFor: string[],
  reasonsAgainst: string[],
  symbol = 'GOLD',
): TradeSignal {
  return {
    id: `${symbol}-${timeframe}-WAIT-${nowMs}`,
    symbol,
    timeframe,
    direction: 'WAIT',
    timestamp: nowMs,
    entryPrice: null,
    entryZone: null,
    stopLoss: null,
    takeProfit1: null,
    takeProfit2: null,
    riskReward1: null,
    riskReward2: null,
    confirmationScore,
    dataQualityScore,
    reasonsFor,
    reasonsAgainst,
    status: 'NOT_APPLICABLE',
    verifiedAt: null,
  };
}

export interface SignalAnalysisParams {
  snapshot: MarketSnapshot | null;
  timeframe: Timeframe;
  candlesByTimeframe: Partial<Record<Timeframe, Candle[]>>;
  nowMs?: number;
}

export function generateTradeSignal(params: SignalAnalysisParams): TradeSignal {
  const { snapshot, timeframe, candlesByTimeframe, nowMs = Date.now() } = params;
  const symbol = snapshot?.symbol ?? 'GOLD';

  // Fail-safe 1: Connection / snapshot availability
  if (!snapshot) {
    return buildWaitSignal(
      timeframe,
      nowMs,
      0,
      0,
      [],
      ['MT5 bridge connection is not active — no live market snapshot received.'],
      symbol,
    );
  }

  // Fail-safe 2: Freshness <= 10 seconds
  const ageMs = nowMs - snapshot.receivedAt;
  if (ageMs > FRESHNESS_THRESHOLD_MS) {
    return buildWaitSignal(
      timeframe,
      nowMs,
      15,
      0,
      [],
      [
        `Market data is stale (${Math.round(ageMs / 1000)}s old; maximum allowed is 10s).`,
        'WAIT enforced until fresh MT5 packets resume.',
      ],
      symbol,
    );
  }

  const candles = candlesByTimeframe[timeframe];

  // Fail-safe 3: Missing candles
  if (!candles || candles.length === 0) {
    return buildWaitSignal(
      timeframe,
      nowMs,
      20,
      0,
      [],
      [`No actual OHLC candle history received yet for ${timeframe}.`],
      symbol,
    );
  }

  // Fail-safe 4: Sufficient candle history for all required indicators (EMA 200 requires >= 200 bars)
  if (candles.length < MIN_CANDLES_FOR_FULL_ANALYSIS) {
    return buildWaitSignal(
      timeframe,
      nowMs,
      Math.round((candles.length / MIN_CANDLES_FOR_FULL_ANALYSIS) * 60),
      0,
      [],
      [
        `Insufficient ${timeframe} candle history (${candles.length}/${MIN_CANDLES_FOR_FULL_ANALYSIS} bars required to compute EMA 200 and full indicator suite).`,
        'WAIT enforced — missing indicator values are never invented.',
      ],
      symbol,
    );
  }

  // Verify last candle isn't drastically stale relative to timeframe
  const lastCandle = candles[candles.length - 1];
  const tfSec = getTimeframeSeconds(timeframe);
  const candleAgeSec = Math.floor(nowMs / 1000) - lastCandle.time;
  if (candleAgeSec > tfSec * 3 && candleAgeSec > 180) {
    return buildWaitSignal(
      timeframe,
      nowMs,
      35,
      0,
      [],
      [`Latest ${timeframe} candle timestamp appears stale (${candleAgeSec}s behind current time).`],
      symbol,
    );
  }

  const series = computeIndicatorSeries(candles);
  const ind = extractLatestIndicators(candles, series);

  // Fail-safe 5: Verify all core indicators are computable
  if (
    ind.ema9 === null ||
    ind.ema21 === null ||
    ind.ema50 === null ||
    ind.ema200 === null ||
    ind.rsi14 === null ||
    ind.macdMain === null ||
    ind.macdSignal === null ||
    ind.macdHist === null ||
    ind.atr14 === null ||
    ind.bbUpper === null ||
    ind.bbLower === null ||
    ind.bbMiddle === null
  ) {
    return buildWaitSignal(
      timeframe,
      nowMs,
      40,
      0,
      [],
      ['One or more required technical indicators could not be calculated from current candles.'],
      symbol,
    );
  }

  const prevHist = series.macdHist[candles.length - 2];
  const structure = analyzeMarketStructure(candles);
  const srLevels: SupportResistanceLevel[] = detectSupportResistance(candles, ind.atr14);

  // Compute data quality score (0-100)
  const freshnessPenalty = Math.min(20, Math.max(0, (ageMs / FRESHNESS_THRESHOLD_MS) * 15));
  const spreadPenalty = snapshot.spread > MAX_ACCEPTABLE_GOLD_SPREAD ? 30 : snapshot.spread > 0.45 ? 10 : 0;
  const dataQualityScore = Math.max(0, Math.round(100 - freshnessPenalty - spreadPenalty));

  // Fail-safe 6: Excessive spread rejection
  if (snapshot.spread > MAX_ACCEPTABLE_GOLD_SPREAD || snapshot.spread > ind.atr14 * 0.4) {
    return buildWaitSignal(
      timeframe,
      nowMs,
      dataQualityScore,
      0,
      [],
      [
        `Current spread ($${snapshot.spread.toFixed(snapshot.digits)} / ${snapshot.spreadPoints} pts) is excessive relative to volatility (ATR: $${ind.atr14.toFixed(2)}).`,
        'Signal suppressed to protect execution quality.',
      ],
      symbol,
    );
  }

  const reasonsForBuy: string[] = [];
  const reasonsAgainstBuy: string[] = [];
  const reasonsForSell: string[] = [];
  const reasonsAgainstSell: string[] = [];

  let buyConfirmations = 0;
  let sellConfirmations = 0;

  // Pillar 1: Multi-EMA Trend Stack (EMA 9, 21, 50, 200)
  const bullEmaStack =
    lastCandle.close > ind.ema200 && ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50;
  const bearEmaStack =
    lastCandle.close < ind.ema200 && ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50;

  if (bullEmaStack) {
    buyConfirmations++;
    reasonsForBuy.push(
      `Bullish EMA alignment: price (${lastCandle.close.toFixed(2)}) above EMA 200 (${ind.ema200.toFixed(2)}) with EMA 9 > 21 > 50.`,
    );
    reasonsAgainstSell.push('Price and EMA 9/21/50 are aligned bullish above EMA 200.');
  } else if (bearEmaStack) {
    sellConfirmations++;
    reasonsForSell.push(
      `Bearish EMA alignment: price (${lastCandle.close.toFixed(2)}) below EMA 200 (${ind.ema200.toFixed(2)}) with EMA 9 < 21 < 50.`,
    );
    reasonsAgainstBuy.push('Price and EMA 9/21/50 are aligned bearish below EMA 200.');
  } else {
    reasonsAgainstBuy.push('EMAs 9/21/50/200 are not in full bullish alignment.');
    reasonsAgainstSell.push('EMAs 9/21/50/200 are not in full bearish alignment.');
  }

  // Pillar 2: Market Structure (BOS / CHOCH / HH-HL vs LH-LL)
  const bullStructure =
    structure.trend === 'BULLISH' ||
    structure.lastBOS?.direction === 'BULLISH' ||
    structure.lastCHOCH?.direction === 'BULLISH';
  const bearStructure =
    structure.trend === 'BEARISH' ||
    structure.lastBOS?.direction === 'BEARISH' ||
    structure.lastCHOCH?.direction === 'BEARISH';

  if (bullStructure && structure.lastCHOCH?.direction !== 'BEARISH') {
    buyConfirmations++;
    const tag = structure.lastBOS?.direction === 'BULLISH'
      ? `Bullish BOS above ${structure.lastBOS.price.toFixed(2)}`
      : structure.lastCHOCH?.direction === 'BULLISH'
        ? `Bullish CHOCH above ${structure.lastCHOCH.price.toFixed(2)}`
        : structure.label;
    reasonsForBuy.push(`Market structure supports upside: ${tag}.`);
    reasonsAgainstSell.push(`Market structure shows bullish bias (${structure.label}).`);
  } else if (bearStructure && structure.lastCHOCH?.direction !== 'BULLISH') {
    sellConfirmations++;
    const tag = structure.lastBOS?.direction === 'BEARISH'
      ? `Bearish BOS below ${structure.lastBOS.price.toFixed(2)}`
      : structure.lastCHOCH?.direction === 'BEARISH'
        ? `Bearish CHOCH below ${structure.lastCHOCH.price.toFixed(2)}`
        : structure.label;
    reasonsForSell.push(`Market structure supports downside: ${tag}.`);
    reasonsAgainstBuy.push(`Market structure shows bearish bias (${structure.label}).`);
  } else {
    reasonsAgainstBuy.push(`Market structure is ${structure.label.toLowerCase()}.`);
    reasonsAgainstSell.push(`Market structure is ${structure.label.toLowerCase()}.`);
  }

  // Pillar 3: Momentum Confirmation (MACD + RSI non-countertrend zone)
  // Explicitly avoids buying solely because RSI is low or selling solely because RSI is high
  const macdBull =
    ind.macdMain > ind.macdSignal &&
    ind.macdHist > 0 &&
    (prevHist === null || ind.macdHist >= prevHist);
  const macdBear =
    ind.macdMain < ind.macdSignal &&
    ind.macdHist < 0 &&
    (prevHist === null || ind.macdHist <= prevHist);

  const rsiBullMomentum = ind.rsi14 >= 48 && ind.rsi14 <= 68;
  const rsiBearMomentum = ind.rsi14 <= 52 && ind.rsi14 >= 32;

  if (macdBull && rsiBullMomentum) {
    buyConfirmations++;
    reasonsForBuy.push(
      `Momentum confirmed: MACD above signal with expanding positive histogram and RSI(14) at ${ind.rsi14.toFixed(1)} (healthy bullish zone, not overextended).`,
    );
  } else {
    if (!macdBull) {
      reasonsAgainstBuy.push('MACD is not showing expanding bullish momentum.');
    }
    if (ind.rsi14 > 68) {
      reasonsAgainstBuy.push(`RSI(14) at ${ind.rsi14.toFixed(1)} is extended near overbought — avoids chasing highs.`);
    } else if (ind.rsi14 < 48) {
      reasonsAgainstBuy.push(`RSI(14) at ${ind.rsi14.toFixed(1)} lacks bullish momentum confirmation.`);
    }
  }

  if (macdBear && rsiBearMomentum) {
    sellConfirmations++;
    reasonsForSell.push(
      `Momentum confirmed: MACD below signal with expanding negative histogram and RSI(14) at ${ind.rsi14.toFixed(1)} (healthy bearish zone, not oversold).`,
    );
  } else {
    if (!macdBear) {
      reasonsAgainstSell.push('MACD is not showing expanding bearish momentum.');
    }
    if (ind.rsi14 < 32) {
      reasonsAgainstSell.push(`RSI(14) at ${ind.rsi14.toFixed(1)} is extended near oversold — avoids chasing lows.`);
    } else if (ind.rsi14 > 52) {
      reasonsAgainstSell.push(`RSI(14) at ${ind.rsi14.toFixed(1)} lacks bearish momentum confirmation.`);
    }
  }

  // Pillar 4: Volatility & Bollinger Bands entry location (avoid buying into upper BB extreme / selling into lower BB extreme)
  const atrPct = (ind.atr14 / lastCandle.close) * 100;
  const healthyVolatility = atrPct >= 0.02 && atrPct <= 1.2;
  const notUpperExtreme = lastCandle.close <= ind.bbUpper - ind.atr14 * 0.15;
  const notLowerExtreme = lastCandle.close >= ind.bbLower + ind.atr14 * 0.15;

  if (healthyVolatility && notUpperExtreme && lastCandle.close >= ind.bbMiddle) {
    buyConfirmations++;
    reasonsForBuy.push(
      `Volatility & Bollinger location valid: ATR(14) $${ind.atr14.toFixed(2)}, price holding above BB mid ($${ind.bbMiddle.toFixed(2)}) with room to upper band.`,
    );
  } else {
    reasonsAgainstBuy.push(
      !healthyVolatility
        ? `ATR volatility ($${ind.atr14.toFixed(2)}) outside orderly range.`
        : 'Price is either below Bollinger midline or stretched against the upper band.',
    );
  }

  if (healthyVolatility && notLowerExtreme && lastCandle.close <= ind.bbMiddle) {
    sellConfirmations++;
    reasonsForSell.push(
      `Volatility & Bollinger location valid: ATR(14) $${ind.atr14.toFixed(2)}, price holding below BB mid ($${ind.bbMiddle.toFixed(2)}) with room to lower band.`,
    );
  } else {
    reasonsAgainstSell.push(
      !healthyVolatility
        ? `ATR volatility ($${ind.atr14.toFixed(2)}) outside orderly range.`
        : 'Price is either above Bollinger midline or stretched against the lower band.',
    );
  }

  // Pillar 5: Higher-Timeframe Trend Alignment
  const htfList = getHigherTimeframes(timeframe);
  let htfConflictBuy = false;
  let htfConflictSell = false;
  let htfAgreeBuy = 0;
  let htfAgreeSell = 0;

  for (const htf of htfList) {
    const bias = evaluateHigherTimeframeBias(candlesByTimeframe[htf]);
    if (bias === 'BULLISH') {
      htfAgreeBuy++;
      htfConflictSell = true;
      reasonsForBuy.push(`Higher timeframe ${htf} trend aligns bullish.`);
      reasonsAgainstSell.push(`Conflicting higher timeframe: ${htf} is bullish.`);
    } else if (bias === 'BEARISH') {
      htfAgreeSell++;
      htfConflictBuy = true;
      reasonsForSell.push(`Higher timeframe ${htf} trend aligns bearish.`);
      reasonsAgainstBuy.push(`Conflicting higher timeframe: ${htf} is bearish.`);
    } else if (bias === 'NEUTRAL') {
      reasonsAgainstBuy.push(`Higher timeframe ${htf} is neutral/consolidating.`);
      reasonsAgainstSell.push(`Higher timeframe ${htf} is neutral/consolidating.`);
    } else {
      reasonsAgainstBuy.push(`Higher timeframe ${htf} lacks sufficient candle history.`);
      reasonsAgainstSell.push(`Higher timeframe ${htf} lacks sufficient candle history.`);
    }
  }

  if (htfList.length === 0 || (htfAgreeBuy > 0 && !htfConflictBuy)) {
    buyConfirmations++;
  }
  if (htfList.length === 0 || (htfAgreeSell > 0 && !htfConflictSell)) {
    sellConfirmations++;
  }

  // Decide candidate direction (strictly require >= 5 confirmations and zero HTF conflict)
  let candidate: SignalDirection = 'WAIT';
  if (buyConfirmations >= 5 && !htfConflictBuy && buyConfirmations > sellConfirmations) {
    candidate = 'BUY';
  } else if (sellConfirmations >= 5 && !htfConflictSell && sellConfirmations > buyConfirmations) {
    candidate = 'SELL';
  }

  if (candidate === 'WAIT') {
    const combinedAgainst = Array.from(
      new Set(
        buyConfirmations >= sellConfirmations
          ? [
              `Insufficient independent confirmations (${Math.max(buyConfirmations, sellConfirmations)}/5 required).`,
              ...reasonsAgainstBuy.slice(0, 4),
            ]
          : [
              `Insufficient independent confirmations (${Math.max(buyConfirmations, sellConfirmations)}/5 required).`,
              ...reasonsAgainstSell.slice(0, 4),
            ],
      ),
    );
    const combinedFor = buyConfirmations >= sellConfirmations ? reasonsForBuy : reasonsForSell;
    const partialScore = Math.round((Math.max(buyConfirmations, sellConfirmations) / 6) * 100);
    return buildWaitSignal(
      timeframe,
      nowMs,
      dataQualityScore,
      partialScore,
      combinedFor,
      combinedAgainst,
      symbol,
    );
  }

  // Calculate Entry, Stop Loss, TP1, TP2, and verify R:R & S/R clearance
  const digits = snapshot.digits ?? 2;
  const roundPrice = (v: number) => Number(v.toFixed(digits));

  const entryPrice = candidate === 'BUY' ? snapshot.ask : snapshot.bid;
  const zonePad = Math.max(ind.atr14 * 0.15, snapshot.spread);
  const entryZone = {
    min: roundPrice(entryPrice - zonePad),
    max: roundPrice(entryPrice + zonePad),
  };

  let stopLoss: number;
  if (candidate === 'BUY') {
    const atrSl = entryPrice - ind.atr14 * 1.5;
    const swingSl =
      structure.recentSwingLow !== null && structure.recentSwingLow < entryPrice
        ? structure.recentSwingLow - ind.atr14 * 0.35
        : atrSl;
    // Choose tighter protective structural SL bounded by [1.0*ATR, 2.5*ATR]
    const rawSl = Math.max(entryPrice - ind.atr14 * 2.5, Math.min(entryPrice - ind.atr14 * 1.1, swingSl));
    stopLoss = roundPrice(rawSl);
  } else {
    const atrSl = entryPrice + ind.atr14 * 1.5;
    const swingSl =
      structure.recentSwingHigh !== null && structure.recentSwingHigh > entryPrice
        ? structure.recentSwingHigh + ind.atr14 * 0.35
        : atrSl;
    const rawSl = Math.min(entryPrice + ind.atr14 * 2.5, Math.max(entryPrice + ind.atr14 * 1.1, swingSl));
    stopLoss = roundPrice(rawSl);
  }

  const slDistance = Math.abs(entryPrice - stopLoss);

  // Fail-safe 7: Risk cannot be reliably calculated if SL distance is too narrow
  if (!Number.isFinite(slDistance) || slDistance <= snapshot.spread * 2.5 || slDistance <= 0) {
    return buildWaitSignal(
      timeframe,
      nowMs,
      dataQualityScore,
      0,
      candidate === 'BUY' ? reasonsForBuy : reasonsForSell,
      ['Risk calculation rejected: Stop Loss distance is invalid or too close to current spread.'],
      symbol,
    );
  }

  // Pillar 6: S/R clearance check — reject if nearest opposing S/R blocks < 1.5R
  const nearestResistance = srLevels
    .filter((l) => l.type === 'RESISTANCE' && l.price > entryPrice)
    .sort((a, b) => a.price - b.price)[0];
  const nearestSupport = srLevels
    .filter((l) => l.type === 'SUPPORT' && l.price < entryPrice)
    .sort((a, b) => b.price - a.price)[0];

  if (candidate === 'BUY' && nearestResistance) {
    const room = nearestResistance.price - entryPrice;
    if (room < slDistance * 1.25) {
      return buildWaitSignal(
        timeframe,
        nowMs,
        dataQualityScore,
        Math.round((buyConfirmations / 6) * 100),
        reasonsForBuy,
        [
          ...reasonsAgainstBuy,
          `Immediate resistance at $${nearestResistance.price.toFixed(2)} limits upside R:R below 1.25:1.`,
        ],
        symbol,
      );
    }
    buyConfirmations++;
    reasonsForBuy.push(
      `Clearance to nearest resistance ($${nearestResistance.price.toFixed(2)}) provides favorable R:R.`,
    );
  } else if (candidate === 'SELL' && nearestSupport) {
    const room = entryPrice - nearestSupport.price;
    if (room < slDistance * 1.25) {
      return buildWaitSignal(
        timeframe,
        nowMs,
        dataQualityScore,
        Math.round((sellConfirmations / 6) * 100),
        reasonsForSell,
        [
          ...reasonsAgainstSell,
          `Immediate support at $${nearestSupport.price.toFixed(2)} limits downside R:R below 1.25:1.`,
        ],
        symbol,
      );
    }
    sellConfirmations++;
    reasonsForSell.push(
      `Clearance to nearest support ($${nearestSupport.price.toFixed(2)}) provides favorable R:R.`,
    );
  } else {
    if (candidate === 'BUY') {
      buyConfirmations++;
      reasonsForBuy.push('No immediate overhead resistance cluster restricting target.');
    } else {
      sellConfirmations++;
      reasonsForSell.push('No immediate support cluster obstructing downside target.');
    }
  }

  const tp1 = roundPrice(
    candidate === 'BUY' ? entryPrice + slDistance * 1.5 : entryPrice - slDistance * 1.5,
  );
  const tp2 = roundPrice(
    candidate === 'BUY' ? entryPrice + slDistance * 2.5 : entryPrice - slDistance * 2.5,
  );

  const rr1 = Number((Math.abs(tp1 - entryPrice) / slDistance).toFixed(2));
  const rr2 = Number((Math.abs(tp2 - entryPrice) / slDistance).toFixed(2));

  if (rr1 < 1.5) {
    return buildWaitSignal(
      timeframe,
      nowMs,
      dataQualityScore,
      0,
      [],
      ['Calculated Risk-to-Reward ratio is below 1.5:1 minimum threshold.'],
      symbol,
    );
  }

  const activeScore = Math.min(
    100,
    Math.round(((candidate === 'BUY' ? buyConfirmations : sellConfirmations) / 6) * 100),
  );

  const reasonsFor = candidate === 'BUY' ? reasonsForBuy : reasonsForSell;
  const reasonsAgainst =
    (candidate === 'BUY' ? reasonsAgainstBuy : reasonsAgainstSell).length > 0
      ? candidate === 'BUY'
        ? reasonsAgainstBuy
        : reasonsAgainstSell
      : ['Monitor live spread and upcoming macro news; no directional setup is guaranteed.'];

  return {
    id: `${symbol}-${timeframe}-${candidate}-${lastCandle.time}`,
    symbol,
    timeframe,
    direction: candidate,
    timestamp: nowMs,
    entryPrice: roundPrice(entryPrice),
    entryZone,
    stopLoss,
    takeProfit1: tp1,
    takeProfit2: tp2,
    riskReward1: rr1,
    riskReward2: rr2,
    confirmationScore: activeScore,
    dataQualityScore,
    reasonsFor,
    reasonsAgainst,
    status: 'PENDING_VERIFICATION',
    verifiedAt: null,
  };
}

export function verifySignalWithCandles(
  signal: TradeSignal,
  candles: Candle[],
): TradeSignal {
  if (signal.direction === 'WAIT' || signal.stopLoss === null || signal.takeProfit1 === null) {
    return signal;
  }

  const signalSec = Math.floor(signal.timestamp / 1000);
  const subsequent = candles.filter((c) => c.time > signalSec);

  if (subsequent.length === 0) {
    return {
      ...signal,
      status: signal.status === 'NOT_APPLICABLE' ? 'PENDING_VERIFICATION' : signal.status,
      verificationNote: 'Awaiting subsequent closed candles to verify outcome.',
    };
  }

  let tp1Reached = false;
  for (const bar of subsequent) {
    if (signal.direction === 'BUY') {
      const hitSL = bar.low <= signal.stopLoss;
      const hitTP2 = signal.takeProfit2 !== null && bar.high >= signal.takeProfit2;
      const hitTP1 = bar.high >= signal.takeProfit1;

      if (hitSL && (hitTP1 || hitTP2)) {
        // Ambiguous intrabar sequence without tick data — mark conservative SL or stop if not already TP1
        return {
          ...signal,
          status: tp1Reached ? 'TP1_HIT' : 'SL_HIT',
          verifiedAt: bar.time * 1000,
          verificationNote: `Verified from ${signal.timeframe} candle at ${new Date(bar.time * 1000).toISOString()}.`,
        };
      }
      if (hitSL) {
        return {
          ...signal,
          status: tp1Reached ? 'TP1_HIT' : 'SL_HIT',
          verifiedAt: bar.time * 1000,
          verificationNote: `Stop Loss ($${signal.stopLoss.toFixed(2)}) reached on real candle data.`,
        };
      }
      if (hitTP2) {
        return {
          ...signal,
          status: 'TP2_HIT',
          verifiedAt: bar.time * 1000,
          verificationNote: `Take Profit 2 ($${signal.takeProfit2?.toFixed(2)}) reached on real candle data.`,
        };
      }
      if (hitTP1) {
        tp1Reached = true;
      }
    } else if (signal.direction === 'SELL') {
      const hitSL = bar.high >= signal.stopLoss;
      const hitTP2 = signal.takeProfit2 !== null && bar.low <= signal.takeProfit2;
      const hitTP1 = bar.low <= signal.takeProfit1;

      if (hitSL && (hitTP1 || hitTP2)) {
        return {
          ...signal,
          status: tp1Reached ? 'TP1_HIT' : 'SL_HIT',
          verifiedAt: bar.time * 1000,
          verificationNote: `Verified from ${signal.timeframe} candle at ${new Date(bar.time * 1000).toISOString()}.`,
        };
      }
      if (hitSL) {
        return {
          ...signal,
          status: tp1Reached ? 'TP1_HIT' : 'SL_HIT',
          verifiedAt: bar.time * 1000,
          verificationNote: `Stop Loss ($${signal.stopLoss.toFixed(2)}) reached on real candle data.`,
        };
      }
      if (hitTP2) {
        return {
          ...signal,
          status: 'TP2_HIT',
          verifiedAt: bar.time * 1000,
          verificationNote: `Take Profit 2 ($${signal.takeProfit2?.toFixed(2)}) reached on real candle data.`,
        };
      }
      if (hitTP1) {
        tp1Reached = true;
      }
    }
  }

  if (tp1Reached) {
    return {
      ...signal,
      status: 'TP1_HIT',
      verifiedAt: subsequent[subsequent.length - 1].time * 1000,
      verificationNote: `Take Profit 1 ($${signal.takeProfit1.toFixed(2)}) reached; monitoring TP2.`,
    };
  }

  return {
    ...signal,
    status: 'PENDING_VERIFICATION',
    verificationNote: `Evaluated across ${subsequent.length} subsequent candles; neither SL nor TP hit yet.`,
  };
}
