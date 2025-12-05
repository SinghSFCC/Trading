import { useState, useEffect } from 'react';
import axios from 'axios';
import { Search, Cpu, Activity, TrendingUp, BarChart2, Loader2, Target, ShieldAlert, Zap, TrendingDown, DollarSign, Clock, AlertCircle, X, Settings, LineChart, ChevronRight, ChevronLeft } from 'lucide-react';
import TitanChart from './components/TitanChart';
import TitanChat from './components/TitanChat';

export default function App() {
  const [stocks, setStocks] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [aiVerdict, setAiVerdict] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [timeframe, setTimeframe] = useState("1d");
  const [chartLoading, setChartLoading] = useState(false);
  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false);
  const [showRightSidebar, setShowRightSidebar] = useState(false);
  const [showLeftSidebar, setShowLeftSidebar] = useState(false);
  
  // Indicator configuration state
  const [indicators, setIndicators] = useState({
    ema50: false,
    ema200: false,
  });

  // Available timeframes
  const timeframes = [
    { value: "1m", label: "1 Min" },
    { value: "5m", label: "5 Min" },
    { value: "15m", label: "15 Min" },
    { value: "30m", label: "30 Min" },
    { value: "1h", label: "1 Hour" },
    { value: "1d", label: "1 Day" },
    { value: "1wk", label: "1 Week" },
    { value: "1mo", label: "1 Month" },
  ];


  // Close indicator panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showIndicatorPanel && !event.target.closest('.indicator-panel') && !event.target.closest('[title="Indicator Settings"]')) {
        setShowIndicatorPanel(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showIndicatorPanel]);

  // Fetch chart data when timeframe or stock changes
  useEffect(() => {
    if (selectedStock && selectedStock.symbol) {
      fetchChartData(selectedStock.symbol, timeframe);
    }
  }, [timeframe]);

  // Fetch chart data
  const fetchChartData = async (symbol, interval) => {
    if (!symbol) return;
    
    setChartLoading(true);
    try {
      const res = await axios.get(`http://127.0.0.1:8000/api/chart/${symbol}`, {
        params: { interval }
      });
      
      if (res.data && res.data.data) {
        setSelectedStock(prev => ({
          ...prev,
          chart_data: res.data.data,
          current_timeframe: interval
        }));
      }
    } catch (error) {
      console.error("Chart data fetch error:", error);
    } finally {
      setChartLoading(false);
    }
  };

  // Scan Engine
  const runScan = async () => {
    setLoading(true);
    setStocks([]);
    setSelectedStock(null);
    setScanStatus("🚀 Initializing Scanner...");
    
    try {
      setTimeout(() => setScanStatus("📡 Connecting to NSE Data Feed..."), 1000);
      setTimeout(() => setScanStatus("🔍 Scanning Watchlist... (Takes ~30-60s)"), 2000);

      const res = await axios.get('http://127.0.0.1:8000/api/bulk_scan'); 
      
      if (res.data.gems && res.data.gems.length > 0) {
        setStocks(res.data.gems);
        setScanStatus(`✅ Scan Complete! Found ${res.data.gems.length} Gems.`);
      } else {
        setScanStatus("⚠️ No stocks matched Titan criteria today.");
      }
    } catch (err) {
      console.error("Scan Error:", err);
      setScanStatus("❌ Connection Error. Is Backend Running?");
    }
    setLoading(false);
  };

  // UI Handlers
  const handleStockClick = (stock) => {
    setSelectedStock(stock);
    setAiVerdict(null);
    setShowAudit(false);
    setShowLeftSidebar(false);
    if (stock.symbol) {
      fetchChartData(stock.symbol, timeframe);
    }
  };

  // AI Audit Integration
  const askGemini = async () => {
    if (!selectedStock) return;
    
    setAiLoading(true);
    setAiVerdict(null);
    setShowAudit(false);
    
    try {
      const res = await axios.get(`http://127.0.0.1:8000/api/audit/${selectedStock.symbol}`);
      
      if (res.data) {
        setAiVerdict(res.data);
        setShowAudit(true);
      } else {
        console.error("No data in AI response");
        setAiVerdict({
          verdict: "ERROR",
          reason: "No data received from server",
          stopLoss: "-",
          target: "-"
        });
        setShowAudit(true);
      }
    } catch (error) {
      console.error("AI Audit Error:", error.response?.data || error.message);
      setAiVerdict({
        verdict: "ERROR",
        reason: error.response?.data?.reason || "Could not connect to Gemini AI. Check backend logs.",
        stopLoss: error.response?.data?.stopLoss || "-",
        target: error.response?.data?.target || "-"
      });
      setShowAudit(true);
    } finally {
      setAiLoading(false);
    }
  };


  return (
    <div className="flex h-screen w-screen bg-[#000000] text-[#E0E0E0] font-mono overflow-hidden">
      
      {/* Backdrop Overlay - Shows when left sidebar is open */}
      {showLeftSidebar && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 transition-opacity duration-500 ease-in-out"
          onClick={() => setShowLeftSidebar(false)}
          style={{
            opacity: showLeftSidebar ? 1 : 0,
            pointerEvents: showLeftSidebar ? 'auto' : 'none'
          }}
        />
      )}

      {/* Left Panel: Scanner & Watchlist */}
      <div 
        className="fixed left-0 top-0 h-full border-r border-[#1A1A1A] flex flex-col bg-[#0A0A0A] overflow-x-hidden overflow-y-auto transition-all duration-500 ease-in-out z-30 shadow-2xl"
        style={{
          width: showLeftSidebar ? '320px' : '0',
          boxShadow: showLeftSidebar ? '4px 0 20px rgba(0, 0, 0, 0.5)' : 'none'
        }}
      >
        {/* Terminal Header */}
        <div className="px-4 py-3 border-b border-[#1A1A1A] bg-[#050505] relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#00FF00] animate-pulse"></div>
              <h1 className="text-sm font-bold text-[#00FF00] tracking-widest">TITAN</h1>
            </div>
            <span className="text-[10px] text-[#666] uppercase">v2.0</span>
          </div>
          <p className="text-[9px] text-[#555] mt-1 uppercase tracking-wider">Professional Trading Terminal</p>
          
          {/* Close Button */}
          {showLeftSidebar && (
            <button
              onClick={() => setShowLeftSidebar(false)}
              className="absolute top-3 right-3 text-[#666] hover:text-[#E0E0E0] transition-colors p-1.5 rounded hover:bg-[#1A1A1A] z-20"
              title="Close Sidebar"
            >
              <X size={16} />
            </button>
          )}
        </div>
        
        {/* Sidebar Content */}
        <div style={{ display: showLeftSidebar ? 'block' : 'none' }}>
        
        {/* Scanner Control */}
        <div className="p-3 border-b border-[#1A1A1A] bg-[#0F0F0F]">
          <button 
            onClick={runScan}
            disabled={loading}
            className={`w-full py-2.5 rounded text-xs font-bold flex justify-center items-center gap-2 transition-all uppercase tracking-wider
              ${loading 
                ? 'bg-[#1A1A1A] cursor-not-allowed text-[#666] border border-[#1A1A1A]' 
                : 'bg-[#003366] hover:bg-[#004488] text-[#00CCFF] border border-[#0066AA] active:bg-[#002244]'}`}
          >
            {loading ? <Loader2 className="animate-spin" size={14} /> : <Search size={14} />}
            {loading ? "SCANNING..." : "SCAN MARKET"}
          </button>

          <div className="mt-2 flex items-center justify-between">
            <div className="text-[10px] text-[#00CCFF] font-mono">{scanStatus || "Ready"}</div>
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-[#00FF00]"></div>
              <span className="text-[9px] text-[#666]">LIVE</span>
            </div>
          </div>
        </div>

        {/* Watchlist Header */}
        <div className="px-3 py-2 border-b border-[#1A1A1A] bg-[#0A0A0A]">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#888] uppercase tracking-wider font-bold">Watchlist</span>
            <span className="text-[9px] text-[#666] bg-[#1A1A1A] px-2 py-0.5 rounded">{stocks.length}</span>
          </div>
        </div>

        {/* Stock List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#1A1A1A]">
          {stocks.length === 0 ? (
            <div className="p-6 text-center">
              <BarChart2 size={32} className="mx-auto mb-3 text-[#333]" />
              <p className="text-[11px] text-[#666]">No signals found</p>
              <p className="text-[10px] text-[#555] mt-1">Run scan to find opportunities</p>
            </div>
          ) : (
            stocks.map((stock, idx) => (
            <div 
              key={idx}
              onClick={() => handleStockClick(stock)}
                className={`px-3 py-2.5 border-b border-[#1A1A1A] cursor-pointer transition-all group
                  ${selectedStock?.symbol === stock.symbol 
                    ? 'bg-[#001122] border-l-2 border-l-[#00CCFF]' 
                    : 'bg-[#0A0A0A] hover:bg-[#0F0F0F] hover:border-l-2 hover:border-l-[#333]'}`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-bold text-[#E0E0E0] group-hover:text-[#00CCFF]">
                  {stock.symbol.replace('.NS','').replace('.BO','')}
                </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#00FF00]/10 text-[#00FF00] border border-[#00FF00]/20">
                    BUY
                </span>
              </div>
                
                <div className="flex justify-between items-center text-[10px]">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-[#888]">
                      <TrendingUp size={10} className="text-[#00CCFF]"/> 
                      <span className="text-[#E0E0E0]">{stock.rsi}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[#888]">
                      <BarChart2 size={10} className="text-[#FFAA00]"/> 
                      <span className="text-[#E0E0E0]">{stock.volume_x}x</span>
                    </div>
                  </div>
                  <span className="text-[#00FF00] font-mono font-bold">₹{stock.current_price}</span>
                </div>
              </div>
            ))
          )}
            </div>
        </div>
      </div>

      {/* Main Panel: Chart & Analysis */}
      <div 
        className="flex flex-col bg-[#000000] relative overflow-hidden"
        style={{
          width: '100vw',
          flex: '1 1 0%'
        }}
      >
        {/* Top Header Bar - Always Visible with Toggle Buttons */}
        <div className="h-20 border-b border-[#1A1A1A] bg-[#050505] px-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-6">
            {/* Toggle Left Sidebar Button */}
            <button
              onClick={() => setShowLeftSidebar(!showLeftSidebar)}
              className="px-3 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-2 border transition-all bg-[#1A1A1A] hover:bg-[#2A2A2A] text-[#666] border-[#1A1A1A] hover:text-[#E0E0E0]"
              title={showLeftSidebar ? "Hide Sidebar" : "Show Sidebar"}
            >
              {showLeftSidebar ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>
            
            {/* Stock Info or Welcome Message */}
            {selectedStock ? (
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-2xl font-bold text-[#E0E0E0] tracking-tight">{selectedStock.symbol.replace('.NS','').replace('.BO','')}</h2>
                  <span className="text-[10px] text-[#666] bg-[#1A1A1A] px-2 py-0.5 rounded uppercase">NSE</span>
                  {/* Timeframe Display */}
                  <span className="text-[10px] text-[#00CCFF] bg-[#003366] px-2 py-0.5 rounded uppercase border border-[#0066AA]">
                    {timeframes.find(tf => tf.value === timeframe)?.label || timeframe}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-[#888]">EQUITY</span>
                  <span className="text-[#00FF00] font-mono font-bold text-lg">₹{selectedStock.current_price}</span>
                </div>
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-bold text-[#E0E0E0] tracking-tight">TITAN TRADING TERMINAL</h2>
                <p className="text-xs text-[#888]">Select a stock to begin analysis</p>
              </div>
            )}
          </div>
          
          {/* Right Side Controls */}
          <div className="flex items-center gap-3">
            {/* Indicator Settings Button - Only when stock is selected */}
            {selectedStock && (
              <>
                <button
                  onClick={() => setShowIndicatorPanel(!showIndicatorPanel)}
                  className={`px-3 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-2 border transition-all
                    ${showIndicatorPanel 
                      ? 'bg-[#00CCFF]/20 text-[#00CCFF] border-[#00CCFF]/40 hover:bg-[#00CCFF]/30' 
                      : 'bg-[#1A1A1A] text-[#666] border-[#1A1A1A] hover:bg-[#2A2A2A]'}`}
                  title="Indicator Settings"
                >
                  <Settings size={12} />
                  INDICATORS
                </button>
                
                {/* AI Audit Button */}
                {aiVerdict && (
                  <button 
                    onClick={() => setShowAudit(!showAudit)}
                    className={`px-3 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-2 border transition-all
                      ${showAudit 
                        ? 'bg-[#FFAA00]/20 text-[#FFAA00] border-[#FFAA00]/40 hover:bg-[#FFAA00]/30' 
                        : 'bg-[#1A1A1A] text-[#666] border-[#1A1A1A] hover:bg-[#2A2A2A]'}`}
                    title={showAudit ? "Hide Audit" : "Show Audit"}
                  >
                    {showAudit ? <X size={12} /> : <Activity size={12} />}
                    {showAudit ? 'HIDE' : 'SHOW'}
                  </button>
                )}
                <button 
                  onClick={askGemini}
                  disabled={aiLoading}
                  className={`px-4 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-2 border transition-all
                    ${aiLoading 
                      ? 'bg-[#1A1A1A] text-[#666] cursor-wait border-[#1A1A1A]' 
                      : 'bg-[#003366] hover:bg-[#004488] text-[#00CCFF] border-[#0066AA] active:bg-[#002244]'}`}
                >
                  {aiLoading ? <Loader2 className="animate-spin" size={14} /> : <Zap size={14} />} 
                  {aiLoading ? 'ANALYZING...' : 'AI AUDIT'}
                </button>
                
                {/* Timeframe Selector */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-[#666] uppercase mr-2">Timeframe:</span>
                  <select
                    value={timeframe}
                    onChange={(e) => setTimeframe(e.target.value)}
                    className="bg-[#0A0A0A] border border-[#1A1A1A] text-[#E0E0E0] text-xs px-3 py-1.5 rounded focus:outline-none focus:border-[#00CCFF] hover:border-[#333] transition-colors cursor-pointer"
                  >
                    {timeframes.map(tf => (
                      <option key={tf.value} value={tf.value} className="bg-[#0A0A0A]">
                        {tf.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            
            {/* Toggle Right Sidebar Button - Always Visible */}
            <button
              onClick={() => setShowRightSidebar(!showRightSidebar)}
              className="px-3 py-2 rounded text-xs font-bold uppercase tracking-wider flex items-center gap-2 border transition-all bg-[#1A1A1A] hover:bg-[#2A2A2A] text-[#666] border-[#1A1A1A] hover:text-[#E0E0E0]"
              title={showRightSidebar ? "Hide Sidebar" : "Show Sidebar"}
            >
              {showRightSidebar ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>
        </div>

        {selectedStock ? (
          <>

            {/* Chart and Sidebar Area */}
            <div className="flex-1 min-h-0 overflow-hidden relative" style={{ padding: '16px', width: '100%' }}>
              {/* Chart Section */}
              <div 
                className="flex flex-col min-h-0 bg-[#000000] rounded border border-[#1A1A1A] w-full h-full"
                style={{ width: '100%', maxWidth: '100%' }}
              >
                <div className="relative flex-1 min-h-[400px]">
                  {/* Chart Component */}
                  {chartLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="animate-spin text-[#00CCFF]" size={24} />
                      <span className="ml-2 text-[#888] text-sm">Loading {timeframes.find(tf => tf.value === timeframe)?.label || timeframe} chart...</span>
                    </div>
                  ) : (
                    <TitanChart 
                      data={selectedStock.chart_data || []} 
                      interval={timeframe}
                      indicators={indicators}
                    />
                  )}

                {/* Indicator Configuration Panel */}
                {showIndicatorPanel && (
                  <div 
                    className="indicator-panel fixed z-40 bg-[#0A0A0A] border border-[#1A1A1A] rounded shadow-2xl min-w-[280px]"
                    style={{
                      top: '100px',
                      right: '20px'
                    }}
                  >
                    <div className="px-4 py-3 border-b border-[#1A1A1A] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <LineChart size={16} className="text-[#00CCFF]" />
                        <span className="text-sm font-bold text-[#E0E0E0]">Indicators</span>
              </div>
                      <button
                        onClick={() => setShowIndicatorPanel(false)}
                        className="text-[#666] hover:text-[#E0E0E0] transition-colors"
                      >
                        <X size={16} />
              </button>
            </div>

                    <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
                      {/* EMA 50 */}
                      <label className="flex items-center justify-between p-2 hover:bg-[#1A1A1A] rounded cursor-pointer transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-0.5 bg-[#00CCFF]"></div>
                          <span className="text-xs text-[#E0E0E0]">EMA 50</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={indicators.ema50}
                          onChange={(e) => setIndicators({...indicators, ema50: e.target.checked})}
                          className="w-4 h-4 rounded border-[#1A1A1A] bg-[#0A0A0A] text-[#00CCFF] focus:ring-[#00CCFF]"
                        />
                      </label>
                      
                      {/* EMA 200 */}
                      <label className="flex items-center justify-between p-2 hover:bg-[#1A1A1A] rounded cursor-pointer transition-colors">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-0.5 bg-[#FFAA00]"></div>
                          <span className="text-xs text-[#E0E0E0]">EMA 200</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={indicators.ema200}
                          onChange={(e) => setIndicators({...indicators, ema200: e.target.checked})}
                          className="w-4 h-4 rounded border-[#1A1A1A] bg-[#0A0A0A] text-[#00CCFF] focus:ring-[#00CCFF]"
                        />
                      </label>
                    </div>
                    
                    {/* Quick Actions */}
                    <div className="px-3 py-2 border-t border-[#1A1A1A] flex gap-2">
                      <button
                        onClick={() => setIndicators({
                          ema50: true,
                          ema200: true,
                        })}
                        className="flex-1 px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#003366] hover:bg-[#004488] text-[#00CCFF] border border-[#0066AA] rounded transition-all"
                      >
                        All On
                      </button>
                      <button
                        onClick={() => setIndicators({
                          ema50: false,
                          ema200: false,
                        })}
                        className="flex-1 px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#1A1A1A] hover:bg-[#2A2A2A] text-[#666] border border-[#1A1A1A] rounded transition-all"
                      >
                        All Off
                      </button>
                    </div>
                  </div>
                )}

                </div>
              </div>
              
              {/* Backdrop Overlay - Shows when sidebar is open */}
              {showRightSidebar && (
                <div 
                  className="fixed inset-0 bg-black/50 z-20 transition-opacity duration-500 ease-in-out"
                  onClick={() => setShowRightSidebar(false)}
                  style={{
                    opacity: showRightSidebar ? 1 : 0,
                    pointerEvents: showRightSidebar ? 'auto' : 'none'
                  }}
                />
              )}

              {/* Right Sidebar */}
              <div 
                className="fixed right-0 top-0 h-full bg-[#0A0A0A] border-l border-[#1A1A1A] overflow-x-hidden overflow-y-auto transition-all duration-500 ease-in-out z-30 shadow-2xl"
                style={{
                  width: showRightSidebar ? '480px' : '0',
                  paddingTop: showRightSidebar ? '80px' : '0',
                  boxShadow: showRightSidebar ? '-4px 0 20px rgba(0, 0, 0, 0.5)' : 'none'
                }}
              >
                {/* Close Button */}
                {showRightSidebar && (
                  <button
                    onClick={() => setShowRightSidebar(false)}
                    className="absolute top-4 right-4 text-[#666] hover:text-[#E0E0E0] transition-colors p-1.5 rounded hover:bg-[#1A1A1A] z-20"
                    title="Close Sidebar"
                  >
                    <X size={20} />
                  </button>
                )}
                
                {/* Sidebar Content */}
                <div className="p-4 space-y-4" style={{ display: showRightSidebar ? 'block' : 'none' }}>
                  {selectedStock && selectedStock.symbol ? (
                    <>
                      {/* Stock Metrics Panel */}
                      <div className="bg-[#0A0A0A] border border-[#1A1A1A] rounded p-4 flex-shrink-0">
                        <div className="text-[10px] text-[#666] uppercase mb-3 tracking-wider">Key Metrics</div>
                        <div className="space-y-3">
                          <div className="bg-[#0A0A0A] border border-[#1A1A1A] px-4 py-2 rounded">
                            <div className="text-[9px] text-[#666] uppercase mb-1">RSI (14)</div>
                            <div className={`text-lg font-bold font-mono ${selectedStock.rsi > 70 ? 'text-[#FF4444]' : selectedStock.rsi > 60 ? 'text-[#00FF00]' : 'text-[#FFAA00]'}`}>
                              {selectedStock.rsi}
                            </div>
                          </div>
                          <div className="bg-[#0A0A0A] border border-[#1A1A1A] px-4 py-2 rounded">
                            <div className="text-[9px] text-[#666] uppercase mb-1">Volume</div>
                            <div className="text-lg font-bold font-mono text-[#00CCFF]">{selectedStock.volume_x}x</div>
                          </div>
                          <div className="bg-[#0A0A0A] border border-[#1A1A1A] px-4 py-2 rounded">
                            <div className="text-[9px] text-[#666] uppercase mb-1">Status</div>
                            <div className="text-lg font-bold text-[#00FF00]">BUY</div>
                          </div>
                        </div>
                      </div>
                      
                      {/* Chat Section */}
                      <div className="h-[calc(100vh-280px)] min-h-[400px]">
                        <TitanChat symbol={selectedStock.symbol} />
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] text-center px-4">
                      <div className="mb-6">
                        <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-[#1A1A1A] flex items-center justify-center">
                          <BarChart2 size={48} className="text-[#666]" />
                        </div>
                        <h3 className="text-lg font-bold text-[#E0E0E0] mb-2">No Stock Selected</h3>
                        <p className="text-sm text-[#888] mb-4">
                          Select a stock from the watchlist to view detailed metrics and chat with AI assistant.
                        </p>
                        <div className="text-xs text-[#666] space-y-2">
                          <p>• View real-time technical indicators</p>
                          <p>• Get AI-powered stock analysis</p>
                          <p>• Chat with Titan AI Assistant</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowLeftSidebar(true)}
                        className="px-4 py-2 bg-[#003366] hover:bg-[#004488] text-[#00CCFF] rounded text-sm font-bold transition-colors"
                      >
                        Open Watchlist
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* AI Verdict Panel */}
            {aiVerdict && showAudit && (
                <div 
                  className={`border-t-2 border-[#1A1A1A] bg-[#050505] p-4 relative min-h-[200px] w-full flex-shrink-0 z-10
                    ${aiVerdict.verdict === 'STRONG BUY' ? 'border-l-4 border-l-[#00FF00]' : 
                      aiVerdict.verdict === 'WAIT' ? 'border-l-4 border-l-[#FFAA00]' : 
                      aiVerdict.verdict === 'ERROR' ? 'border-l-4 border-l-[#FF4444]' :
                      'border-l-4 border-l-[#FFAA00]'}`}
                  style={{
                    display: 'block',
                    visibility: 'visible',
                    opacity: 1,
                    position: 'relative',
                    width: '100%'
                  }}
                  ref={(el) => {
                    if (el) {
                      const rect = el.getBoundingClientRect();
                      // Force scroll into view if needed
                      if (rect.bottom > window.innerHeight || rect.top < 0) {
                        setTimeout(() => {
                          el.scrollIntoView({ behavior: 'smooth', block: 'end' });
                        }, 100);
                      }
                    }
                  }}
                >
                
                    {/* Close/Hide Button */}
                    <button
                      onClick={() => setShowAudit(false)}
                      className="absolute top-2 right-2 text-[#666] hover:text-[#E0E0E0] transition-colors p-1.5 rounded hover:bg-[#1A1A1A] border border-transparent hover:border-[#333]"
                      title="Hide Audit Panel"
                    >
                      <X size={16} />
                    </button>
                    
                    <div className="flex items-start gap-4 pr-6">
                      <div className={`p-2 rounded border ${
                        aiVerdict.verdict === 'STRONG BUY' ? 'bg-[#00FF00]/10 border-[#00FF00]/30 text-[#00FF00]' : 
                        aiVerdict.verdict === 'WAIT' ? 'bg-[#FFAA00]/10 border-[#FFAA00]/30 text-[#FFAA00]' : 
                        aiVerdict.verdict === 'ERROR' ? 'bg-[#FF4444]/10 border-[#FF4444]/30 text-[#FF4444]' :
                        'bg-[#FFAA00]/10 border-[#FFAA00]/30 text-[#FFAA00]'
                      }`}>
                        <Cpu size={20} />
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                    <div>
                            <span className="text-[10px] text-[#666] uppercase tracking-wider">AI VERDICT</span>
                            <h3 className={`text-lg font-bold mt-0.5 ${
                              aiVerdict.verdict === 'STRONG BUY' ? 'text-[#00FF00]' : 
                              aiVerdict.verdict === 'WAIT' ? 'text-[#FFAA00]' : 
                              aiVerdict.verdict === 'ERROR' ? 'text-[#FF4444]' :
                              'text-[#FFAA00]'
                            }`}>
                              {aiVerdict.verdict || 'UNKNOWN'}
                            </h3>
                          </div>
                          
                          <div className="flex gap-6">
                            <div className="text-right">
                              <div className="text-[9px] text-[#666] uppercase mb-1">Stop Loss</div>
                              <div className="text-[#FF4444] font-mono font-bold flex items-center gap-1">
                                <ShieldAlert size={12} /> {aiVerdict.stopLoss || '-'}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-[9px] text-[#666] uppercase mb-1">Target</div>
                              <div className="text-[#00FF00] font-mono font-bold flex items-center gap-1">
                                <Target size={12} /> {aiVerdict.target || '-'}
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="border-t border-[#1A1A1A] pt-2">
                          <p className="text-sm text-[#E0E0E0] leading-relaxed">
                            {aiVerdict.reason || 'No reason provided'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
              )}
              
              {/* Show Audit Button - When audit exists but is hidden */}
              {aiVerdict && !showAudit && (
                <div className="border-t border-[#1A1A1A] bg-[#050505] p-3">
                  <button
                    onClick={() => setShowAudit(true)}
                    className="w-full py-2.5 px-4 rounded text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 bg-[#003366] hover:bg-[#004488] text-[#00CCFF] border border-[#0066AA] transition-all active:bg-[#002244]"
                  >
                    <Activity size={14} />
                    Show AI Audit Result - {aiVerdict.verdict}
                  </button>
                </div>
              )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-[#000000]">
            <div className="text-center">
              <div className="w-16 h-16 border-2 border-[#1A1A1A] rounded-full flex items-center justify-center mb-4 mx-auto">
                <BarChart2 size={32} className="text-[#333]"/>
              </div>
              <h3 className="text-xl font-bold text-[#666] mb-2">SYSTEM READY</h3>
              <p className="text-[11px] text-[#555] font-mono">Waiting for scan results...</p>
              <div className="mt-4 flex items-center justify-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[#00FF00] animate-pulse"></div>
                <span className="text-[10px] text-[#666]">Connection Active</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}