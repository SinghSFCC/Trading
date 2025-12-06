import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries } from 'lightweight-charts';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export default function TitanChart({ symbol, interval = "1d", data = [], zones = [], structure = "" }) {
  const chartContainerRef = useRef();
  const chartInstance = useRef(null);
  const candleSeriesRef = useRef(null);
  const ema50SeriesRef = useRef(null);
  const ema200SeriesRef = useRef(null);
  const zoneLinesRef = useRef([]);

  // Initialize lightweight-charts
  useEffect(() => {
    if (data && data.length > 0 && chartContainerRef.current) {
      // Prevent duplicate initialization
      if (chartInstance.current) {
        return;
      }

      const initializeChart = () => {
        const container = chartContainerRef.current;
        if (!container) return;
        
        // Double-check no chart exists
        if (chartInstance.current) {
          return;
        }
        
        const width = container.clientWidth || container.offsetWidth || 800;
        const height = container.clientHeight || container.offsetHeight || 400;
        
        if (width <= 0 || height <= 0) {
          setTimeout(initializeChart, 50);
          return;
        }
        
        const chart = createChart(container, {
          width: width,
          height: height,
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
            lockVisibleTimeRangeOnResize: false,
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
        
        // Debug: Log first and last data points
        if (data && data.length > 0) {
          console.log('📊 Chart Data Processing:', {
            totalDataPoints: data.length,
            firstPoint: {
              open: data[0].Open || data[0].open,
              high: data[0].High || data[0].high,
              low: data[0].Low || data[0].low,
              close: data[0].Close || data[0].close
            },
            lastPoint: {
              open: data[data.length - 1].Open || data[data.length - 1].open,
              high: data[data.length - 1].High || data[data.length - 1].high,
              low: data[data.length - 1].Low || data[data.length - 1].low,
              close: data[data.length - 1].Close || data[data.length - 1].close
            }
          });
        }
        
        const cleanData = data
          .map(d => {
            const open = Number(d.Open || d.open || 0);
            const high = Number(d.High || d.high || 0);
            const low = Number(d.Low || d.low || 0);
            const close = Number(d.Close || d.close || 0);
            
            // Debug: Log any suspicious values
            if (open > 10000 || high > 10000 || low > 10000 || close > 10000) {
              console.warn('⚠️ Suspiciously high price value detected:', { open, high, low, close, data: d });
            }
            
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

        // Add EMA indicators if data contains them
        const ema50Data = [];
        const ema200Data = [];
        
        cleanData.forEach((candle, idx) => {
          const originalData = data.find(d => {
            const dTime = d.time || d.Date || d.date;
            return dTime === candle.time;
          });
          
          if (originalData) {
            if (originalData.ema_50 !== undefined && originalData.ema_50 !== null) {
              ema50Data.push({
                time: candle.time,
                value: Number(originalData.ema_50)
              });
            }
            if (originalData.ema_200 !== undefined && originalData.ema_200 !== null) {
              ema200Data.push({
                time: candle.time,
                value: Number(originalData.ema_200)
              });
            }
          }
        });

        // Add EMA 50 line (Blue)
        if (ema50Data.length > 0) {
          const ema50Series = chart.addSeries(LineSeries, {
            color: '#3B82F6',
            lineWidth: 2,
            title: 'EMA 50',
          });
          ema50Series.setData(ema50Data);
          ema50SeriesRef.current = ema50Series;
        }

        // Add EMA 200 line (Orange)
        if (ema200Data.length > 0) {
          const ema200Series = chart.addSeries(LineSeries, {
            color: '#F97316',
            lineWidth: 2,
            title: 'EMA 200',
          });
          ema200Series.setData(ema200Data);
          ema200SeriesRef.current = ema200Series;
        }

        // Store chart instance
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
          candleSeriesRef.current = null;
          ema50SeriesRef.current = null;
          ema200SeriesRef.current = null;
          zoneLinesRef.current = [];
        }
      };
    }
  }, [data, interval]);

  // Draw zones when zones prop changes
  useEffect(() => {
    if (candleSeriesRef.current && zones && Array.isArray(zones) && zones.length > 0) {
      // Remove existing zone lines
      zoneLinesRef.current.forEach(line => {
        try {
          candleSeriesRef.current.removePriceLine(line);
        } catch (e) {
          // Ignore errors during cleanup
        }
      });
      zoneLinesRef.current = [];

      // Draw zones - Two lines per zone (top and bottom)
      zones.forEach(zone => {
        if (!zone || typeof zone.top !== 'number' || typeof zone.bottom !== 'number') {
          return;
        }

        const zoneType = zone.type?.toUpperCase() || '';
        const strength = zone.strength || 0;
        
        // Determine colors based on zone type
        const zoneColor = zoneType === 'RESISTANCE' ? '#EF4444' : '#22C55E';
        const zoneLabel = zoneType === 'RESISTANCE' 
          ? (strength > 0 ? `RES ${strength}x` : 'RES ZONE')
          : (strength > 0 ? `SUP ${strength}x` : 'SUP ZONE');

        try {
          // Top line with label (title only, no axis label)
          const topLine = candleSeriesRef.current.createPriceLine({
            price: zone.top,
            color: zoneColor,
            lineWidth: 3,
            lineStyle: 2, // Dashed
            axisLabelVisible: false,
            title: zoneLabel,
          });
          zoneLinesRef.current.push(topLine);

          // Bottom line without label
          const bottomLine = candleSeriesRef.current.createPriceLine({
            price: zone.bottom,
            color: zoneColor,
            lineWidth: 3,
            lineStyle: 2, // Dashed
            axisLabelVisible: false,
            title: '',
          });
          zoneLinesRef.current.push(bottomLine);
        } catch (e) {
          console.warn('Failed to create zone lines:', e);
        }
      });
    }
  }, [zones]);

  // Zoom functions for lightweight-charts
  const handleZoomIn = () => {
    if (!chartInstance.current || !candleSeriesRef.current) {
      return;
    }
    
    try {
      const timeScale = chartInstance.current.timeScale();
      const visibleRange = timeScale.getVisibleRange();
      
      if (!visibleRange || visibleRange.from === null || visibleRange.to === null) {
        return;
      }
      
      // Check if we're using date strings (daily) or timestamps (intraday)
      const isDateString = typeof visibleRange.from === 'string';
      
      let from, to;
      if (isDateString) {
        // For daily charts, work with Date objects
        from = new Date(visibleRange.from).getTime();
        to = new Date(visibleRange.to).getTime();
      } else {
        // For intraday charts, work with Unix timestamps (seconds)
        from = visibleRange.from * 1000; // Convert to milliseconds
        to = visibleRange.to * 1000;
      }
      
      const range = to - from;
      const newRange = range * 0.7; // Zoom in by 30%
      const center = (from + to) / 2;
      const newFrom = center - newRange / 2;
      const newTo = center + newRange / 2;
      
      // Set new range with correct format
      if (isDateString) {
        // For daily charts, convert back to date strings
        timeScale.setVisibleRange({
          from: new Date(newFrom).toISOString().split('T')[0],
          to: new Date(newTo).toISOString().split('T')[0],
        });
      } else {
        // For intraday charts, convert back to Unix timestamps (seconds)
        timeScale.setVisibleRange({
          from: Math.floor(newFrom / 1000),
          to: Math.floor(newTo / 1000),
        });
      }
    } catch (error) {
      console.error('Zoom error:', error);
    }
  };

  const handleZoomOut = () => {
    if (!chartInstance.current || !candleSeriesRef.current) {
      return;
    }
    
    try {
      const timeScale = chartInstance.current.timeScale();
      const visibleRange = timeScale.getVisibleRange();
      
      if (!visibleRange || visibleRange.from === null || visibleRange.to === null) {
        return;
      }
      
      // Check if we're using date strings (daily) or timestamps (intraday)
      const isDateString = typeof visibleRange.from === 'string';
      
      let from, to;
      if (isDateString) {
        // For daily charts, work with Date objects
        from = new Date(visibleRange.from).getTime();
        to = new Date(visibleRange.to).getTime();
      } else {
        // For intraday charts, work with Unix timestamps (seconds)
        from = visibleRange.from * 1000; // Convert to milliseconds
        to = visibleRange.to * 1000;
      }
      
      const range = to - from;
      const newRange = range * 1.4; // Zoom out by 40%
      const center = (from + to) / 2;
      const newFrom = center - newRange / 2;
      const newTo = center + newRange / 2;
      
      // Set new range with correct format
      if (isDateString) {
        // For daily charts, convert back to date strings
        timeScale.setVisibleRange({
          from: new Date(newFrom).toISOString().split('T')[0],
          to: new Date(newTo).toISOString().split('T')[0],
        });
      } else {
        // For intraday charts, convert back to Unix timestamps (seconds)
        timeScale.setVisibleRange({
          from: Math.floor(newFrom / 1000),
          to: Math.floor(newTo / 1000),
        });
      }
    } catch (error) {
      console.error('Zoom error:', error);
    }
  };

  const handleResetZoom = () => {
    if (chartInstance.current) {
      chartInstance.current.timeScale().fitContent();
    }
  };

  // Titan mode (lightweight-charts with zones and EMAs)
  return (
    <div className="w-full h-full min-h-[400px] relative flex flex-col">
      {data && data.length > 0 ? (
        <>
          <div className="w-full flex-1 min-h-[400px] relative">
            <div ref={chartContainerRef} className="w-full h-full" />
            
            {/* Zoom Controls - Center Bottom (TradingView style) */}
            <div 
              className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center justify-center bg-transparent"
              style={{ 
                zIndex: 100,
                pointerEvents: 'auto'
              }}
            >
            {/* Center Bottom Zoom Controls */}
            <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md rounded-lg p-1 border border-white/10 shadow-lg" style={{ pointerEvents: 'auto' }}>
              <button
                onClick={handleZoomIn}
                className="p-2 hover:bg-black/50 text-white/90 hover:text-white rounded transition-all flex items-center justify-center cursor-pointer hover:bg-white/10"
                title="Zoom In (+)"
                type="button"
              >
                <ZoomIn size={18} />
              </button>
              <div className="w-px h-6 bg-white/20"></div>
              <button
                onClick={handleZoomOut}
                className="p-2 hover:bg-black/50 text-white/90 hover:text-white rounded transition-all flex items-center justify-center cursor-pointer hover:bg-white/10"
                title="Zoom Out (-)"
                type="button"
              >
                <ZoomOut size={18} />
              </button>
              <div className="w-px h-6 bg-white/20"></div>
              <button
                onClick={handleResetZoom}
                className="p-2 hover:bg-black/50 text-white/90 hover:text-white rounded transition-all flex items-center justify-center cursor-pointer hover:bg-white/10"
                title="Reset Zoom (Fit Content)"
                type="button"
              >
                <RotateCcw size={18} />
              </button>
            </div>
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
