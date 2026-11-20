-- SA AI TRADER - Cloudflare D1 Database Schema
-- Stores verified XM MT5 market snapshots, OHLC candle history, and server-verified signals.

CREATE TABLE IF NOT EXISTS market_snapshots (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  symbol TEXT NOT NULL,
  broker TEXT NOT NULL,
  bid REAL NOT NULL,
  ask REAL NOT NULL,
  spread REAL NOT NULL,
  spread_points INTEGER NOT NULL,
  digits INTEGER NOT NULL,
  point REAL NOT NULL,
  server_time TEXT NOT NULL,
  server_timestamp INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  source TEXT NOT NULL,
  last_candle_times_json TEXT NOT NULL,
  indicators_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candles (
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  time INTEGER NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (symbol, timeframe, time)
);

CREATE INDEX IF NOT EXISTS idx_candles_lookup
  ON candles (symbol, timeframe, time DESC);

CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL', 'WAIT')),
  timestamp INTEGER NOT NULL,
  entry_price REAL,
  entry_zone_min REAL,
  entry_zone_max REAL,
  stop_loss REAL,
  take_profit_1 REAL,
  take_profit_2 REAL,
  risk_reward_1 REAL,
  risk_reward_2 REAL,
  confirmation_score INTEGER NOT NULL,
  data_quality_score INTEGER NOT NULL,
  reasons_for_json TEXT NOT NULL,
  reasons_against_json TEXT NOT NULL,
  status TEXT NOT NULL,
  verified_at INTEGER,
  verification_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_signals_recent
  ON signals (timeframe, timestamp DESC);
