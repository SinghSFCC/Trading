# Trading - Titan Professional Trading Terminal

A professional trading terminal application for Indian stock market (NSE) analysis with AI-powered stock auditing.

## Features

- **Market Scanner**: Scans stocks based on Titan momentum strategy criteria
- **Real-time Charting**: Interactive candlestick charts with up to 2000 days of historical data
- **AI-Powered Analysis**: Google Gemini AI integration for stock auditing and recommendations
- **Technical Indicators**: EMA_50, EMA_200, RSI, Volume analysis
- **Professional UI**: Modern trading terminal interface with dark theme

## Tech Stack

### Backend
- **FastAPI**: Python web framework
- **yfinance**: Yahoo Finance data fetching (up to ~30 years historical data)
- **pandas_ta**: Technical analysis indicators
- **Google Generative AI**: Gemini AI for stock analysis

### Frontend
- **React**: UI framework
- **Vite**: Build tool
- **Tailwind CSS**: Styling
- **lightweight-charts**: Professional charting library

## Setup

### Backend

1. Install Python 3.12 (required for dependencies)
2. Install dependencies:
```bash
py -3.12 -m pip install fastapi uvicorn yfinance pandas pandas_ta google-generativeai
```

3. Update `ai_agent.py` with your Google Gemini API key

4. Run the backend:
```bash
python main.py
# or
uvicorn main:app --reload
```

### Frontend

1. Navigate to frontend directory:
```bash
cd titan-frontend
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

## Usage

1. Add stock symbols to `stocks.txt` (one per line, without .NS suffix)
2. Start the backend server
3. Start the frontend server
4. Click "SCAN MARKET" to scan stocks
5. Click on a stock to view detailed chart and analysis
6. Click "AI AUDIT" to get AI-powered stock analysis

## Strategy Criteria

The scanner identifies stocks matching:
- **Trend**: Price > EMA_50 > EMA_200
- **Momentum**: RSI between 50-75
- **Volume**: Current volume > 1.5x average volume
- **Breakout**: Current close > Previous high

## License

MIT


