import {
  SUPPORTED_TIMEFRAMES,
  type BridgeIngestPayload,
  type Candle,
  type MT5ReportedIndicators,
  type Timeframe,
} from '../types/market.ts';

export const MAX_ALLOWED_INGEST_AGE_MS = 60_000;
export const FRESHNESS_THRESHOLD_MS = 10_000;
export const MAX_CANDLES_PER_TIMEFRAME = 500;

export function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isValidTimeframe(value: unknown): value is Timeframe {
  return typeof value === 'string' && (SUPPORTED_TIMEFRAMES as readonly string[]).includes(value);
}

export function normalizeTimestampToMs(raw: number): number {
  // If timestamp looks like Unix seconds (< 10^11), convert to ms
  return raw < 100_000_000_000 ? raw * 1000 : raw;
}

export function normalizeCandleTimeToSeconds(raw: number): number {
  return raw > 100_000_000_000 ? Math.floor(raw / 1000) : Math.floor(raw);
}

export function validateCandle(raw: unknown): Candle | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const c = raw as Record<string, unknown>;
  if (
    !isFinitePositive(c.time) ||
    !isFinitePositive(c.open) ||
    !isFinitePositive(c.high) ||
    !isFinitePositive(c.low) ||
    !isFinitePositive(c.close)
  ) {
    return null;
  }

  const maxOC = Math.max(c.open, c.close);
  const minOC = Math.min(c.open, c.close);
  if (c.high < maxOC || c.low > minOC || c.high < c.low) {
    return null;
  }

  let volume: number | undefined;
  if (c.volume !== undefined && c.volume !== null) {
    if (!isFiniteNonNegative(c.volume)) {
      return null;
    }
    volume = c.volume;
  }

  return {
    time: normalizeCandleTimeToSeconds(c.time),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
    ...(volume !== undefined ? { volume } : {}),
  };
}

function validateReportedIndicators(raw: unknown): MT5ReportedIndicators | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const out: MT5ReportedIndicators = {};
  const keys: (keyof MT5ReportedIndicators)[] = [
    'ema9',
    'ema21',
    'ema50',
    'ema200',
    'rsi14',
    'macdMain',
    'macdSignal',
    'macdHist',
    'atr14',
  ];

  for (const key of keys) {
    const val = obj[key];
    if (val === undefined || val === null) {
      continue;
    }
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      return null;
    }
    out[key] = val;
  }

  return out;
}

export interface ValidationResult {
  ok: true;
  data: {
    symbol: string;
    broker: string;
    bid: number;
    ask: number;
    spread: number;
    spreadPoints: number;
    digits: number;
    point: number;
    serverTime: string;
    serverTimestampMs: number;
    candles: Partial<Record<Timeframe, Candle[]>>;
    indicators: Partial<Record<Timeframe, MT5ReportedIndicators>>;
  };
}

export interface ValidationError {
  ok: false;
  error: string;
}

