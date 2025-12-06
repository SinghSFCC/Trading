from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from concurrent.futures import ThreadPoolExecutor, as_completed
import yfinance as yf
import pandas_ta as ta
import pandas as pd
import time
import random
import numpy as np
import json
# Import our new AI Agent
from ai_agent import audit_stock
# Import core algorithms for zones and market structure
from core.algorithms import calculate_supply_demand_zones, analyze_market_structure
import google.generativeai as genai
import os

# Pydantic Model for Chat Request
class ChatRequest(BaseModel):
    symbol: str
    question: str

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
    
    # CRITICAL: Create a fresh copy of symbol to avoid any reference issues
    symbol_copy = str(symbol)
    
    for attempt in range(2): 
        try:
            if not symbol_copy.endswith(".NS") and not symbol_copy.endswith(".BO"):
                symbol_copy += ".NS"
            
            # Debug: Log which symbol we're fetching
            if attempt == 0:
                print(f"🔍 Fetching data for: {symbol_copy}")
            
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
            
            # CRITICAL: Download with explicit symbol to avoid any caching issues
            df = yf.download(symbol_copy, period=period, interval=interval, progress=False, auto_adjust=True, timeout=30)
            
            # CRITICAL: If MultiIndex columns, extract the symbol-specific data
            if isinstance(df.columns, pd.MultiIndex):
                # If we have multiple symbols (shouldn't happen, but just in case)
                if len(df.columns.levels[1]) > 1:
                    print(f"⚠️ WARNING: Multiple symbols in response for {symbol_copy}, using first")
                df.columns = df.columns.get_level_values(0)
            
            # Need at least 50 data points
            if df.empty or len(df) < 50: 
                print(f"⚠️ {symbol}: Not enough data ({len(df) if not df.empty else 0} points) for {interval}")
                return None
            
            # Debug: Log data range to see what we're getting
            if len(df) > 0:
                days_span = (df.index[-1] - df.index[0]).days if len(df) > 1 else 0
                last_close = float(df['Close'].iloc[-1]) if 'Close' in df.columns else 0
                print(f"📈 Fetched {len(df)} {interval} candles for {symbol_copy} | Range: {df.index[0]} to {df.index[-1]} | Span: ~{days_span} days | Last Close: ₹{last_close:.2f}")

            # Clean Data
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            # Indicators - Calculate all technical indicators
            if interval in ["1d", "5d", "1wk", "1mo", "3mo"]:
                # Daily and above - full indicators
                df['EMA_50'] = ta.ema(df['Close'], length=50)
                df['EMA_200'] = ta.ema(df['Close'], length=200)
                df['RSI'] = ta.rsi(df['Close'], length=14)
                df['Vol_SMA'] = ta.sma(df['Volume'], length=20)
                
                # MACD (12, 26, 9)
                try:
                    macd = ta.macd(df['Close'], fast=12, slow=26, signal=9)
                    if macd is not None and isinstance(macd, pd.DataFrame):
                        # Find MACD columns (they might have different naming)
                        macd_cols = [col for col in macd.columns if 'MACD' in str(col) and 'MACDs' not in str(col) and 'MACDh' not in str(col)]
                        signal_cols = [col for col in macd.columns if 'MACDs' in str(col)]
                        hist_cols = [col for col in macd.columns if 'MACDh' in str(col)]
                        
                        if macd_cols:
                            df['MACD'] = macd[macd_cols[0]]
                        if signal_cols:
                            df['MACD_Signal'] = macd[signal_cols[0]]
                        if hist_cols:
                            df['MACD_Hist'] = macd[hist_cols[0]]
                except Exception as e:
                    print(f"⚠️ MACD calculation error: {str(e)}")
                    df['MACD'] = None
                    df['MACD_Signal'] = None
                    df['MACD_Hist'] = None
                
                # Bollinger Bands (20, 2)
                try:
                    bb = ta.bbands(df['Close'], length=20, std=2)
                    if bb is not None and isinstance(bb, pd.DataFrame):
                        # Find BB columns
                        upper_cols = [col for col in bb.columns if 'BBU' in str(col)]
                        middle_cols = [col for col in bb.columns if 'BBM' in str(col)]
                        lower_cols = [col for col in bb.columns if 'BBL' in str(col)]
                        
                        if upper_cols:
                            df['BB_Upper'] = bb[upper_cols[0]]
                        if middle_cols:
                            df['BB_Middle'] = bb[middle_cols[0]]
                        if lower_cols:
                            df['BB_Lower'] = bb[lower_cols[0]]
                except Exception as e:
                    print(f"⚠️ Bollinger Bands calculation error: {str(e)}")
                    df['BB_Upper'] = None
                    df['BB_Middle'] = None
                    df['BB_Lower'] = None
            else:
                # For intraday, use shorter periods
                df['EMA_50'] = ta.ema(df['Close'], length=min(50, len(df)))
                df['RSI'] = ta.rsi(df['Close'], length=14)
                df['Vol_SMA'] = ta.sma(df['Volume'], length=min(20, len(df)))
                df['EMA_200'] = None  # Not meaningful for intraday
                
                # MACD for intraday (shorter periods)
                try:
                    macd = ta.macd(df['Close'], fast=12, slow=26, signal=9)
                    if macd is not None and isinstance(macd, pd.DataFrame):
                        macd_cols = [col for col in macd.columns if 'MACD' in str(col) and 'MACDs' not in str(col) and 'MACDh' not in str(col)]
                        signal_cols = [col for col in macd.columns if 'MACDs' in str(col)]
                        hist_cols = [col for col in macd.columns if 'MACDh' in str(col)]
                        
                        if macd_cols:
                            df['MACD'] = macd[macd_cols[0]]
                        if signal_cols:
                            df['MACD_Signal'] = macd[signal_cols[0]]
                        if hist_cols:
                            df['MACD_Hist'] = macd[hist_cols[0]]
                except Exception as e:
                    print(f"⚠️ MACD calculation error: {str(e)}")
                    df['MACD'] = None
                    df['MACD_Signal'] = None
                    df['MACD_Hist'] = None
                
                # Bollinger Bands for intraday
                try:
                    bb_length = min(20, len(df))
                    bb = ta.bbands(df['Close'], length=bb_length, std=2)
                    if bb is not None and isinstance(bb, pd.DataFrame):
                        upper_cols = [col for col in bb.columns if 'BBU' in str(col)]
                        middle_cols = [col for col in bb.columns if 'BBM' in str(col)]
                        lower_cols = [col for col in bb.columns if 'BBL' in str(col)]
                        
                        if upper_cols:
                            df['BB_Upper'] = bb[upper_cols[0]]
                        if middle_cols:
                            df['BB_Middle'] = bb[middle_cols[0]]
                        if lower_cols:
                            df['BB_Lower'] = bb[lower_cols[0]]
                except Exception as e:
                    print(f"⚠️ Bollinger Bands calculation error: {str(e)}")
                    df['BB_Upper'] = None
                    df['BB_Middle'] = None
                    df['BB_Lower'] = None

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
    
    # Calculate supply/demand zones and market structure
    zones = calculate_supply_demand_zones(df)
    structure = analyze_market_structure(df)
    
    # Check if TradingView is supported (ends with .NS or .BO)
    has_tradingview = symbol.endswith(".NS") or symbol.endswith(".BO")
    
    return {
        "status": "OK",
        "symbol": symbol,
        "interval": interval,
        "zones": zones,
        "structure": structure,
        "has_tradingview": has_tradingview
    }

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
    
    # Calculate supply/demand zones and market structure
    zones = calculate_supply_demand_zones(df)
    structure = analyze_market_structure(df)
    
    # Format last 45 days of OHLC data as text table
    history_df = df.tail(45).reset_index()
    history_str = "Date | Open | Close\n"
    for _, row in history_df.iterrows():
        # Find date column (could be 'Date' or index name)
        date_val = None
        if 'Date' in row:
            date_val = row['Date']
        elif hasattr(row, 'name') and row.name is not None:
            date_val = row.name
        else:
            # Try to find datetime column
            for col in history_df.columns:
                if pd.api.types.is_datetime64_any_dtype(history_df[col]):
                    date_val = row[col]
                    break
        
        if date_val is None:
            date_str = str(row.name) if hasattr(row, 'name') else "N/A"
        else:
            date_str = pd.to_datetime(date_val).strftime('%Y-%m-%d')
        
        history_str += f"{date_str} | {row['Open']:.2f} | {row['Close']:.2f}\n"
    
    # Call Gemini Agent with new context
    audit_result = audit_stock(symbol, curr_price, rsi, vol_x, recent_trend, zones, structure, history_str)
    
    # Include zones and structure in response for frontend
    return {
        **audit_result,
        "zones": zones,
        "structure": structure
    }

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
        
        # Prepare indicator data
        indicator_data = {
            "time": time_val,
            "open": float(row['Open']),
            "high": float(row['High']),
            "low": float(row['Low']),
            "close": float(row['Close']),
            "volume": float(row['Volume']) if 'Volume' in row else 0,
        }
        
        # Add EMA values
        if 'EMA_50' in row and not pd.isna(row['EMA_50']):
            indicator_data['ema_50'] = float(row['EMA_50'])
        if 'EMA_200' in row and not pd.isna(row['EMA_200']):
            indicator_data['ema_200'] = float(row['EMA_200'])
        
        # Add RSI
        if 'RSI' in row and not pd.isna(row['RSI']):
            rsi_val = float(row['RSI'])
            # Validate RSI is in valid range (0-100)
            if 0 <= rsi_val <= 100:
                indicator_data['rsi'] = rsi_val
        
        # Add MACD
        if 'MACD' in row and not pd.isna(row['MACD']):
            indicator_data['macd'] = float(row['MACD'])
        if 'MACD_Signal' in row and not pd.isna(row['MACD_Signal']):
            indicator_data['macd_signal'] = float(row['MACD_Signal'])
        if 'MACD_Hist' in row and not pd.isna(row['MACD_Hist']):
            indicator_data['macd_hist'] = float(row['MACD_Hist'])
        
        # Add Bollinger Bands
        if 'BB_Upper' in row and not pd.isna(row['BB_Upper']):
            indicator_data['bb_upper'] = float(row['BB_Upper'])
        if 'BB_Middle' in row and not pd.isna(row['BB_Middle']):
            indicator_data['bb_middle'] = float(row['BB_Middle'])
        if 'BB_Lower' in row and not pd.isna(row['BB_Lower']):
            indicator_data['bb_lower'] = float(row['BB_Lower'])
        
        chart_data.append(indicator_data)
    
    # Debug: Count valid indicator values
    rsi_count = sum(1 for d in chart_data if 'rsi' in d and 0 <= d['rsi'] <= 100)
    ema50_count = sum(1 for d in chart_data if 'ema_50' in d)
    ema200_count = sum(1 for d in chart_data if 'ema_200' in d)
    print(f"📊 Valid indicators in response - RSI: {rsi_count}/{len(chart_data)}, EMA50: {ema50_count}/{len(chart_data)}, EMA200: {ema200_count}/{len(chart_data)}")
    
    if rsi_count > 0:
        rsi_values = [d['rsi'] for d in chart_data if 'rsi' in d and 0 <= d['rsi'] <= 100]
        print(f"📊 RSI value range: {min(rsi_values):.2f} - {max(rsi_values):.2f}")
    
    # Calculate supply/demand zones and market structure
    zones = calculate_supply_demand_zones(df)
    structure = analyze_market_structure(df)
    
    # Get current price from the ORIGINAL dataframe (before tail/limit operations)
    # This ensures we get the actual most recent price, not from limited chart data
    current_price = float(df['Close'].iloc[-1]) if len(df) > 0 else 0
    
    # Debug: Log price information
    if len(chart_data) > 0:
        last_candle = chart_data[-1]
        print(f"\n📊 CHART DATA DEBUG for {symbol}:")
        print(f"  Original DF length: {len(df)}")
        print(f"  Original DF last date: {df.index[-1]}")
        print(f"  Original DF last Close: ₹{df['Close'].iloc[-1]:.2f}")
        print(f"  Chart data length: {len(chart_data)}")
        print(f"  Last candle Close: ₹{last_candle.get('close', 0):.2f}")
        print(f"  Last candle High: ₹{last_candle.get('high', 0):.2f}")
        print(f"  Last candle Low: ₹{last_candle.get('low', 0):.2f}")
        print(f"  Current Price (from DF): ₹{current_price:.2f}")
        if len(chart_data) > 1:
            first_candle = chart_data[0]
            print(f"  First candle Close: ₹{first_candle.get('close', 0):.2f}")
            print(f"  Price range in chart: ₹{min([c.get('low', 0) for c in chart_data]):.2f} - ₹{max([c.get('high', 0) for c in chart_data]):.2f}")
        
        # Validate: Chart's last candle should match DF's last close (within rounding)
        chart_last_close = last_candle.get('close', 0)
        if abs(chart_last_close - current_price) > 0.01:
            print(f"  ⚠️ WARNING: Price mismatch! Chart last: ₹{chart_last_close:.2f}, DF last: ₹{current_price:.2f}")
    
    # Check if TradingView is supported (ends with .NS or .BO)
    has_tradingview = symbol.endswith(".NS") or symbol.endswith(".BO")

    return {
        "symbol": symbol,
        "interval": interval,
        "data": chart_data,
        "count": len(chart_data),
        "current_price": current_price,  # Include current price in response
        "zones": zones,
        "structure": structure,
        "has_tradingview": has_tradingview
    }

