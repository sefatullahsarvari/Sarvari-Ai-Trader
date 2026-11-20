export const SUPPORTED_TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'] as const;

export type Timeframe = (typeof SUPPORTED_TIMEFRAMES)[number];

export interface Candle {
  time: number; // Unix timestamp in seconds (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface MT5ReportedIndicators {
  ema9?: number | null;
  ema21?: number | null;
  ema50?: number | null;
  ema200?: number | null;
  rsi14?: number | null;
  macdMain?: number | null;
  macdSignal?: number | null;
  macdHist?: number | null;
  atr14?: number | null;
}

export interface MarketSnapshot {
  symbol: string;
  broker: string;
  bid: number;
  ask: number;
  spread: number;
  spreadPoints: number;
  digits: number;
  point: number;
  serverTime: string;
  serverTimestamp: number; // Broker server epoch seconds or ms normalized to ms
  receivedAt: number; // Server receipt timestamp in ms
  source: string;
  lastCandleTimes: Partial<Record<Timeframe, number>>;
  mt5Indicators?: Partial<Record<Timeframe, MT5ReportedIndicators>>;
}

export interface BridgeIngestPayload {
  symbol: string;
  broker?: string;
  bid: number;
  ask: number;
  spread?: number;
  digits?: number;
  point?: number;
  serverTime: string;
  serverTimestamp: number;
  candles: Partial<Record<Timeframe, Candle[]>>;
  indicators?: Partial<Record<Timeframe, MT5ReportedIndicators>>;
}

export type SignalDirection = 'BUY' | 'SELL' | 'WAIT';

export type SignalVerificationStatus =
  | 'PENDING_VERIFICATION'
  | 'TP1_HIT'
  | 'TP2_HIT'
  | 'SL_HIT'
  | 'INSUFFICIENT_DATA'
  | 'NOT_APPLICABLE';

export interface EntryZone {
  min: number;
  max: number;
}

export interface TradeSignal {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  direction: SignalDirection;
  timestamp: number;
  entryPrice: number | null;
  entryZone: EntryZone | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  riskReward1: number | null;
  riskReward2: number | null;
  confirmationScore: number; // Technical rule alignment (0-100), NOT win probability
  dataQualityScore: number; // Data completeness and freshness (0-100)
  reasonsFor: string[];
  reasonsAgainst: string[];
  status: SignalVerificationStatus;
  verifiedAt?: number | null;
  verificationNote?: string;
}

export interface SupportResistanceLevel {
  price: number;
  type: 'SUPPORT' | 'RESISTANCE';
  strength: number;
  lastTouchedTime: number;
}

export interface StructureEvent {
  type: 'BOS' | 'CHOCH';
  direction: 'BULLISH' | 'BEARISH';
  price: number;
  time: number;
}

export interface MarketStructureSummary {
  trend: 'BULLISH' | 'BEARISH' | 'RANGING' | 'UNCLEAR';
  label: string;
  lastBOS: StructureEvent | null;
  lastCHOCH: StructureEvent | null;
  recentSwingHigh: number | null;
  recentSwingLow: number | null;
}

export interface IndicatorSnapshot {
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  ema200: number | null;
  rsi14: number | null;
  macdMain: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  atr14: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  bbBandwidth: number | null;
}

export interface IndicatorSeries {
  ema9: (number | null)[];
  ema21: (number | null)[];
  ema50: (number | null)[];
  ema200: (number | null)[];
  rsi14: (number | null)[];
  macdMain: (number | null)[];
  macdSignal: (number | null)[];
  macdHist: (number | null)[];
  atr14: (number | null)[];
  bbUpper: (number | null)[];
  bbMiddle: (number | null)[];
  bbLower: (number | null)[];
}

export interface MarketLatestResponse {
  snapshot: MarketSnapshot | null;
  connectionStatus: 'CONNECTED' | 'STALE' | 'DISCONNECTED';
  ageMs: number | null;
  staleThresholdMs: number;
  candleCounts: Partial<Record<Timeframe, number>>;
  serverNow: number;
}

export interface MarketCandlesResponse {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
  lastCandleTime: number | null;
  source: string;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
  timestamp: number;
  bridgeAuthConfigured: boolean;
  hasSnapshot: boolean;
  lastUpdateAt: number | null;
  connectionStatus: 'CONNECTED' | 'STALE' | 'DISCONNECTED';
  storageMode: string;
}

export interface XMContractSpecs {
  contractSize: number;
  minVolume: number;
  volumeStep: number;
  tickSize: number;
  tickValue: number;
}
