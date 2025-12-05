import yfinance as yf
import pandas_ta as ta
import pandas as pd
import sys
import os

# --- CONFIGURATION ---
# Agar aapko har stock ka detail dekhna hai to isse True karein
DEBUG_MODE = False  
# ---------------------

# Jadu: Error Messages ko Hide karne ke liye
class SuppressOutput:
    def __enter__(self):
        self._original_stdout = sys.stdout
        self._original_stderr = sys.stderr
        sys.stdout = open(os.devnull, 'w')
        sys.stderr = open(os.devnull, 'w')

    def __exit__(self, exc_type, exc_val, exc_tb):
        sys.stdout.close()
        sys.stderr.close()
        sys.stdout = self._original_stdout
        sys.stderr = self._original_stderr

# 1. READ STOCKS
def get_stock_list():
    try:
        with open("stocks.txt", "r") as f:
            raw_stocks = [line.strip() for line in f if line.strip()]
            cleaned_stocks = []
            for s in raw_stocks:
                if not s.endswith(".NS") and not s.endswith(".BO"):
                    s += ".BO" if s.isdigit() else ".NS"
                cleaned_stocks.append(s)
            return list(set(cleaned_stocks))
    except FileNotFoundError:
        print("❌ Error: 'stocks.txt' file nahi mili!")
        return []

# 2. THE SCANNER
def scan_market():
    stock_list = get_stock_list()
    total_stocks = len(stock_list)
    
    print(f"\n🚀 TITAN BOT v4.0 INITIALIZED")
    print(f"🎯 Target: {total_stocks} Stocks")
    print(f"🛠️ Mode: {'AUDIT (Detailed)' if DEBUG_MODE else 'SILENT (Winners Only)'}")
    print("-" * 75)
    
    if DEBUG_MODE:
         print(f"{'STOCK':<15} | {'PRICE':<10} | {'EMA50':<10} | {'RSI':<5} | {'VOL x':<5} | {'RESULT'}")
         print("-" * 75)

    gems_found = []
    scanned_count = 0

    for symbol in stock_list:
        scanned_count += 1
        
        # Progress Bar (Sirf Silent Mode mein dikhaye)
        if not DEBUG_MODE:
            print(f"\r🔍 Scanning {scanned_count}/{total_stocks}: {symbol:<15}", end="", flush=True)

        try:
            # Silent Download
            with SuppressOutput():
                df = yf.download(symbol, period="6mo", interval="1d", progress=False, auto_adjust=True)
            
            if df.empty or len(df) < 50:
                if DEBUG_MODE: print(f"{symbol:<15} | {'N/A':<10} | {'N/A':<10} | {'N/A':<5} | {'N/A':<5} | ❌ NO DATA")
                continue

            # Clean Data
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            # Indicators Calculation
            close = df['Close']
            df['EMA_50'] = ta.ema(close, length=50)
            df['RSI'] = ta.rsi(close, length=14)
            df['Vol_SMA'] = ta.sma(df['Volume'], length=20)

            # Current Values
            curr_price = close.iloc[-1]
            curr_rsi = df['RSI'].iloc[-1]
            curr_ema = df['EMA_50'].iloc[-1]
            curr_vol = df['Volume'].iloc[-1]
            avg_vol = df['Vol_SMA'].iloc[-1]
            prev_high = df['High'].iloc[-2]
            
            # Avoid Zero Division
            if avg_vol == 0: avg_vol = 1 
            vol_ratio = curr_vol / avg_vol

            # --- TITAN STRATEGY CHECKS ---
            
            # 1. Trend Check
            trend_ok = curr_price > curr_ema
            
            # 2. Momentum Check
            rsi_ok = 50 < curr_rsi < 75
            
            # 3. Volume Check
            vol_ok = vol_ratio > 1.5
            
            # 4. Breakout Check
            breakout_ok = curr_price > prev_high

            # LOGIC FOR DEBUGGING
            status = "WAIT"
            if trend_ok and rsi_ok and vol_ok and breakout_ok:
                status = "💎 BUY"
                gems_found.append({
                    'Stock': symbol,
                    'Price': curr_price,
                    'RSI': curr_rsi,
                    'Vol_X': vol_ratio
                })
            elif not trend_ok: status = "Downtrend"
            elif not rsi_ok: status = f"Weak RSI ({curr_rsi:.0f})"
            elif not vol_ok: status = "Low Vol"
            elif not breakout_ok: status = "No Breakout"

            # Print Line if Debug Mode is ON
            if DEBUG_MODE:
                print(f"{symbol:<15} | {curr_price:<10.2f} | {curr_ema:<10.2f} | {curr_rsi:<5.0f} | {vol_ratio:<5.1f} | {status}")

        except Exception as e:
            if DEBUG_MODE: print(f"{symbol:<15} | ERROR: {e}")
            continue

    # 3. FINAL REPORT
    if not DEBUG_MODE:
        print(f"\r✅ Scanning Complete! {total_stocks} Stocks Processed.       ")
    
    print("\n" + "=" * 60)
    print(f"{'STOCK':<20} | {'PRICE':<10} | {'RSI':<5} | {'VOL SPIKE'}")
    print("-" * 60)

    if gems_found:
        for gem in gems_found:
            print(f"{gem['Stock']:<20} | {gem['Price']:<10.2f} | {gem['RSI']:<5.0f} | {gem['Vol_X']:.1f}x Avg")
    else:
        print("😕 Aaj koi Titan Stock nahi mila. Cash is King!")

    print("=" * 60)
    print("👉 Note: TradingView par VCP Pattern confirm zaroor karein.")

if __name__ == "__main__":
    scan_market()