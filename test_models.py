import google.generativeai as genai
import os
from dotenv import load_dotenv

# Load environment variables from .env file
# Handle encoding errors gracefully
try:
    load_dotenv()
except UnicodeDecodeError as e:
    print(f"⚠️ WARNING: Error reading .env file (encoding issue): {e}")
    print("⚠️ Please ensure .env file is saved as UTF-8 encoding (not UTF-16)")
    print("⚠️ Recreate the .env file with: GEMINI_API_KEY=your_api_key_here")
    exit(1)
except Exception as e:
    print(f"⚠️ WARNING: Error loading .env file: {e}")
    exit(1)

# Get API Key from environment variable
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

if not GEMINI_API_KEY:
    print("❌ ERROR: GEMINI_API_KEY not found in environment variables!")
    print("❌ Please create a .env file with: GEMINI_API_KEY=your_api_key_here")
    exit(1)

genai.configure(api_key=GEMINI_API_KEY)

print("🔍 Checking available models for your API Key...")

try:
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(f"✅ Available: {m.name}")
except Exception as e:
    print(f"❌ Error: {e}")