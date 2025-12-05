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

def fetch_stock_data(symbol, interval="1d"):
    """Yahoo Finance se data layega (With Retry & Smart Delay)"""
    # Throttling to prevent 401 Errors
    time.sleep(random.uniform(0.5, 1.5))
    
    for attempt in range(2): 
        try:
            if not symbol.endswith(".NS") and not symbol.endswith(".BO"):
                symbol += ".NS"
            
            # Fetch Data - Handle different intervals
            # Yahoo Finance limits:
            # - 1m, 2m, 5m: max 7 days
            # - 15m, 30m: max 60 days  
            # - 1h: max 730 days (2 years)
            # - Daily and above: unlimited
            if interval in ["1m", "2m", "5m"]:
                period = "7d"  # Smallest intervals: 7 days max
            elif interval in ["15m", "30m"]:
                period = "60d"  # Medium intervals: 60 days max
            elif interval in ["60m", "90m", "1h"]:
                period = "730d"  # Hourly: 2 years max
            else:
                period = "max"  # Daily/weekly/monthly can get max data
            
            df = yf.download(symbol, period=period, interval=interval, progress=False, auto_adjust=True, timeout=30)
            
            # Need at least 50 data points
            if df.empty or len(df) < 50: 
                print(f"⚠️ {symbol}: Not enough data ({len(df) if not df.empty else 0} points) for {interval}")
                return None
            
            # Debug: Log data range to see what we're getting
            if len(df) > 0:
                days_span = (df.index[-1] - df.index[0]).days if len(df) > 1 else 0
                print(f"📈 Fetched {len(df)} {interval} candles for {symbol} | Range: {df.index[0]} to {df.index[-1]} | Span: ~{days_span} days")

            # Clean Data
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            # Indicators - Only calculate for daily and above (intraday indicators may not be meaningful)
            if interval in ["1d", "5d", "1wk", "1mo", "3mo"]:
                df['EMA_50'] = ta.ema(df['Close'], length=50)
                df['EMA_200'] = ta.ema(df['Close'], length=200)
                df['RSI'] = ta.rsi(df['Close'], length=14)
                df['Vol_SMA'] = ta.sma(df['Volume'], length=20)
            else:
                # For intraday, use shorter periods
                df['EMA_50'] = ta.ema(df['Close'], length=min(50, len(df)))
                df['RSI'] = ta.rsi(df['Close'], length=14)
                df['Vol_SMA'] = ta.sma(df['Volume'], length=min(20, len(df)))
                df['EMA_200'] = None  # Not meaningful for intraday

            return df
            
        except Exception as e:
            print(f"❌ Error fetching {symbol} with interval {interval}: {str(e)[:100]}")
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
def scan_stock(symbol: str, interval: str = "1d"):
    # Single stock scan logic (Optional use)
    df = fetch_stock_data(symbol, interval=interval)
    if df is None:
        raise HTTPException(status_code=404, detail="Data Not Found")
    return {"status": "OK", "symbol": symbol, "interval": interval}

@app.get("/api/audit/{symbol}")
def get_ai_audit(symbol: str, interval: str = "1d"):
    """AI se stock ka audit karwayega"""
    df = fetch_stock_data(symbol, interval=interval)
    
    if df is None:
        return {"verdict": "ERROR", "reason": "Could not fetch live data."}
        
    # Prepare Data for AI
    curr_price = round(df['Close'].iloc[-1], 2)
    rsi = round(df['RSI'].iloc[-1], 1) if 'RSI' in df.columns and not pd.isna(df['RSI'].iloc[-1]) else 50
    
    vol_avg = df['Vol_SMA'].iloc[-1] if 'Vol_SMA' in df.columns else df['Volume'].iloc[-1]
    if pd.isna(vol_avg) or vol_avg == 0: vol_avg = 1
    vol_x = round(df['Volume'].iloc[-1] / vol_avg, 1)
    
    # Recent Trend (Last 5 data points)
    recent_trend = df['Close'].tail(5).to_list()
    
    # Call Gemini Agent
    return audit_stock(symbol, curr_price, rsi, vol_x, recent_trend)

