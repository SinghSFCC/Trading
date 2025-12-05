import google.generativeai as genai
import os

# YAHAN APNI API KEY DALO
GEMINI_API_KEY = "AIzaSyBpiNqjZFl_6TE2RWgEy_UubLQ8qIBlD5k" 
genai.configure(api_key=GEMINI_API_KEY)

print("🔍 Checking available models for your API Key...")

try:
    for m in genai.list_models():
        if 'generateContent' in m.supported_generation_methods:
            print(f"✅ Available: {m.name}")
except Exception as e:
    print(f"❌ Error: {e}")