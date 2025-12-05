import { useEffect, useRef } from 'react';
import { AdvancedRealTimeChart } from 'react-ts-tradingview-widgets';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export default function TitanChart({ symbol, interval = "1d", data = [], levels = { support: [], resistance: [] }, mode = 'titan' }) {
  const chartContainerRef = useRef();
  const chartInstance = useRef(null);
  const candleSeriesRef = useRef(null);
  const priceLinesRef = useRef([]);

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

  // Initialize lightweight-charts for Titan mode
  useEffect(() => {
    if (mode === 'titan' && data && data.length > 0 && chartContainerRef.current) {
      // Clean up existing chart
      if (chartInstance.current) {
        try {
          chartInstance.current.remove();
        } catch (e) {
          // Ignore cleanup errors
        }
        chartInstance.current = null;
        candleSeriesRef.current = null;
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
            mode: 1,
            vertLine: {
              color: '#666',
              width: 1,
              style: 2,
            },
            horzLine: {
              color: '#666',
              width: 1,
              style: 2,
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
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true,
          },
          handleScale: {
            axisPressedMouseMove: {
              time: true,
              price: true,
            },
            axisDoubleClickReset: {
              time: true,
              price: true,
            },
            axisTouchDrag: {
              time: true,
              price: true,
            },
            mouseWheel: true,
            pinch: true,
          },
        });

        const candleSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#00FF00',
          downColor: '#FF4444',
          borderVisible: false,
          wickUpColor: '#00FF00',
          wickDownColor: '#FF4444',
        });

        candleSeriesRef.current = candleSeries;

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
        candleSeriesRef.current = candleSeries;
        
        // Add support/resistance lines immediately after chart is created
        if (levels && (levels.support?.length > 0 || levels.resistance?.length > 0)) {
          // Add support lines (green)
          if (levels.support && Array.isArray(levels.support)) {
            levels.support.forEach(price => {
              if (typeof price === 'number' && price > 0) {
                try {
                  const priceLine = candleSeries.createPriceLine({
                    price: price,
                    color: '#00FF00',
                    lineWidth: 2,
                    lineStyle: 2, // Dashed
                    axisLabelVisible: true,
                    title: `S: ${price.toFixed(2)}`,
                  });
                  priceLinesRef.current.push(priceLine);
                } catch (e) {
                  console.warn('Failed to create support line:', e);
                }
              }
            });
          }
          // Add resistance lines (red)
          if (levels.resistance && Array.isArray(levels.resistance)) {
            levels.resistance.forEach(price => {
              if (typeof price === 'number' && price > 0) {
                try {
                  const priceLine = candleSeries.createPriceLine({
                    price: price,
                    color: '#FF0000',
                    lineWidth: 2,
                    lineStyle: 2, // Dashed
                    axisLabelVisible: true,
                    title: `R: ${price.toFixed(2)}`,
                  });
                  priceLinesRef.current.push(priceLine);
                } catch (e) {
                  console.warn('Failed to create resistance line:', e);
                }
              }
            });
          }
        }

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
          candleSeriesRef.current = null;
        }
      };
    }
  }, [mode, data, interval]);

  // Add support/resistance lines when levels change
  useEffect(() => {
    if (mode === 'titan' && candleSeriesRef.current && chartInstance.current) {
      // Remove existing price lines first
      priceLinesRef.current.forEach(line => {
        try {
          candleSeriesRef.current.removePriceLine(line);
        } catch (e) {
          // Ignore errors during cleanup
        }
      });
      priceLinesRef.current = [];

      // Add support lines (green)
      if (levels.support && Array.isArray(levels.support)) {
        levels.support.forEach(price => {
          if (typeof price === 'number' && price > 0) {
            try {
              const priceLine = candleSeriesRef.current.createPriceLine({
                price: price,
                color: '#00FF00',
                lineWidth: 2,
                lineStyle: 2, // Dashed
                axisLabelVisible: true,
                title: `S: ${price.toFixed(2)}`,
              });
              priceLinesRef.current.push(priceLine);
            } catch (e) {
              console.warn('Failed to create support line:', e);
            }
          }
        });
      }

      // Add resistance lines (red)
      if (levels.resistance && Array.isArray(levels.resistance)) {
        levels.resistance.forEach(price => {
          if (typeof price === 'number' && price > 0) {
            try {
              const priceLine = candleSeriesRef.current.createPriceLine({
                price: price,
                color: '#FF0000',
                lineWidth: 2,
                lineStyle: 2, // Dashed
                axisLabelVisible: true,
                title: `R: ${price.toFixed(2)}`,
              });
              priceLinesRef.current.push(priceLine);
            } catch (e) {
              console.warn('Failed to create resistance line:', e);
            }
          }
        });
      }
    }
  }, [mode, levels]);

  // Zoom functions for lightweight-charts
  const handleZoomIn = () => {
    if (chartInstance.current) {
      const timeScale = chartInstance.current.timeScale();
      const visibleRange = timeScale.getVisibleRange();
      if (visibleRange) {
        const from = typeof visibleRange.from === 'number' ? visibleRange.from : new Date(visibleRange.from).getTime() / 1000;
        const to = typeof visibleRange.to === 'number' ? visibleRange.to : new Date(visibleRange.to).getTime() / 1000;
        const range = to - from;
        const newRange = range * 0.7;
        const center = (from + to) / 2;
        
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
        const from = typeof visibleRange.from === 'number' ? visibleRange.from : new Date(visibleRange.from).getTime() / 1000;
        const to = typeof visibleRange.to === 'number' ? visibleRange.to : new Date(visibleRange.to).getTime() / 1000;
        const range = to - from;
        const newRange = range * 1.4;
        const center = (from + to) / 2;
        
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

  // Render based on mode
  if (mode === 'tradingview') {
    return (
      <div className="w-full h-full min-h-[400px] relative">
        <AdvancedRealTimeChart
          symbol={parseSymbol(symbol)}
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
      </div>
    );
  }

  // Titan mode (lightweight-charts with support/resistance)
  return (
    <div className="w-full h-full min-h-[400px] relative flex flex-col">
      {data && data.length > 0 ? (
        <>
          <div ref={chartContainerRef} className="w-full flex-1 min-h-[400px]" style={{ paddingBottom: '48px' }} />
          
          {/* Zoom Controls - Bottom Bar (TradingView Style) */}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-2 bg-[#0A0A0A] border-t border-[#1A1A1A] z-50">
            {/* Left Side - Empty for now, can add controls later */}
            <div></div>
            
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
            <p className="text-xs text-[#666]">Waiting for data...</p>
          </div>
        </div>
      )}
    </div>
  );
}
