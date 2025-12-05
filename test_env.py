from dotenv import load_dotenv, dotenv_values
import os
from pathlib import Path

env_path = Path('.env')
print(f"Env file exists: {env_path.exists()}")
print(f"Env file path: {env_path.absolute()}")

# Read raw values
values = dotenv_values(dotenv_path=env_path)
print(f"\n📋 Raw values from dotenv_values:")
print(f"Keys found: {list(values.keys())}")
print(f"GEMINI_API_KEY in values: {'GEMINI_API_KEY' in values}")
if 'GEMINI_API_KEY' in values:
    val = values['GEMINI_API_KEY']
    print(f"Value: {val}")
    print(f"Value type: {type(val)}")
    print(f"Value length: {len(val) if val else 0}")

# Try load_dotenv
print(f"\n📋 After load_dotenv:")
result = load_dotenv(dotenv_path=env_path, override=True)
print(f"load_dotenv returned: {result}")

key = os.getenv('GEMINI_API_KEY')
print(f"os.getenv('GEMINI_API_KEY'): {key}")
print(f"Type: {type(key)}")
if key:
    print(f"Length: {len(key)}")
    print(f"First 10 chars: {key[:10]}")