@app.get("/api/bulk_scan")
def bulk_scan():
    """Legacy endpoint - kept for compatibility"""
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
                # Use same interval as chart endpoint to ensure consistency
                df = fetch_stock_data(stock, interval="1d")
                if df is not None and len(df) > 0:
                    # Validate that we have recent data (within last 7 days)
                    last_date = pd.to_datetime(df.index[-1])
                    today = pd.Timestamp.now().normalize()
                    days_old = (today - last_date).days
                    
                    if days_old > 7:
                        print(f"⚠️ {stock}: Data is {days_old} days old, skipping...")
                        return None
                    
                    status = check_titan_criteria(df)
                    if status == "BUY":
                        # Get current price from the LAST row (most recent data)
                        # Ensure we're using the actual last close price
                        last_idx = len(df) - 1
                        last_close = float(df['Close'].iloc[last_idx])
                        
                        # Validate price is reasonable (not 0, not negative, not NaN)
                        if pd.isna(last_close) or last_close <= 0:
                            print(f"⚠️ {stock}: Invalid price {last_close}, skipping...")
                            return None
                        
                        current_price = round(last_close, 2)
                        rsi_val = round(float(df['RSI'].iloc[last_idx]), 1) if not pd.isna(df['RSI'].iloc[last_idx]) else 0
                        volume_x = round(float(df['Volume'].iloc[last_idx] / (df['Vol_SMA'].iloc[last_idx] + 1)), 1) if not pd.isna(df['Vol_SMA'].iloc[last_idx]) else 0
                        
                        # Debug: Log price for each stock
                        print(f"\n📊 SCAN DEBUG for {stock}:")
                        print(f"  DataFrame length: {len(df)}")
                        print(f"  Last index date: {df.index[last_idx]} ({(today - last_date).days} days ago)")
                        print(f"  Current Price: ₹{current_price}")
                        print(f"  RSI: {rsi_val}")
                        print(f"  Volume X: {volume_x}")
                        
                        print(f"✅ {stock} passed criteria!")
                        chart_df = df.tail(2000).reset_index()
                        print(f"📊 Chart data for {stock}: {len(chart_df)} days | Range: {chart_df['Date'].iloc[0].strftime('%Y-%m-%d')} to {chart_df['Date'].iloc[-1].strftime('%Y-%m-%d')}")
                        
                        chart_data = [
                            {"time": row['Date'].strftime('%Y-%m-%d'), 
                             "open": row['Open'], "high": row['High'], 
                             "low": row['Low'], "close": row['Close']}
                            for _, row in chart_df.iterrows()
                        ]
                        
                        # Calculate supply/demand zones and market structure
                        zones = calculate_supply_demand_zones(df)
                        structure = analyze_market_structure(df)
                        has_tradingview = stock.endswith(".NS") or stock.endswith(".BO")
                        
                        result = {
                            "symbol": stock,
                            "current_price": current_price,
                            "rsi": rsi_val,
                            "volume_x": volume_x,
                            "status": "💎 BUY",
                            "chart_data": chart_data,
                            "zones": zones,
                            "structure": structure,
                            "has_tradingview": has_tradingview
                        }
                        
                        # Debug: Log the result being returned
                        print(f"  ✅ Returning result for {stock} with price: ₹{result['current_price']}")
                        
                        return result
            except Exception as e:
                print(f"⚠️ Scan error for {stock}: {str(e)[:200]}")
                import traceback
                traceback.print_exc()
                pass
            return None

        with ThreadPoolExecutor(max_workers=4) as executor:
            futures = executor.map(scan_single, stocks)
            for res in futures:
                if res: results.append(res)

    except Exception as e:
        return {"error": str(e)}
        
    return {"gems": results}