@app.get("/api/chart/{symbol}")
def get_chart_data(symbol: str, interval: str = "1d"):
    """Get chart data for a specific symbol and timeframe"""
    df = fetch_stock_data(symbol, interval=interval)
    
    if df is None:
        raise HTTPException(status_code=404, detail="Data Not Found")
    
    # Limit chart data points for performance
    # For intraday: Use ALL available data (Yahoo Finance already limits to 7 days max)
    # For daily/weekly/monthly: Limit to last 2000 points for performance
    if interval in ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"]:
        # Use all intraday data - Yahoo Finance already limits to 7 days
        chart_df = df.reset_index()  # All available intraday data
        print(f"📊 Using all {len(chart_df)} intraday candles (max 7 days from Yahoo Finance)")
    else:
        chart_df = df.tail(2000).reset_index()  # Last 2000 for daily/weekly/monthly
        print(f"📊 Using last {len(chart_df)} candles for {interval} timeframe")
    
    # Debug: Check column names
    print(f"📊 Chart columns for {symbol} ({interval}): {list(chart_df.columns)}")
    if len(chart_df) > 0:
        print(f"📊 First row index: {chart_df.index[0] if len(chart_df) > 0 else 'N/A'}")
        print(f"📊 First row data: {chart_df.iloc[0].to_dict() if len(chart_df) > 0 else 'N/A'}")
    
    # Format time based on interval
    chart_data = []
    
    # Find the date/datetime column name
    date_col = None
    for col in chart_df.columns:
        if col.lower() in ['date', 'datetime', 'time', 'timestamp']:
            date_col = col
            break
    
    # If no date column found, the index should be the datetime
    if date_col is None and len(chart_df) > 0:
        # Check if index is datetime
        if isinstance(chart_df.index, pd.DatetimeIndex):
            # Use index directly
            date_col = '__index__'
        else:
            # Try first column that looks like datetime
            for col in chart_df.columns:
                if pd.api.types.is_datetime64_any_dtype(chart_df[col]):
                    date_col = col
                    break
    
    print(f"📊 Date column found: {date_col}")
    
    for idx, row in chart_df.iterrows():
        # Handle date formatting based on interval
        if date_col == '__index__':
            # Use the index directly (idx is the index value when using iterrows)
            date_val = idx
        elif date_col and date_col in row:
            date_val = row[date_col]
        else:
            # Last resort: try to get from row name or index
            date_val = row.name if hasattr(row, 'name') and row.name is not None else idx
        
        if date_val is None:
            print(f"⚠️ Warning: Could not find date value for row")
            continue
        
        # For intraday intervals, use Unix timestamp (number) for better time display
        # For daily/weekly/monthly, use string format
        try:
            if interval in ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"]:
                # Convert to Unix timestamp (seconds since epoch)
                # First convert to pandas Timestamp to ensure proper handling
                dt = pd.to_datetime(date_val)
                if pd.isna(dt):
                    print(f"⚠️ Warning: Invalid date value: {date_val}")
                    continue
                time_val = int(dt.timestamp())
                
                # Validate timestamp is reasonable (not 0 or negative, and not too far in future)
                if time_val <= 0 or time_val > 2147483647:  # Max 32-bit timestamp
                    print(f"⚠️ Warning: Invalid timestamp {time_val} for date {date_val}")
                    continue
            else:
                # For daily/weekly/monthly, use string format 'YYYY-MM-DD'
                dt = pd.to_datetime(date_val)
                if pd.isna(dt):
                    print(f"⚠️ Warning: Invalid date value: {date_val}")
                    continue
                time_val = dt.strftime('%Y-%m-%d')
        except Exception as e:
            print(f"⚠️ Error formatting time for {date_val}: {str(e)}")
            continue
        
        chart_data.append({
            "time": time_val,
            "open": float(row['Open']),
            "high": float(row['High']),
            "low": float(row['Low']),
            "close": float(row['Close'])
        })
    
    return {
        "symbol": symbol,
        "interval": interval,
        "data": chart_data,
        "count": len(chart_data)
    }

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