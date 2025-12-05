import { useState, useEffect, useRef } from 'react';
import { AdvancedRealTimeChart } from 'react-ts-tradingview-widgets';
import { createChart, ColorType, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export default function TitanChart({ symbol, interval = "1d", data = [] }) {
  const [useTradingView, setUseTradingView] = useState(true);
  const [tradingViewError, setTradingViewError] = useState(false);
  const chartContainerRef = useRef();
  const chartInstance = useRef(null);

  // List of major stocks that typically work on TradingView
  // For others, we'll use backend data with lightweight-charts
  const tradingViewSupportedSymbols = [
    'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'HINDUNILVR', 'ICICIBANK', 
    'SBIN', 'BHARTIARTL', 'KOTAKBANK', 'ITC', 'LT', 'AXISBANK'
  ];

  // Check if symbol is likely to work on TradingView
  const isTradingViewSupported = () => {
    if (!symbol) return false;
    const baseSymbol = symbol.replace('.NS', '').replace('.BO', '');
    return tradingViewSupportedSymbols.includes(baseSymbol);
  };

  // Parse symbol from backend format to TradingView format
  const parseSymbol = (symbol) => {
    if (!symbol) return 'NSE:NIFTY';
    
    if (symbol.endsWith('.NS')) {
      const baseSymbol = symbol.replace('.NS', '');
      return `NSE:${baseSymbol}`;
    }
    
    if (symbol.endsWith('.BO')) {
      const baseSymbol = symbol.replace('.BO', '');
      return `BSE:${baseSymbol}`;
    }
    
    return 'NSE:NIFTY';
  };

  // Map interval from App.jsx format to TradingView format
  const mapInterval = (interval) => {
    const intervalMap = {
      '1m': '1',
      '5m': '5',
      '15m': '15',
      '30m': '30',
      '1h': '60',
      '1d': 'D',
      '1wk': 'W',
      '1mo': 'M'
    };
    return intervalMap[interval] || 'D';
  };

  // Initialize lightweight-charts fallback
  useEffect(() => {
    // Only use lightweight-charts if we have data and TradingView failed or not supported
    if (!useTradingView && data && data.length > 0 && chartContainerRef.current) {
      // Clean up existing chart
      if (chartInstance.current) {
        try {
          chartInstance.current.remove();
        } catch (e) {
          // Ignore cleanup errors
        }
        chartInstance.current = null;
      }

      const initializeChart = () => {
        const container = chartContainerRef.current;
        if (!container) return;
        
        const width = container.clientWidth || container.offsetWidth || 800;
        const height = container.clientHeight || container.offsetHeight || 400;
        
        if (width <= 0 || height <= 0) {
          setTimeout(initializeChart, 50);
          return;
        }
        
        const chart = createChart(container, {
          layout: {
            background: { type: ColorType.Solid, color: '#000000' },
            textColor: '#888888',
          },
          grid: {
            vertLines: { color: '#1A1A1A', style: 0 },
            horzLines: { color: '#1A1A1A', style: 0 },
          },
          crosshair: {
            mode: 1, // Normal crosshair mode for zoom/pan
            vertLine: {
              color: '#666',
              width: 1,
              style: 2, // Dashed line
            },
            horzLine: {
              color: '#666',
              width: 1,
              style: 2, // Dashed line
            },
          },
          timeScale: {
            timeVisible: true,
            secondsVisible: false,
            borderColor: '#1A1A1A',
            rightOffset: 0,
            barSpacing: 6,
            rightBarStaysOnScroll: true,
            lockVisibleTimeRangeOnResize: true,
          },
          rightPriceScale: {
            borderColor: '#1A1A1A',
            scaleMargins: {
              top: 0.1,
              bottom: 0.1,
            },
            entireTextOnly: false,
          },
          handleScroll: {
            mouseWheel: true, // Enable mouse wheel scroll/zoom
            pressedMouseMove: true, // Enable pan with mouse drag
            horzTouchDrag: true, // Enable horizontal touch drag
            vertTouchDrag: true, // Enable vertical touch drag
          },
          handleScale: {
            axisPressedMouseMove: {
              time: true, // Enable time scale zoom with mouse drag
              price: true, // Enable price scale zoom with mouse drag
            },
            axisDoubleClickReset: {
              time: true, // Double click to reset time scale
              price: true, // Double click to reset price scale
            },
            axisTouchDrag: {
              time: true, // Enable touch drag for time scale
              price: true, // Enable touch drag for price scale
            },
            mouseWheel: true, // Enable mouse wheel for price scale zoom
            pinch: true, // Enable pinch to zoom
          },
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#00FF00',
          downColor: '#FF4444',
          borderVisible: false,
          wickUpColor: '#00FF00',
          wickDownColor: '#FF4444',
        });

        // Process and set data
        const isIntraday = interval && ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"].includes(interval);
        
        const cleanData = data
          .map(d => {
            const open = Number(d.Open || d.open || 0);
            const high = Number(d.High || d.high || 0);
            const low = Number(d.Low || d.low || 0);
            const close = Number(d.Close || d.close || 0);
            
            if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || 
                open === 0 || high === 0 || low === 0 || close === 0) {
              return null;
            }
            
            let timeValue = d.time || d.Date || d.date;
            if (isIntraday) {
              if (typeof timeValue === 'string') {
                const date = new Date(timeValue);
                if (isNaN(date.getTime())) return null;
                timeValue = Math.floor(date.getTime() / 1000);
              }
              if (timeValue <= 0 || timeValue > 2147483647) return null;
            } else {
              if (typeof timeValue === 'number') {
                const date = new Date(timeValue * 1000);
                if (isNaN(date.getTime())) return null;
                timeValue = date.toISOString().split('T')[0];
              }
            }
            
            return {
              time: timeValue,
              open: open,
              high: high,
              low: low,
              close: close,
            };
          })
          .filter(d => d !== null)
          .sort((a, b) => {
            if (isIntraday) {
              return a.time - b.time;
            } else {
              return new Date(a.time) - new Date(b.time);
            }
          })
          .filter((item, index, self) => 
            index === self.findIndex((t) => t.time === item.time)
          );

        if (cleanData.length > 0) {
          candleSeries.setData(cleanData);
          chart.timeScale().fitContent();
        }

        chartInstance.current = chart;

        // Window resize handler
        const handleResize = () => {
          if (chartContainerRef.current && chartInstance.current) {
            const newWidth = chartContainerRef.current.clientWidth;
            const newHeight = chartContainerRef.current.clientHeight;
            if (newWidth > 0 && newHeight > 0) {
              chartInstance.current.applyOptions({ 
                width: newWidth,
                height: newHeight 
              });
            }
          }
        };
        window.addEventListener('resize', handleResize);

        return () => {
          window.removeEventListener('resize', handleResize);
        };
      };

      requestAnimationFrame(() => {
        setTimeout(initializeChart, 0);
      });

      return () => {
        if (chartInstance.current) {
          try {
            chartInstance.current.remove();
          } catch (e) {
            // Ignore cleanup errors
          }
          chartInstance.current = null;
        }
      };
    }
  }, [useTradingView, data, interval]);

  // Auto-switch to backend data for unsupported symbols
  useEffect(() => {
    if (data && data.length > 0 && !isTradingViewSupported() && useTradingView) {
      // For symbols not in supported list, use backend data by default
      setUseTradingView(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // Zoom functions for lightweight-charts
  const handleZoomIn = () => {
    if (chartInstance.current) {
      const timeScale = chartInstance.current.timeScale();
      const visibleRange = timeScale.getVisibleRange();
      if (visibleRange) {
        // Convert to numbers for calculation (lightweight-charts returns Unix timestamps)
        const from = typeof visibleRange.from === 'number' ? visibleRange.from : new Date(visibleRange.from).getTime() / 1000;
        const to = typeof visibleRange.to === 'number' ? visibleRange.to : new Date(visibleRange.to).getTime() / 1000;
        const range = to - from;
        const newRange = range * 0.7; // Zoom in by 30%
        const center = (from + to) / 2;
        
        // Set new range - lightweight-charts handles format conversion
        timeScale.setVisibleRange({
          from: center - newRange / 2,
          to: center + newRange / 2,
        });
      }
    }
  };

  const handleZoomOut = () => {
    if (chartInstance.current) {
      const timeScale = chartInstance.current.timeScale();
      const visibleRange = timeScale.getVisibleRange();
      if (visibleRange) {
        // Convert to numbers for calculation
        const from = typeof visibleRange.from === 'number' ? visibleRange.from : new Date(visibleRange.from).getTime() / 1000;
        const to = typeof visibleRange.to === 'number' ? visibleRange.to : new Date(visibleRange.to).getTime() / 1000;
        const range = to - from;
        const newRange = range * 1.4; // Zoom out by 40%
        const center = (from + to) / 2;
        
        // Set new range - lightweight-charts handles format conversion
        timeScale.setVisibleRange({
          from: center - newRange / 2,
          to: center + newRange / 2,
        });
      }
    }
  };

  const handleResetZoom = () => {
    if (chartInstance.current) {
      chartInstance.current.timeScale().fitContent();
    }
  };

  const tradingViewSymbol = parseSymbol(symbol);
  const shouldUseTradingView = useTradingView && !tradingViewError && isTradingViewSupported();

  return (
    <div className="w-full h-full min-h-[400px] relative">
      {shouldUseTradingView ? (
        <>
          <AdvancedRealTimeChart
            symbol={tradingViewSymbol}
            theme="dark"
            autosize={true}
            interval={mapInterval(interval)}
            timezone="Asia/Kolkata"
            style="1"
            hide_side_toolbar={false}
            details={true}
            withdateranges={true}
            allow_symbol_change={true}
            studies={[
              'RSI@tv-basicstudies',
              'MASimple@tv-basicstudies',
              'Volume@tv-basicstudies'
            ]}
            studies_overrides={{
              'MASimple.length': 50
            }}
          />
          {/* Fallback button if TradingView fails */}
          {data && data.length > 0 && (
            <button
              onClick={() => {
                setUseTradingView(false);
                setTradingViewError(true);
              }}
              className="absolute top-2 right-2 px-3 py-1.5 bg-[#003366] hover:bg-[#004488] text-[#00CCFF] text-xs font-bold rounded border border-[#0066AA] z-50"
              title="Switch to backend chart (if TradingView shows error)"
            >
              Use Backend Data
            </button>
          )}
        </>
      ) : (
        <>
          {data && data.length > 0 ? (
            <>
              <div ref={chartContainerRef} className="w-full flex-1 min-h-[400px]" style={{ paddingBottom: '48px' }} />
              
              {/* Zoom Controls - Bottom Bar (TradingView Style) */}
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-2 bg-[#0A0A0A] border-t border-[#1A1A1A] z-50">
                {/* Left Side - TradingView Button */}
                <button
                  onClick={() => {
                    setUseTradingView(true);
                    setTradingViewError(false);
                  }}
                  className="px-3 py-1.5 bg-[#1A1A1A] hover:bg-[#2A2A2A] text-[#E0E0E0] text-xs font-bold rounded border border-[#333] transition-colors"
                  title="Try TradingView"
                >
                  TradingView
                </button>
                
                {/* Right Side - Zoom Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleZoomIn}
                    className="p-2 bg-[#1A1A1A] hover:bg-[#2A2A2A] text-[#E0E0E0] rounded transition-colors flex items-center justify-center"
                    title="Zoom In (+)"
                  >
                    <ZoomIn size={18} />
                  </button>
                  <button
                    onClick={handleZoomOut}
                    className="p-2 bg-[#1A1A1A] hover:bg-[#2A2A2A] text-[#E0E0E0] rounded transition-colors flex items-center justify-center"
                    title="Zoom Out (-)"
                  >
                    <ZoomOut size={18} />
                  </button>
                  <button
                    onClick={handleResetZoom}
                    className="p-2 bg-[#1A1A1A] hover:bg-[#2A2A2A] text-[#E0E0E0] rounded transition-colors flex items-center justify-center"
                    title="Reset Zoom (Fit Content)"
                  >
                    <RotateCcw size={18} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-[#888]">
              <div className="text-center">
                <p className="text-sm mb-2">Chart data loading...</p>
                <p className="text-xs text-[#666]">TradingView not available for this symbol</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