@app.get("/api/bulk_scan_stream")
def bulk_scan_stream():
    """Streaming endpoint that sends real-time progress updates"""
    def generate():
        results = []
        try:
            with open("stocks.txt", "r") as f:
                raw_stocks = [line.strip() for line in f if line.strip()]
            
            stocks = []
            for s in raw_stocks:
                if not s.endswith(".NS") and not s.endswith(".BO"):
                    s += ".BO" if s.isdigit() else ".NS"
                stocks.append(s)

            total_stocks = len(stocks)
            scanned_count = 0
            gems_found = 0

            # Send initial progress
            yield f"data: {json.dumps({'type': 'start', 'total': total_stocks, 'message': f'🚀 Starting scan of {total_stocks} stocks...'})}\n\n"

            def scan_single(stock):
                try:
                    # CRITICAL: Create a fresh copy of the symbol to avoid any variable sharing issues
                    stock_symbol = str(stock)  # Ensure we have a fresh string
                    
                    # Use same interval as chart endpoint to ensure consistency
                    df = fetch_stock_data(stock_symbol, interval="1d")
                    if df is not None and len(df) > 0:
                        # CRITICAL: Create a copy of the dataframe to avoid any sharing issues
                        df = df.copy()
                        
                        # Validate that we have recent data (within last 7 days)
                        last_date = pd.to_datetime(df.index[-1])
                        today = pd.Timestamp.now().normalize()
                        days_old = (today - last_date).days
                        
                        if days_old > 7:
                            print(f"⚠️ {stock_symbol}: Data is {days_old} days old, skipping...")
                            return None
                        
                        # Validate the symbol matches what we requested
                        # Get a sample of the data to verify it's for the right stock
                        sample_close = float(df['Close'].iloc[-1])
                        
                        status = check_titan_criteria(df)
                        if status == "BUY":
                            # Get current price from the LAST row (most recent data)
                            # Ensure we're using the actual last close price
                            last_idx = len(df) - 1
                            last_close = float(df['Close'].iloc[last_idx])
                            
                            # Validate price is reasonable (not 0, not negative, not NaN)
                            if pd.isna(last_close) or last_close <= 0:
                                print(f"⚠️ {stock_symbol}: Invalid price {last_close}, skipping...")
                                return None
                            
                            current_price = round(last_close, 2)
                            rsi_val = round(float(df['RSI'].iloc[last_idx]), 1) if not pd.isna(df['RSI'].iloc[last_idx]) else 0
                            volume_x = round(float(df['Volume'].iloc[last_idx] / (df['Vol_SMA'].iloc[last_idx] + 1)), 1) if not pd.isna(df['Vol_SMA'].iloc[last_idx]) else 0
                            
                            # Debug: Log price for each stock with more details
                            print(f"\n📊 SCAN DEBUG for {stock_symbol}:")
                            print(f"  Symbol verified: {stock_symbol}")
                            print(f"  DataFrame length: {len(df)}")
                            print(f"  Last index date: {df.index[last_idx]} ({(today - last_date).days} days ago)")
                            print(f"  Last Close (raw): ₹{last_close}")
                            print(f"  Current Price (rounded): ₹{current_price}")
                            print(f"  RSI: {rsi_val}")
                            print(f"  Volume X: {volume_x}")
                            print(f"  First Close: ₹{df['Close'].iloc[0]}")
                            print(f"  Price Range: ₹{df['Close'].min():.2f} - ₹{df['Close'].max():.2f}")
                            
                            chart_df = df.tail(2000).reset_index()
                            chart_data = [
                                {"time": row['Date'].strftime('%Y-%m-%d'), 
                                 "open": row['Open'], "high": row['High'], 
                                 "low": row['Low'], "close": row['Close']}
                                for _, row in chart_df.iterrows()
                            ]
                            # Calculate supply/demand zones and market structure
                            zones = calculate_supply_demand_zones(df)
                            structure = analyze_market_structure(df)
                            has_tradingview = stock_symbol.endswith(".NS") or stock_symbol.endswith(".BO")
                            
                            result = {
                                "symbol": stock_symbol,  # Use the verified symbol
                                "current_price": current_price,
                                "rsi": rsi_val,
                                "volume_x": volume_x,
                                "status": "💎 BUY",
                                "chart_data": chart_data,
                                "zones": zones,
                                "structure": structure,
                                "has_tradingview": has_tradingview
                            }
                            
                            # Debug: Log the result being returned with symbol verification
                            print(f"  ✅ Returning result for {stock_symbol} with price: ₹{result['current_price']}")
                            print(f"  ✅ Result symbol: {result['symbol']}")
                            
                            return result
                except Exception as e:
                    print(f"⚠️ Scan error for {stock}: {str(e)[:200]}")
                    import traceback
                    traceback.print_exc()
                    pass
                return None

            # Use as_completed to get results as they finish
            with ThreadPoolExecutor(max_workers=4) as executor:
                future_to_stock = {executor.submit(scan_single, stock): stock for stock in stocks}
                
                for future in as_completed(future_to_stock):
                    stock = future_to_stock[future]
                    scanned_count += 1
                    progress = int((scanned_count / total_stocks) * 100)
                    
                    try:
                        res = future.result()
                        if res:
                            results.append(res)
                            gems_found += 1
                            # Send gem found update
                            yield f"data: {json.dumps({'type': 'gem', 'stock': stock, 'gems_found': gems_found, 'data': res})}\n\n"
                        
                        # Send progress update
                        yield f"data: {json.dumps({'type': 'progress', 'current': stock, 'scanned': scanned_count, 'total': total_stocks, 'progress': progress, 'gems_found': gems_found})}\n\n"
                    except Exception as e:
                        # Send progress update even on error
                        yield f"data: {json.dumps({'type': 'progress', 'current': stock, 'scanned': scanned_count, 'total': total_stocks, 'progress': progress, 'gems_found': gems_found, 'error': str(e)[:50]})}\n\n"

            # Send completion
            yield f"data: {json.dumps({'type': 'complete', 'gems': results, 'total_scanned': scanned_count, 'gems_found': gems_found})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

