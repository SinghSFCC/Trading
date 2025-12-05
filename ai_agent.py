import google.generativeai as genai
import json
import os

# --- CONFIGURATION ---
# Aapki API Key (Jo aapne file me di thi)
GEMINI_API_KEY = "AIzaSyBpiNqjZFl_6TE2RWgEy_UubLQ8qIBlD5k" 
genai.configure(api_key=GEMINI_API_KEY)

def audit_stock(symbol, price, rsi, volume_x, recent_trend):
    """
    Sends stock data to Gemini 2.0 Flash for a Swing Trading Audit.
    """
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