export function validateBridgePayload(
  raw: unknown,
  nowMs: number = Date.now(),
): ValidationResult | ValidationError {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  const body = raw as Record<string, unknown>;

  if (typeof body.symbol !== 'string' || body.symbol.trim().length === 0) {
    return { ok: false, error: 'Missing or invalid symbol.' };
  }

  const cleanSymbol = body.symbol.trim().toUpperCase();
  if (!['GOLD', 'XAUUSD', 'GOLDMICRO', 'XAUUSD.M', 'XAUUSD_M'].includes(cleanSymbol)) {
    return {
      ok: false,
      error: `Unsupported symbol "${cleanSymbol}". Expected GOLD / XAUUSD from XM.`,
    };
  }

  const broker =
    typeof body.broker === 'string' && body.broker.trim().length > 0
      ? body.broker.trim().slice(0, 40)
      : 'XM';

  if (!isFinitePositive(body.bid) || !isFinitePositive(body.ask)) {
    return { ok: false, error: 'Invalid bid or ask price. Must be finite positive numbers.' };
  }

  if (body.ask < body.bid) {
    return { ok: false, error: 'Malformed quote: ask price cannot be lower than bid price.' };
  }

  // Sanity price bounds for XAUUSD/GOLD to reject corrupt numbers (e.g. 0 or 1000000)
  if (body.bid < 500 || body.ask > 25000) {
    return { ok: false, error: 'Quote price outside realistic XAUUSD/GOLD bounds.' };
  }

  const digits =
    typeof body.digits === 'number' && Number.isInteger(body.digits) && body.digits >= 0 && body.digits <= 5
      ? body.digits
      : 2;
  const point = isFinitePositive(body.point) && body.point <= 1 ? body.point : Math.pow(10, -digits);
  const computedSpread = Number((body.ask - body.bid).toFixed(digits));
  const spread =
    isFiniteNonNegative(body.spread) && Math.abs(body.spread - computedSpread) <= Math.max(0.05, point * 5)
      ? Number(body.spread.toFixed(digits))
      : computedSpread;
  const spreadPoints = Math.round(spread / point);

  if (typeof body.serverTime !== 'string' || body.serverTime.trim().length === 0) {
    return { ok: false, error: 'Missing broker serverTime string.' };
  }

  if (!isFinitePositive(body.serverTimestamp)) {
    return { ok: false, error: 'Missing or invalid numeric serverTimestamp.' };
  }

  const serverTimestampMs = normalizeTimestampToMs(body.serverTimestamp);
  // Allow reasonable clock drift for broker server timezone differences (up to 12h ahead/behind)
  // while relying on server receipt time (`receivedAt`) for strict 10-second freshness checks.
  if (Math.abs(nowMs - serverTimestampMs) > 24 * 60 * 60 * 1000) {
    return { ok: false, error: 'Rejected timestamp: serverTimestamp is more than 24 hours out of range.' };
  }

  if (!body.candles || typeof body.candles !== 'object') {
    return { ok: false, error: 'Missing candles object keyed by timeframe.' };
  }

  const rawCandles = body.candles as Record<string, unknown>;
  const validatedCandles: Partial<Record<Timeframe, Candle[]>> = {};
  let totalAcceptedCandles = 0;

  for (const tf of SUPPORTED_TIMEFRAMES) {
    const arr = rawCandles[tf];
    if (arr === undefined) {
      continue;
    }
    if (!Array.isArray(arr)) {
      return { ok: false, error: `Candles for timeframe ${tf} must be an array.` };
    }
    if (arr.length > MAX_CANDLES_PER_TIMEFRAME) {
      return {
        ok: false,
        error: `Too many candles for ${tf} (max ${MAX_CANDLES_PER_TIMEFRAME}).`,
      };
    }

    const validList: Candle[] = [];
    for (let i = 0; i < arr.length; i++) {
      const candle = validateCandle(arr[i]);
      if (!candle) {
        return { ok: false, error: `Malformed OHLC candle at ${tf}[${i}].` };
      }
      validList.push(candle);
    }

    // Sort ascending by time and deduplicate identical candle timestamps
    validList.sort((a, b) => a.time - b.time);
    const deduped: Candle[] = [];
    for (const c of validList) {
      if (deduped.length > 0 && deduped[deduped.length - 1].time === c.time) {
        deduped[deduped.length - 1] = c;
      } else {
        deduped.push(c);
      }
    }

    validatedCandles[tf] = deduped;
    totalAcceptedCandles += deduped.length;
  }

  if (totalAcceptedCandles === 0) {
    return { ok: false, error: 'Payload must contain valid OHLC candles for at least one timeframe.' };
  }

  const validatedIndicators: Partial<Record<Timeframe, MT5ReportedIndicators>> = {};
  if (body.indicators && typeof body.indicators === 'object') {
    const rawInd = body.indicators as Record<string, unknown>;
    for (const tf of SUPPORTED_TIMEFRAMES) {
      if (rawInd[tf] !== undefined) {
        const parsed = validateReportedIndicators(rawInd[tf]);
        if (!parsed) {
          return { ok: false, error: `Malformed indicator values for ${tf}.` };
        }
        validatedIndicators[tf] = parsed;
      }
    }
  }

  return {
    ok: true,
    data: {
      symbol: cleanSymbol === 'XAUUSD' ? 'GOLD' : cleanSymbol,
      broker,
      bid: body.bid,
      ask: body.ask,
      spread,
      spreadPoints,
      digits,
      point,
      serverTime: body.serverTime.trim().slice(0, 64),
      serverTimestampMs,
      candles: validatedCandles,
      indicators: validatedIndicators,
    },
  };
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export type BridgePayloadInput = BridgeIngestPayload;