@app.post("/api/chat")
def chat_with_stock(request: ChatRequest):
    """
    PRO CHAT: Answers technical questions using Live Data, Zones, Market Structure, and Price History.
    Includes last 45 days of price action for pattern recognition (Double Top/Bottom, Flags, etc.)
    """
    try:
        # 1. Fetch Data
        df = fetch_stock_data(request.symbol, interval="1d")
        
        if df is None or df.empty:
            return {"reply": f"❌ Unable to fetch data for {request.symbol}. Please check the symbol and try again."}
        
        # 2. Calculate Advanced Metrics
        zones = calculate_supply_demand_zones(df)
        structure = analyze_market_structure(df)
        
        # 3. Extract Price Data (Today & Yesterday)
        last_row = df.iloc[-1]
        prev_row = df.iloc[-2] if len(df) > 1 else last_row  # Yesterday
        
        curr_price = float(last_row['Close'])
        today_high = float(last_row['High'])
        today_low = float(last_row['Low'])
        
        yest_close = float(prev_row['Close'])
        yest_high = float(prev_row['High'])
        yest_low = float(prev_row['Low'])
        
        # 4. Technical Indicators
        rsi = round(float(last_row['RSI']), 2) if 'RSI' in df.columns and not pd.isna(last_row['RSI']) else "N/A"
        ema50 = round(float(last_row['EMA_50']), 2) if 'EMA_50' in df.columns and not pd.isna(last_row['EMA_50']) else "N/A"
        ema200 = round(float(last_row['EMA_200']), 2) if 'EMA_200' in df.columns and not pd.isna(last_row['EMA_200']) else "N/A"
        
        volume_spike = None
        if 'Volume' in df.columns and 'Vol_SMA' in df.columns:
            vol = float(last_row['Volume'])
            vol_sma = float(last_row['Vol_SMA'])
            if not pd.isna(vol) and not pd.isna(vol_sma) and vol_sma > 0:
                volume_spike = round(vol / vol_sma, 2)
        
        # 5. Format Zones Text
        zones_text = "No major zones detected nearby."
        if zones and len(zones) > 0:
            zones_list = []
            for zone in zones[:5]:  # Show top 5 zones
                zone_type = zone.get('type', '').upper()
                strength = zone.get('strength', 0)
                bottom = zone.get('bottom', 0)
                top = zone.get('top', 0)
                
                # Determine strength label
                if strength >= 4:
                    strength_label = "Strong"
                elif strength >= 3:
                    strength_label = "Medium"
                else:
                    strength_label = "Weak"
                
                zones_list.append(f"{zone_type} at ₹{bottom:.2f}-₹{top:.2f} (Strength: {strength}, {strength_label})")
            
            zones_text = "\n".join(zones_list)
        
        # 6. Format Price Action History (Last 45 Days) for Pattern Recognition
        # Compact format: Date|Open|High|Low|Close
        history_str = "Date|Open|High|Low|Close\n"
        recent_df = df.tail(45).reset_index()
        
        for _, row in recent_df.iterrows():
            # Find date column (could be 'Date' or index name)
            date_val = None
            if 'Date' in row:
                date_val = row['Date']
            elif hasattr(row, 'name') and row.name is not None:
                date_val = row.name
            else:
                # Try to find datetime column
                for col in recent_df.columns:
                    if pd.api.types.is_datetime64_any_dtype(recent_df[col]):
                        date_val = row[col]
                        break
            
            if date_val is None:
                date_str = str(row.name) if hasattr(row, 'name') else "N/A"
            else:
                date_str = pd.to_datetime(date_val).strftime('%Y-%m-%d')
            
            history_str += f"{date_str}|{row['Open']:.1f}|{row['High']:.1f}|{row['Low']:.1f}|{row['Close']:.1f}\n"
        
        # 7. MASTER PROMPT with Complete Context
        prompt = f"""You are an expert Trading Assistant (Titan AI) for the Indian Stock Market (NSE). Answer based strictly on the data below.

### 📊 LIVE MARKET DATA for {request.symbol}:

- Current Price: ₹{curr_price:.2f}
- Trend Structure: {structure if structure else 'Not Available'}
- Today's Range: ₹{today_low:.2f} - ₹{today_high:.2f}
- Yesterday's Range: ₹{yest_low:.2f} - ₹{yest_high:.2f} (Close: ₹{yest_close:.2f})
- Indicators: RSI={rsi}, EMA50={ema50}, EMA200={ema200}
{f"- Volume Spike: {volume_spike}x average" if volume_spike else ""}

### 🧱 SUPPORT & RESISTANCE ZONES:

{zones_text}

### 📉 PRICE ACTION HISTORY (Last 45 Days - For Pattern/Wave Analysis):

{history_str}

### USER QUESTION: 
"{request.question}"

### INSTRUCTIONS:
- If asked about Support/Resistance, quote the specific Zone levels provided above.
- If asked about "Yesterday", use the Yesterday's Range data.
- If asked about Patterns (Double Top/Bottom, Head & Shoulders, Flags, Triangles, etc.), analyze the 'Price Action History' table above.
- If asked about Elliott Wave or price waves, look for Higher Highs, Lower Lows, and consolidation patterns in the history.
- If asked about "nearest support", identify the closest SUPPORT zone below the current price (₹{curr_price:.2f}).
- If asked about "nearest resistance", identify the closest RESISTANCE zone above the current price (₹{curr_price:.2f}).
- Keep the answer short, professional, data-backed, and actionable.
- Use the price history to identify chart patterns and trend structures."""
        
        # Debug logging
        print(f"\n📊 CHAT REQUEST DEBUG:")
        print(f"  Symbol: {request.symbol}")
        print(f"  Question: {request.question}")
        print(f"  Current Price: ₹{curr_price:.2f}")
        print(f"  Structure: {structure}")
        print(f"  Zones found: {len(zones) if zones else 0}")
        print(f"  History data points: {len(recent_df)} days")
        
        # Check if API key is configured
        gemini_api_key = os.getenv('GEMINI_API_KEY')
        if not gemini_api_key:
            return {"reply": "❌ AI service is not configured. Please set GEMINI_API_KEY in .env file."}
        
        # Generate response using Gemini
        try:
            genai.configure(api_key=gemini_api_key)
            model = genai.GenerativeModel('gemini-2.0-flash')
            
            # Debug: Log the prompt being sent (truncated for readability)
            print(f"\n📤 SENDING TO GEMINI (prompt length: {len(prompt)} chars):")
            print(f"  First 500 chars: {prompt[:500]}...")
            print(f"  History section length: {len(history_str)} chars")
            
            response = model.generate_content(prompt)
            
            reply = response.text.strip()
            
            # Debug: Log the response
            print(f"\n📥 RECEIVED FROM GEMINI:")
            print(f"  Response length: {len(reply)} chars")
            print(f"  First 200 chars: {reply[:200]}...")
            
            return {"reply": reply}
            
        except Exception as e:
            print(f"\n❌ GEMINI ERROR: {str(e)}")
            return {"reply": f"❌ Error generating AI response: {str(e)}"}
            
    except Exception as e:
        print(f"❌ Chat Error: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"reply": f"❌ Error processing request: {str(e)}"}


@app.post("/api/chat/stream")
async def chat_with_stock_stream(request: ChatRequest):
    """
    Streaming version of chat endpoint - returns Server-Sent Events (SSE)
    """
    async def generate():
        try:
            # 1. Fetch Data
            df = fetch_stock_data(request.symbol, interval="1d")
            
            if df is None or df.empty:
                yield f"data: {json.dumps({'text': f'❌ Unable to fetch data for {request.symbol}. Please check the symbol and try again.', 'done': True})}\n\n"
                return
            
            # 2. Calculate Advanced Metrics
            zones = calculate_supply_demand_zones(df)
            structure = analyze_market_structure(df)
            
            # 3. Extract Price Data (Today & Yesterday)
            last_row = df.iloc[-1]
            prev_row = df.iloc[-2] if len(df) > 1 else last_row
            
            curr_price = float(last_row['Close'])
            today_high = float(last_row['High'])
            today_low = float(last_row['Low'])
            
            yest_close = float(prev_row['Close'])
            yest_high = float(prev_row['High'])
            yest_low = float(prev_row['Low'])
            
            # 4. Technical Indicators
            rsi = round(float(last_row['RSI']), 2) if 'RSI' in df.columns and not pd.isna(last_row['RSI']) else "N/A"
            ema50 = round(float(last_row['EMA_50']), 2) if 'EMA_50' in df.columns and not pd.isna(last_row['EMA_50']) else "N/A"
            ema200 = round(float(last_row['EMA_200']), 2) if 'EMA_200' in df.columns and not pd.isna(last_row['EMA_200']) else "N/A"
            
            volume_spike = None
            if 'Volume' in df.columns and 'Vol_SMA' in df.columns:
                vol = float(last_row['Volume'])
                vol_sma = float(last_row['Vol_SMA'])
                if not pd.isna(vol) and not pd.isna(vol_sma) and vol_sma > 0:
                    volume_spike = round(vol / vol_sma, 2)
            
            # 5. Format Zones Text
            zones_text = "No major zones detected nearby."
            if zones and len(zones) > 0:
                zones_list = []
                for zone in zones[:5]:
                    zone_type = zone.get('type', '').upper()
                    strength = zone.get('strength', 0)
                    bottom = zone.get('bottom', 0)
                    top = zone.get('top', 0)
                    
                    if strength >= 4:
                        strength_label = "Strong"
                    elif strength >= 3:
                        strength_label = "Medium"
                    else:
                        strength_label = "Weak"
                    
                    zones_list.append(f"{zone_type} at ₹{bottom:.2f}-₹{top:.2f} (Strength: {strength}, {strength_label})")
                
                zones_text = "\n".join(zones_list)
            
            # 6. Format Price Action History
            history_str = "Date|Open|High|Low|Close\n"
            recent_df = df.tail(45).reset_index()
            
            for _, row in recent_df.iterrows():
                date_val = None
                if 'Date' in row:
                    date_val = row['Date']
                elif hasattr(row, 'name') and row.name is not None:
                    date_val = row.name
                else:
                    for col in recent_df.columns:
                        if pd.api.types.is_datetime64_any_dtype(recent_df[col]):
                            date_val = row[col]
                            break
                
                if date_val is None:
                    date_str = str(row.name) if hasattr(row, 'name') else "N/A"
                else:
                    date_str = pd.to_datetime(date_val).strftime('%Y-%m-%d')
                
                history_str += f"{date_str}|{row['Open']:.1f}|{row['High']:.1f}|{row['Low']:.1f}|{row['Close']:.1f}\n"
            
            # 7. MASTER PROMPT
            prompt = f"""You are an expert Trading Assistant (Titan AI) for the Indian Stock Market (NSE). Answer based strictly on the data below.

### 📊 LIVE MARKET DATA for {request.symbol}:

- Current Price: ₹{curr_price:.2f}
- Trend Structure: {structure if structure else 'Not Available'}
- Today's Range: ₹{today_low:.2f} - ₹{today_high:.2f}
- Yesterday's Range: ₹{yest_low:.2f} - ₹{yest_high:.2f} (Close: ₹{yest_close:.2f})
- Indicators: RSI={rsi}, EMA50={ema50}, EMA200={ema200}
{f"- Volume Spike: {volume_spike}x average" if volume_spike else ""}

### 🧱 SUPPORT & RESISTANCE ZONES:

{zones_text}

### 📉 PRICE ACTION HISTORY (Last 45 Days - For Pattern/Wave Analysis):

{history_str}

### USER QUESTION: 
"{request.question}"

### INSTRUCTIONS:
- If asked about Support/Resistance, quote the specific Zone levels provided above.
- If asked about "Yesterday", use the Yesterday's Range data.
- If asked about Patterns (Double Top/Bottom, Head & Shoulders, Flags, Triangles, etc.), analyze the 'Price Action History' table above.
- If asked about Elliott Wave or price waves, look for Higher Highs, Lower Lows, and consolidation patterns in the history.
- If asked about "nearest support", identify the closest SUPPORT zone below the current price (₹{curr_price:.2f}).
- If asked about "nearest resistance", identify the closest RESISTANCE zone above the current price (₹{curr_price:.2f}).
- Keep the answer short, professional, data-backed, and actionable.
- Use the price history to identify chart patterns and trend structures."""
            
            # Check if API key is configured
            gemini_api_key = os.getenv('GEMINI_API_KEY')
            if not gemini_api_key:
                yield f"data: {json.dumps({'text': '❌ AI service is not configured. Please set GEMINI_API_KEY in .env file.', 'done': True})}\n\n"
                return
            
            # Generate streaming response using Gemini
            genai.configure(api_key=gemini_api_key)
            model = genai.GenerativeModel('gemini-2.0-flash')
            
            # Use generate_content with stream=True
            response = model.generate_content(prompt, stream=True)
            
            # Stream the response word by word
            for chunk in response:
                if chunk.text:
                    # Send each chunk as SSE
                    yield f"data: {json.dumps({'text': chunk.text, 'done': False})}\n\n"
            
            # Send completion signal
            yield f"data: {json.dumps({'text': '', 'done': True})}\n\n"
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            print(f"❌ Stream Chat Error: {str(e)}")
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'text': f'❌ Error: {str(e)}', 'done': True})}\n\n"
    
    return StreamingResponse(generate(), media_type="text/event-stream")