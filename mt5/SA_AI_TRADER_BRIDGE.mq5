//+------------------------------------------------------------------+
//|                                       SA_AI_TRADER_BRIDGE.mq5    |
//|                    Read-Only XM GOLD -> Cloudflare Worker Bridge |
//|   NEVER places, modifies, or closes trades. No account password. |
//+------------------------------------------------------------------+
#property copyright "SA AI TRADER"
#property version   "1.00"
#property strict

input string InpApiEndpoint    = "https://REPLACE_WITH_YOUR_WORKER_URL/api/bridge/mt5"; // Bridge API Endpoint
input string InpBridgeToken    = "";       // XM_BRIDGE_TOKEN (must match Worker secret)
input string InpSymbol         = "GOLD";   // XM Broker Symbol (e.g. GOLD or GOLDmicro)
input int    InpIntervalSec    = 4;        // Push interval in seconds (3 to 5)
input int    InpCandlesCount   = 220;      // Initial backfill bars per timeframe (min 205 for EMA 200)
input int    InpIncrementalBars = 3;       // Steady-state bars per tick after initial backfill

struct TfContext
{
   ENUM_TIMEFRAMES tf;
   string          label;
   int             hEma9;
   int             hEma21;
   int             hEma50;
   int             hEma200;
   int             hRsi14;
   int             hMacd;
   int             hAtr14;
};

