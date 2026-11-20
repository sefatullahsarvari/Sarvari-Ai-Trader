import assert from 'node:assert/strict';
import {
  analyzeMarketStructure,
  calculateATR,
  calculateBollingerBands,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  extractLatestIndicators,
} from '../src/lib/indicators.ts';
import { generateTradeSignal } from '../src/lib/signalEngine.ts';
import { calculateGoldRisk, DEFAULT_XM_GOLD_SPECS } from '../src/lib/riskCalculator.ts';
import { constantTimeEqual, validateBridgePayload } from '../src/lib/validation.ts';
import type { Candle, MarketSnapshot } from '../src/types/market.ts';

function makeDeterministicSeries(count: number, startPrice: number, step: number): Candle[] {
  const out: Candle[] = [];
  const baseTime = Math.floor(Date.now() / 1000) - count * 900;
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i * 0.25) * 1.2;
    const open = Number((startPrice + i * step + wave).toFixed(2));
    const close = Number((open + step * 0.8 + 0.35).toFixed(2));
    const high = Number((Math.max(open, close) + 1.1).toFixed(2));
    const low = Number((Math.min(open, close) - 0.9).toFixed(2));
    out.push({
      time: baseTime + i * 900,
      open,
      high,
      low,
      close,
      volume: 100 + (i % 50),
    });
  }
  return out;
}

console.log('Running SA AI TRADER verification suite...');

// 1. Indicators return null when insufficient candles exist (never invented)
const shortCandles = makeDeterministicSeries(20, 2600, 0.2);
const shortInd = extractLatestIndicators(shortCandles);
assert.equal(shortInd.ema50, null, 'EMA 50 must be null with only 20 candles');
assert.equal(shortInd.ema200, null, 'EMA 200 must be null with only 20 candles');

// 2. Full indicator math on 240 candles
const candles240 = makeDeterministicSeries(240, 2600, 0.25);
const closes = candles240.map((c) => c.close);
const ema200 = calculateEMA(closes, 200);
const rsi14 = calculateRSI(closes, 14);
const macd = calculateMACD(closes);
const atr14 = calculateATR(candles240, 14);
const bb = calculateBollingerBands(closes, 20, 2);

assert.ok(ema200[239] !== null, 'EMA 200 should be computed at bar 239');
assert.ok(rsi14[239] !== null && rsi14[239]! >= 0 && rsi14[239]! <= 100, 'RSI within 0-100');
assert.ok(macd.macd[239] !== null && macd.signal[239] !== null, 'MACD computed');
assert.ok(atr14[239] !== null && atr14[239]! > 0, 'ATR > 0');
assert.ok(bb.upper[239]! > bb.lower[239]!, 'BB upper > lower');

const structure = analyzeMarketStructure(candles240);
assert.ok(['BULLISH', 'BEARISH', 'RANGING', 'UNCLEAR'].includes(structure.trend));

// 3. Fail-safe signal engine checks
const now = Date.now();
const disconnectedSig = generateTradeSignal({
  snapshot: null,
  timeframe: 'M15',
  candlesByTimeframe: { M15: candles240 },
  nowMs: now,
});
assert.equal(disconnectedSig.direction, 'WAIT', 'Must output WAIT when disconnected');

const staleSnapshot: MarketSnapshot = {
  symbol: 'GOLD',
  broker: 'XM',
  bid: 2660.1,
  ask: 2660.35,
  spread: 0.25,
  spreadPoints: 25,
  digits: 2,
  point: 0.01,
  serverTime: '2026-11-20 12:00:00',
  serverTimestamp: now - 15_000,
  receivedAt: now - 15_000, // 15s old (> 10s limit)
  source: 'mt5-ea-bridge',
  lastCandleTimes: {},
};
const staleSig = generateTradeSignal({
  snapshot: staleSnapshot,
  timeframe: 'M15',
  candlesByTimeframe: { M15: candles240 },
  nowMs: now,
});
assert.equal(staleSig.direction, 'WAIT', 'Must output WAIT when snapshot > 10s old');

const wideSpreadSnapshot: MarketSnapshot = {
  ...staleSnapshot,
  ask: 2661.5,
  spread: 1.4,
  spreadPoints: 140,
  receivedAt: now - 1_000,
};
const wideSpreadSig = generateTradeSignal({
  snapshot: wideSpreadSnapshot,
  timeframe: 'M15',
  candlesByTimeframe: { M15: candles240, H1: candles240, H4: candles240 },
  nowMs: now,
});
assert.equal(wideSpreadSig.direction, 'WAIT', 'Must reject excessive spread');

// 4. Risk calculator checks
const riskOk = calculateGoldRisk({
  accountBalance: 1000,
  riskPercent: 1,
  entryPrice: 2650.0,
  stopLossPrice: 2645.0,
  takeProfit1Price: 2657.5,
  specs: DEFAULT_XM_GOLD_SPECS,
});
assert.equal(riskOk.valid, true);
assert.equal(riskOk.recommendedLots, 0.02, '$10 risk / ($5 * 100) = 0.02 lots');

const riskTooSmall = calculateGoldRisk({
  accountBalance: 100,
  riskPercent: 1,
  entryPrice: 2650.0,
  stopLossPrice: 2640.0, // $10 SL -> 0.001 lots (< 0.01 minVolume)
  specs: DEFAULT_XM_GOLD_SPECS,
});
assert.equal(riskTooSmall.valid, false, 'Must refuse lot size below minVolume');

// 5. Validation & constant-time token checks
assert.equal(constantTimeEqual('secret-abc', 'secret-abc'), true);
assert.equal(constantTimeEqual('secret-abc', 'secret-xyz'), false);

const badPayload = validateBridgePayload({
  symbol: 'GOLD',
  bid: 2650.5,
  ask: 2650.0, // invalid ask < bid
  serverTime: '2026-11-20 12:00:00',
  serverTimestamp: Math.floor(now / 1000),
  candles: { M15: candles240 },
});
assert.equal(badPayload.ok, false, 'Reject ask < bid');

const validPayload = validateBridgePayload({
  symbol: 'GOLD',
  bid: 2650.0,
  ask: 2650.25,
  serverTime: '2026-11-20 12:00:00',
  serverTimestamp: Math.floor(now / 1000),
  candles: { M15: candles240 },
});
assert.equal(validPayload.ok, true, 'Accept valid MT5 bridge payload');

console.log('All SA AI TRADER verification tests passed.');
