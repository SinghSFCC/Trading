import yfinance as yf
import pandas_ta as ta
import pandas as pd
import sys
import os

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
    
    print(f"\n🚀 TITAN BOT v3.0 STARTED")
    print(f"🎯 Target: Scanning {total_stocks} Stocks for Momentum...")
    print("⏳ Please wait... (Errors will be ignored silently)")
    print("-" * 60)

    gems_found = []
    skipped_count = 0
    scanned_count = 0

    for symbol in stock_list:
        scanned_count += 1
        # Progress Indicator (overwrite same line)
        print(f"\r🔍 Scanning {scanned_count}/{total_stocks}: {symbol:<15}", end="", flush=True)

        try:
            # Silent Download (Errors Chupao)
            with SuppressOutput():
                df = yf.download(symbol, period="6mo", interval="1d", progress=False, auto_adjust=True)
            
            if df.empty or len(df) < 50:
                skipped_count += 1
                continue

            # Clean Data
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)

            # Indicators
            close = df['Close']
            df['EMA_50'] = ta.ema(close, length=50)
            df['RSI'] = ta.rsi(close, length=14)
            df['Vol_SMA'] = ta.sma(df['Volume'], length=20)

            # Today's Values
            curr_price = close.iloc[-1]
            curr_rsi = df['RSI'].iloc[-1]
            curr_ema = df['EMA_50'].iloc[-1]
            curr_vol = df['Volume'].iloc[-1]
            avg_vol = df['Vol_SMA'].iloc[-1]
            prev_high = df['High'].iloc[-2]

            # --- STRATEGY ---
            trend_ok = curr_price > curr_ema
            rsi_ok = 50 < curr_rsi < 75
            vol_ok = curr_vol > (avg_vol * 1.5)
            breakout_ok = curr_price > prev_high

            if trend_ok and rsi_ok and vol_ok and breakout_ok:
                gems_found.append({
                    'Stock': symbol,
                    'Price': round(curr_price, 2),
                    'RSI': round(curr_rsi, 0)
                })

        except Exception:
            skipped_count += 1
            continue

    # 3. FINAL REPORT
    print(f"\r✅ Scanning Complete! {total_stocks} Stocks Processed.      ")
    print("=" * 60)
    print(f"{'STOCK':<20} | {'PRICE (Rs)':<12} | {'RSI':<5} | {'VERDICT'}")
    print("-" * 60)

    if gems_found:
        for gem in gems_found:
            print(f"{gem['Stock']:<20} | {gem['Price']:<12} | {gem['RSI']:<5.0f} | 💎 BUY")
    else:
        print("😕 No stocks matched the Titan Strategy today.")

    print("=" * 60)
    print(f"📊 Summary: Found {len(gems_found)} Gems. (Skipped {skipped_count} invalid/delisted symbols)")
    print("👉 Next Step: Check these charts on TradingView manually.")

if __name__ == "__main__":
    scan_market()