TfContext g_tfs[7];
int       g_intervalSec = 4;
int       g_candlesCount = 220;
int       g_incrementalBars = 3;
bool      g_initialBackfillDone = false;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(InpApiEndpoint) < 10)
   {
      Print("[SA AI TRADER] ERROR: InpApiEndpoint is empty or invalid.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   if(StringLen(InpBridgeToken) == 0)
   {
      Print("[SA AI TRADER] ERROR: InpBridgeToken is empty. Set it to match your Cloudflare Worker XM_BRIDGE_TOKEN secret.");
      return(INIT_PARAMETERS_INCORRECT);
   }

   if(!SymbolSelect(InpSymbol, true))
   {
      PrintFormat("[SA AI TRADER] ERROR: Symbol '%s' could not be selected in Market Watch.", InpSymbol);
      return(INIT_FAILED);
   }

   g_intervalSec = MathMax(3, MathMin(5, InpIntervalSec));
   g_candlesCount = MathMax(205, MathMin(350, InpCandlesCount));
   g_incrementalBars = MathMax(2, MathMin(20, InpIncrementalBars));
   g_initialBackfillDone = false;

   ENUM_TIMEFRAMES tfList[7] = { PERIOD_M1, PERIOD_M5, PERIOD_M15, PERIOD_M30, PERIOD_H1, PERIOD_H4, PERIOD_D1 };
   string          labels[7] = { "M1", "M5", "M15", "M30", "H1", "H4", "D1" };

   for(int i = 0; i < 7; i++)
   {
      g_tfs[i].tf      = tfList[i];
      g_tfs[i].label   = labels[i];
      g_tfs[i].hEma9   = iMA(InpSymbol, tfList[i], 9, 0, MODE_EMA, PRICE_CLOSE);
      g_tfs[i].hEma21  = iMA(InpSymbol, tfList[i], 21, 0, MODE_EMA, PRICE_CLOSE);
      g_tfs[i].hEma50  = iMA(InpSymbol, tfList[i], 50, 0, MODE_EMA, PRICE_CLOSE);
      g_tfs[i].hEma200 = iMA(InpSymbol, tfList[i], 200, 0, MODE_EMA, PRICE_CLOSE);
      g_tfs[i].hRsi14  = iRSI(InpSymbol, tfList[i], 14, PRICE_CLOSE);
      g_tfs[i].hMacd   = iMACD(InpSymbol, tfList[i], 12, 26, 9, PRICE_CLOSE);
      g_tfs[i].hAtr14  = iATR(InpSymbol, tfList[i], 14);

      if(g_tfs[i].hEma9 == INVALID_HANDLE || g_tfs[i].hEma21 == INVALID_HANDLE ||
         g_tfs[i].hEma50 == INVALID_HANDLE || g_tfs[i].hEma200 == INVALID_HANDLE ||
         g_tfs[i].hRsi14 == INVALID_HANDLE || g_tfs[i].hMacd == INVALID_HANDLE ||
         g_tfs[i].hAtr14 == INVALID_HANDLE)
      {
         PrintFormat("[SA AI TRADER] WARNING: Indicator handle initialization incomplete for %s %s", InpSymbol, labels[i]);
      }
   }

   EventSetTimer(g_intervalSec);
   PrintFormat("[SA AI TRADER] Read-only bridge initialized for %s (interval=%ds, bars=%d).", InpSymbol, g_intervalSec, g_candlesCount);
   SendBridgeSnapshot();
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   for(int i = 0; i < 7; i++)
   {
      if(g_tfs[i].hEma9   != INVALID_HANDLE) IndicatorRelease(g_tfs[i].hEma9);
      if(g_tfs[i].hEma21  != INVALID_HANDLE) IndicatorRelease(g_tfs[i].hEma21);
      if(g_tfs[i].hEma50  != INVALID_HANDLE) IndicatorRelease(g_tfs[i].hEma50);
      if(g_tfs[i].hEma200 != INVALID_HANDLE) IndicatorRelease(g_tfs[i].hEma200);
      if(g_tfs[i].hRsi14  != INVALID_HANDLE) IndicatorRelease(g_tfs[i].hRsi14);
      if(g_tfs[i].hMacd   != INVALID_HANDLE) IndicatorRelease(g_tfs[i].hMacd);
      if(g_tfs[i].hAtr14  != INVALID_HANDLE) IndicatorRelease(g_tfs[i].hAtr14);
   }
   PrintFormat("[SA AI TRADER] Bridge stopped (reason=%d).", reason);
}

//+------------------------------------------------------------------+
//| Timer handler                                                    |
//+------------------------------------------------------------------+
void OnTimer()
{
   SendBridgeSnapshot();
}

//+------------------------------------------------------------------+
//| Helper: read single latest value from indicator buffer           |
//+------------------------------------------------------------------+
string ReadIndicatorJsonVal(int handle, int bufferIndex, int digits)
{
   if(handle == INVALID_HANDLE) return "null";
   double buf[1];
   if(CopyBuffer(handle, bufferIndex, 0, 1, buf) != 1)
      return "null";
   if(buf[0] == EMPTY_VALUE || !MathIsValidNumber(buf[0]))
      return "null";
   return DoubleToString(buf[0], digits);
}

//+------------------------------------------------------------------+
//| Build JSON payload & send read-only POST via WebRequest          |
//+------------------------------------------------------------------+
void SendBridgeSnapshot()
{
   double bid = SymbolInfoDouble(InpSymbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(InpSymbol, SYMBOL_ASK);
   double point = SymbolInfoDouble(InpSymbol, SYMBOL_POINT);
   int    digits = (int)SymbolInfoInteger(InpSymbol, SYMBOL_DIGITS);
   datetime serverTime = TimeCurrent();
   datetime utcTime = TimeGMT();

   if(bid <= 0.0 || ask <= 0.0 || ask < bid || serverTime <= 0 || utcTime <= 0)
   {
      PrintFormat("[SA AI TRADER] Skipping tick: invalid market quote for %s (bid=%.5f, ask=%.5f).", InpSymbol, bid, ask);
      return;
   }

   double spread = NormalizeDouble(ask - bid, digits);
   string serverTimeIso = TimeToString(serverTime, TIME_DATE | TIME_SECONDS);
   StringReplace(serverTimeIso, ".", "-");

   int barsToCopy = g_initialBackfillDone ? g_incrementalBars : g_candlesCount;

   string json = "{";
   json += "\"symbol\":\"" + InpSymbol + "\",";
   json += "\"broker\":\"XM\",";
   json += "\"bid\":" + DoubleToString(bid, digits) + ",";
   json += "\"ask\":" + DoubleToString(ask, digits) + ",";
   json += "\"spread\":" + DoubleToString(spread, digits) + ",";
   json += "\"digits\":" + IntegerToString(digits) + ",";
   json += "\"point\":" + DoubleToString(point, 5) + ",";
   json += "\"serverTime\":\"" + serverTimeIso + "\",";
   json += "\"serverTimestamp\":" + IntegerToString((long)utcTime) + ",";

   // Candles by timeframe
   json += "\"candles\":{";
   bool firstTf = true;
   for(int i = 0; i < 7; i++)
   {
      MqlRates rates[];
      ArraySetAsSeries(rates, false); // chronological order: oldest -> newest
      int copied = CopyRates(InpSymbol, g_tfs[i].tf, 0, barsToCopy, rates);
      if(copied <= 0)
      {
         PrintFormat("[SA AI TRADER] Info: No %s candles available yet for %s (err=%d).", g_tfs[i].label, InpSymbol, GetLastError());
         continue;
      }

      if(!firstTf) json += ",";
      firstTf = false;

      json += "\"" + g_tfs[i].label + "\":[";
      for(int k = 0; k < copied; k++)
      {
         if(k > 0) json += ",";
         json += "{\"time\":" + IntegerToString((long)rates[k].time) +
                 ",\"open\":" + DoubleToString(rates[k].open, digits) +
                 ",\"high\":" + DoubleToString(rates[k].high, digits) +
                 ",\"low\":" + DoubleToString(rates[k].low, digits) +
                 ",\"close\":" + DoubleToString(rates[k].close, digits) +
                 ",\"volume\":" + IntegerToString((long)rates[k].tick_volume) + "}";
      }
      json += "]";
   }
   json += "},";

   // MT5 native indicator readings per timeframe
   json += "\"indicators\":{";
   for(int i = 0; i < 7; i++)
   {
      if(i > 0) json += ",";
      string macdMainStr = ReadIndicatorJsonVal(g_tfs[i].hMacd, 0, 5);
      string macdSigStr  = ReadIndicatorJsonVal(g_tfs[i].hMacd, 1, 5);
      string macdHistStr = "null";
      if(macdMainStr != "null" && macdSigStr != "null")
      {
         double hist = StringToDouble(macdMainStr) - StringToDouble(macdSigStr);
         macdHistStr = DoubleToString(hist, 5);
      }

      json += "\"" + g_tfs[i].label + "\":{";
      json += "\"ema9\":" + ReadIndicatorJsonVal(g_tfs[i].hEma9, 0, digits) + ",";
      json += "\"ema21\":" + ReadIndicatorJsonVal(g_tfs[i].hEma21, 0, digits) + ",";
      json += "\"ema50\":" + ReadIndicatorJsonVal(g_tfs[i].hEma50, 0, digits) + ",";
      json += "\"ema200\":" + ReadIndicatorJsonVal(g_tfs[i].hEma200, 0, digits) + ",";
      json += "\"rsi14\":" + ReadIndicatorJsonVal(g_tfs[i].hRsi14, 0, 2) + ",";
      json += "\"macdMain\":" + macdMainStr + ",";
      json += "\"macdSignal\":" + macdSigStr + ",";
      json += "\"macdHist\":" + macdHistStr + ",";
      json += "\"atr14\":" + ReadIndicatorJsonVal(g_tfs[i].hAtr14, 0, digits);
      json += "}";
   }
   json += "}";
   json += "}";

   char postData[];
   int len = StringToCharArray(json, postData, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0) ArrayResize(postData, len - 1); // Remove null terminator

   string headers = "Content-Type: application/json\r\nAuthorization: Bearer " + InpBridgeToken + "\r\n";
   char   result[];
   string resultHeaders;

   ResetLastError();
   int httpStatus = WebRequest("POST", InpApiEndpoint, headers, 4000, postData, result, resultHeaders);

   if(httpStatus == -1)
   {
      int err = GetLastError();
      g_initialBackfillDone = false;
      if(err == 4060)
         PrintFormat("[SA AI TRADER] WebRequest blocked (Error 4060). Add '%s' in MT5 -> Tools -> Options -> Expert Advisors -> Allow WebRequest.", InpApiEndpoint);
      else
         PrintFormat("[SA AI TRADER] WebRequest failed (err=%d).", err);
      return;
   }

   if(httpStatus < 200 || httpStatus >= 300)
   {
      g_initialBackfillDone = false;
      string respBody = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      PrintFormat("[SA AI TRADER] Bridge HTTP %d error: %s", httpStatus, respBody);
      return;
   }

   if(!g_initialBackfillDone)
   {
      g_initialBackfillDone = true;
      PrintFormat("[SA AI TRADER] Initial %d-bar backfill accepted by Worker. Switching to %d-bar incremental updates.", g_candlesCount, g_incrementalBars);
   }
}
//+------------------------------------------------------------------+
