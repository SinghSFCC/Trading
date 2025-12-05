"""
Quick test to check yfinance historical data limits
"""
import yfinance as yf
import pandas as pd
from datetime import datetime

print("🚀 Starting yfinance limits test...")
print("=" * 70)

# Test with a popular Indian stock
test_symbol = "RELIANCE.NS"
print(f"\n📊 Testing with: {test_symbol}\n")

# Quick test - just the important periods
test_cases = [
    ("1y", "1 year - CURRENT"),
    ("2y", "2 years"),
    ("5y", "5 years"),
    ("10y", "10 years"),
    ("max", "MAXIMUM AVAILABLE")
]

print("Testing periods (this may take 30-60 seconds)...\n")

results = {}
for period, desc in test_cases:
    print(f"⏳ Testing {period} ({desc})...", end=" ", flush=True)
    try:
        df = yf.download(test_symbol, period=period, interval="1d", progress=False, auto_adjust=True, timeout=10)
        if not df.empty:
            date_range = f"{df.index[0].strftime('%Y-%m-%d')} to {df.index[-1].strftime('%Y-%m-%d')}"
            days = len(df)
            years = (df.index[-1] - df.index[0]).days / 365.25
            results[period] = {
                "rows": days,
                "years": years,
                "date_range": date_range,
                "success": True
            }
            print(f"✅ {days:>4} rows (~{years:.1f} years) | {date_range}")
        else:
            results[period] = {"success": False}
            print("❌ No data")
    except Exception as e:
        results[period] = {"success": False, "error": str(e)}
        print(f"❌ Error: {str(e)[:40]}")

print("\n" + "=" * 70)
print("📈 RESULTS SUMMARY")
print("=" * 70)

if "max" in results and results["max"]["success"]:
    max_data = results["max"]
    print(f"\n✅ MAXIMUM DATA AVAILABLE:")
    print(f"   • Total Rows: {max_data['rows']:,} days")
    print(f"   • Date Range: {max_data['date_range']}")
    print(f"   • Total Years: {max_data['years']:.2f} years")

print("\n💡 RECOMMENDATIONS:")
print("   • Current code uses: period='1y' (1 year only)")
print("   • Recommended: period='max' (all available data)")
print("   • For chart display: Still limit to last 200-500 days for performance")
print("   • For indicators: More data = better EMA_200, RSI calculations")

print("\n" + "=" * 70)
print("✅ Test complete!")
