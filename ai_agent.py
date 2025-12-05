import google.generativeai as genai
import json
import os
from dotenv import load_dotenv

# Load environment variables from .env file
# Handle encoding errors gracefully
from pathlib import Path

# Get the directory where this script is located
script_dir = Path(__file__).parent
env_path = script_dir / '.env'

# Read .env file directly (most reliable method)
GEMINI_API_KEY = None
if env_path.exists():
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip()
                    os.environ[key] = value
                    if key == 'GEMINI_API_KEY':
                        GEMINI_API_KEY = value
        if GEMINI_API_KEY:
            print(f"✅ Successfully loaded GEMINI_API_KEY from .env file (length: {len(GEMINI_API_KEY)})")
        else:
            print(f"⚠️ .env file exists but GEMINI_API_KEY not found in it")
    except Exception as e:
        print(f"❌ Failed to read .env file: {e}")
else:
    print(f"⚠️ .env file not found at: {env_path}")
    # Try load_dotenv as fallback
    try:
        load_dotenv(override=True)
        GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
        if GEMINI_API_KEY:
            print(f"✅ Loaded GEMINI_API_KEY via load_dotenv")
    except Exception as e:
        print(f"⚠️ load_dotenv also failed: {e}")

# Final check - get from environment if still not set
if not GEMINI_API_KEY:
    GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

if not GEMINI_API_KEY:
    print("⚠️ WARNING: GEMINI_API_KEY not found in environment variables!")
    print("⚠️ Please create a .env file with: GEMINI_API_KEY=your_api_key_here")
    print("⚠️ AI features will not work until API key is configured.")
else:
    genai.configure(api_key=GEMINI_API_KEY)

def audit_stock(symbol, price, rsi, volume_x, recent_trend):
    """
    Sends stock data to Gemini 2.0 Flash for a Swing Trading Audit.
    """
    # Check if API key is configured
    if not GEMINI_API_KEY:
        print(f"⚠️ AI AGENT: API key not configured. Skipping analysis for {symbol}...")
        return {
            "verdict": "ERROR",
            "reason": "API key not configured. Please set GEMINI_API_KEY in .env file.",
            "stopLoss": 0,
            "target": 0
        }
    
    print(f"\n🤖 AI AGENT ACTIVE: Analyzing {symbol}...")
    
    # Using the latest fast model available to your key
    model = genai.GenerativeModel('gemini-2.0-flash')

    prompt = f"""
    Act as a strict Hedge Fund Manager trading the Indian Stock Market (NSE). 
    Review this swing trading setup for stock: {symbol}

    ### TECHNICAL DATA:
    - Current Price: ₹{price}
    - RSI (14): {rsi} (Sweet spot for momentum is 55-70. Overbought > 75)
    - Volume Spike: {volume_x}x average (Needs to be > 1.5x for conviction)
    - Recent Trend (Last 5 days close): {recent_trend}

    ### YOUR JOB:
    Analyze this data based on Mark Minervini's VCP (Volatility Contraction Pattern) and Momentum rules.
    
    ### OUTPUT FORMAT (Strict JSON):
    Return ONLY a JSON object with these exact keys. Do not use markdown code blocks.
    {{
        "verdict": "STRONG BUY" or "WAIT" or "AVOID",
        "reason": "A sharp, professional 2-sentence analysis of the setup.",
        "stopLoss": "Suggested SL price (approx 5-7% below current)",
        "target": "Suggested Target price (approx 15-20% above current)"
    }}
    """

    try:
        response = model.generate_content(prompt)
        
        # Clean up response (Remove ```json and ``` if Gemini adds them)
        clean_text = response.text.replace("```json", "").replace("```", "").strip()
        result = json.loads(clean_text)
        
        print(f"✅ AI Verdict for {symbol}: {result['verdict']}")
        return result
        
    except Exception as e:
        print(f"❌ AI Error: {str(e)}")
        return {
            "verdict": "ERROR",
            "reason": "AI Connection Failed. Please try again.",
            "stopLoss": 0,
            "target": 0
        }