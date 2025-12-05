from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from concurrent.futures import ThreadPoolExecutor
import yfinance as yf
import pandas_ta as ta
import pandas as pd
import time
import random
# Import our new AI Agent
from ai_agent import audit_stock

app = FastAPI(title="Titan Command Center API")

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- HELPER FUNCTIONS ---

def fetch_stock_data(symbol):
    """Yahoo Finance se data layega (With Retry & Smart Delay)"""
    # Throttling to prevent 401 Errors
    time.sleep(random.uniform(0.5, 1.5))
    
    for attempt in range(2): 
        try:
            if not symbol.endswith(".NS") and not symbol.endswith(".BO"):
                symbol += ".NS"
            
            # Fetch Data - Using 'max' to get all available historical data (up to ~30 years)
            # This provides better data for technical indicators like EMA_200
            # Adding timeout to prevent hanging
            df = yf.download(symbol, period="max", interval="1d", progress=False, auto_adjust=True, timeout=30)
            
            # Need at least 200 days for EMA_200, but allow 50 for flexibility
            if df.empty or len(df) < 50: 
                print(f"⚠️ {symbol}: Not enough data ({len(df) if not df.empty else 0} days)")
                return None
            
            # Debug: Log data range to see what we're getting
            if len(df) > 0:
                print(f"📈 Fetched {len(df)} days for {symbol} | Range: {df.index[0].strftime('%Y-%m-%d')} to {df.index[-1].strftime('%Y-%m-%d')}")

            # Clean Data
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            # Indicators
            df['EMA_50'] = ta.ema(df['Close'], length=50)
            df['EMA_200'] = ta.ema(df['Close'], length=200)
            df['RSI'] = ta.rsi(df['Close'], length=14)
            df['Vol_SMA'] = ta.sma(df['Volume'], length=20)

            return df
            
        except Exception as e:
            print(f"❌ Error fetching {symbol}: {str(e)[:100]}")
            time.sleep(1)
            continue
            
    return None

def check_titan_criteria(df):
    """Titan Strategy Logic"""
    if df is None: return "NO DATA"
    try:
        curr = df.iloc[-1]
        prev = df.iloc[-2]
        
        # Check for NaN values in indicators (can happen if not enough data)
        if pd.isna(curr['EMA_50']) or pd.isna(curr['EMA_200']) or pd.isna(curr['RSI']) or pd.isna(curr['Vol_SMA']):
            return "WAIT"  # Not enough data for indicators
        
        # 1. Trend
        trend = (curr['Close'] > curr['EMA_50']) and (curr['EMA_50'] > curr['EMA_200'])
        # 2. Momentum (RSI)
        momentum = 50 < curr['RSI'] < 75
        # 3. Volume Blast
        volume = curr['Volume'] > (curr['Vol_SMA'] * 1.5)
        # 4. Breakout
        breakout = curr['Close'] > prev['High']
        
        if trend and momentum and volume and breakout:
            return "BUY"
    except Exception as e:
        print(f"⚠️ Criteria check error: {str(e)[:100]}")
        pass
    return "WAIT"

# --- API ENDPOINTS ---

@app.get("/")
def home():
    return {"message": "Titan Command Center is Online 🚀"}

@app.get("/api/scan/{symbol}")
def scan_stock(symbol: str):
    # Single stock scan logic (Optional use)
    df = fetch_stock_data(symbol)
    if df is None:
        raise HTTPException(status_code=404, detail="Data Not Found")
    return {"status": "OK", "symbol": symbol}

@app.get("/api/audit/{symbol}")
def get_ai_audit(symbol: str):
    """AI se stock ka audit karwayega"""
    df = fetch_stock_data(symbol)
    
    if df is None:
        return {"verdict": "ERROR", "reason": "Could not fetch live data."}
        
    # Prepare Data for AI
    curr_price = round(df['Close'].iloc[-1], 2)
    rsi = round(df['RSI'].iloc[-1], 1)
    
    vol_avg = df['Vol_SMA'].iloc[-1]
    if pd.isna(vol_avg) or vol_avg == 0: vol_avg = 1
    vol_x = round(df['Volume'].iloc[-1] / vol_avg, 1)
    
    # Recent Trend (Last 5 days)
    recent_trend = df['Close'].tail(5).to_list()
    
    # Call Gemini Agent
    return audit_stock(symbol, curr_price, rsi, vol_x, recent_trend)

@app.get("/api/bulk_scan")
def bulk_scan():
    results = []
    try:
        with open("stocks.txt", "r") as f:
            raw_stocks = [line.strip() for line in f if line.strip()]
        
        stocks = []
        for s in raw_stocks:
            if not s.endswith(".NS") and not s.endswith(".BO"):
                s += ".BO" if s.isdigit() else ".NS"
            stocks.append(s)

        print(f"🚀 Scanning {len(stocks)} stocks...")

        def scan_single(stock):
            try:
                df = fetch_stock_data(stock)
                if df is not None:
                    status = check_titan_criteria(df)
                    if status == "BUY":
                        print(f"✅ {stock} passed criteria!")
                        # Chart Data - Using last 2000 days (~5-6 years) for comprehensive historical view
                        # This shows much more historical data while still being performant
                        # For all data, use: chart_df = df.reset_index()
                        chart_df = df.tail(2000).reset_index()
                        print(f"📊 Chart data for {stock}: {len(chart_df)} days | Range: {chart_df['Date'].iloc[0].strftime('%Y-%m-%d')} to {chart_df['Date'].iloc[-1].strftime('%Y-%m-%d')}")
                        
                        chart_data = [
                            {"time": row['Date'].strftime('%Y-%m-%d'), 
                             "open": row['Open'], "high": row['High'], 
                             "low": row['Low'], "close": row['Close']}
                            for _, row in chart_df.iterrows()
                        ]
                        
                        return {
                            "symbol": stock,
                            "current_price": round(df['Close'].iloc[-1], 2),
                            "rsi": round(df['RSI'].iloc[-1], 1),
                            "volume_x": round(df['Volume'].iloc[-1] / (df['Vol_SMA'].iloc[-1] + 1), 1),
                            "status": "💎 BUY",
                            "chart_data": chart_data
                        }
            except Exception as e:
                print(f"⚠️ Scan error for {stock}: {str(e)[:100]}")
                pass
            return None

        # Max 4 workers to keep Yahoo happy
        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = executor.map(scan_single, stocks)
            for res in futures:
                if res: results.append(res)

    except Exception as e:
        return {"error": str(e)}
        
    return {"gems": results}