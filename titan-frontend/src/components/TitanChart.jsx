import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries } from 'lightweight-charts';

export default function TitanChart({ data, interval = "1d", indicators = {
    ema50: false,
    ema200: false,
} }) {
    const chartContainerRef = useRef();
    const chartInstance = useRef(null);

    useEffect(() => {
        // 1. Container Check
        if (!chartContainerRef.current) return;

        // 2. Safai: Purana chart hatao (with error handling)
        if (chartInstance.current) {
            try {
                chartInstance.current.remove();
            } catch (e) {
                // Chart might already be disposed, ignore error
                console.log("Chart cleanup:", e.message);
            }
            chartInstance.current = null;
        }

        // 3. Chart Initialize (v5 API)
        const container = chartContainerRef.current;
        const width = container.clientWidth || container.offsetWidth || 800;
        const height = container.clientHeight || container.offsetHeight || 400;
        
        const chart = createChart(container, {
            layout: {
                background: { type: ColorType.Solid, color: '#000000' },
                textColor: '#888888',
            },
            grid: {
                vertLines: { color: '#1A1A1A', style: 0 },
                horzLines: { color: '#1A1A1A', style: 0 },
            },
            width: width,
            height: height,
            timeScale: {
                timeVisible: true,
                secondsVisible: false, // Will be set dynamically based on interval
                borderColor: '#1A1A1A',
            },
            rightPriceScale: {
                borderColor: '#1A1A1A',
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.1,
                },
            },
        });

        // Save Instance
        chartInstance.current = chart;

        // 4. Series Add Karo (v5 API: use addSeries with CandlestickSeries)
        let candleSeries, ema50Series, ema200Series;
        
        try {
            if (typeof chart.addSeries !== 'function') {
                console.error('❌ addSeries is not a function');
                return;
            }
            
            // Main candlestick series
            candleSeries = chart.addSeries(CandlestickSeries, {
                upColor: '#00FF00',
                downColor: '#FF4444',
                borderVisible: false,
                wickUpColor: '#00FF00',
                wickDownColor: '#FF4444',
            });
            console.log("✅ Candle series created successfully");
            
            // EMA 50 line (conditional)
            if (indicators.ema50) {
                ema50Series = chart.addSeries(LineSeries, {
                    color: '#00CCFF',
                    lineWidth: 2,
                    title: 'EMA 50',
                    priceScaleId: 'right',
                });
            }
            
            // EMA 200 line (conditional)
            if (indicators.ema200) {
                ema200Series = chart.addSeries(LineSeries, {
                    color: '#FFAA00',
                    lineWidth: 2,
                    title: 'EMA 200',
                    priceScaleId: 'right',
                });
            }
            
            
        } catch (e) {
            console.error("❌ Series Error:", e);
            return;
        }
        
        // Early return if series creation failed
        if (!candleSeries) {
            console.error("❌ Failed to create candle series");
            return;
        }

        // 5. Data Set Karo
        if (data && data.length > 0 && candleSeries) {
            try {
                console.log("📊 Chart Data Received:", data.length, "points");
                console.log("📊 First data point:", data[0]);
                console.log("📊 Interval:", interval);
                
                // Check if this is intraday data based on interval
                const isIntraday = interval && ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"].includes(interval);
                console.log("📊 Is Intraday:", isIntraday);
                
                // Configure timeScale based on interval
                if (isIntraday) {
                    // For intraday data, show hours and minutes
                    chart.timeScale().applyOptions({
                        timeVisible: true,
                        secondsVisible: false, // Show HH:MM but not seconds
                    });
                } else {
                    // For daily/weekly/monthly, just show dates
                    chart.timeScale().applyOptions({
                        timeVisible: true,
                        secondsVisible: false,
                    });
                }
                
                // Data ko format aur sort karo
                const cleanData = data
                    .map(d => {
                        // Ensure all values are numbers
                        const open = Number(d.open);
                        const high = Number(d.high);
                        const low = Number(d.low);
                        const close = Number(d.close);
                        
                        // Validate data
                        if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
                            console.warn("Invalid data point:", d);
                            return null;
                        }
                        
                        // Handle time format: can be Unix timestamp (number) or string
                        let timeValue = d.time;
                        if (isIntraday) {
                            // For intraday, time should be Unix timestamp (number)
                            if (typeof timeValue === 'string') {
                                // Convert string to timestamp if needed
                                const date = new Date(timeValue);
                                if (isNaN(date.getTime())) {
                                    console.warn("Invalid date string:", timeValue);
                                    return null;
                                }
                                timeValue = Math.floor(date.getTime() / 1000);
                            } else if (typeof timeValue === 'number') {
                                // Already a timestamp, validate it
                                if (timeValue <= 0 || isNaN(timeValue)) {
                                    console.warn("Invalid timestamp:", timeValue, "| Original:", d.time);
                                    return null;
                                }
                                // Use as is
                            } else {
                                console.warn("Unexpected time type:", typeof timeValue, timeValue);
                                return null;
                            }
                            
                            // Final validation for intraday timestamps
                            if (timeValue <= 0 || timeValue > 2147483647) {
                                console.warn("Timestamp out of range:", timeValue);
                                return null;
                            }
                        } else {
                            // For daily/weekly/monthly, time is string format
                            if (typeof timeValue === 'number') {
                                // Convert timestamp to date string
                                if (timeValue <= 0 || isNaN(timeValue)) {
                                    console.warn("Invalid timestamp for daily data:", timeValue);
                                    return null;
                                }
                                const date = new Date(timeValue * 1000);
                                if (isNaN(date.getTime())) {
                                    console.warn("Invalid date from timestamp:", timeValue);
                                    return null;
                                }
                                timeValue = date.toISOString().split('T')[0]; // 'YYYY-MM-DD'
                            } else if (typeof timeValue !== 'string') {
                                console.warn("Unexpected time type for daily:", typeof timeValue, timeValue);
                                return null;
                            }
                        }
                        
                        const dataPoint = {
                            time: timeValue, // Unix timestamp (number) for intraday, string for daily
                            open: open,
                            high: high,
                            low: low,
                            close: close,
                        };
                        
                        
                        // Add EMA values
                        if (d.ema_50 !== undefined && !isNaN(Number(d.ema_50))) {
                            dataPoint.ema_50 = Number(d.ema_50);
                        }
                        if (d.ema_200 !== undefined && !isNaN(Number(d.ema_200))) {
                            dataPoint.ema_200 = Number(d.ema_200);
                        }
                        
                        
                        return dataPoint;
                    })
                    .filter(d => d !== null) // Remove invalid entries
                    .sort((a, b) => {
                        // Sort by time
                        if (isIntraday) {
                            // Both are numbers (timestamps)
                            return a.time - b.time;
                        } else {
                            // Both are strings (dates)
                            return new Date(a.time) - new Date(b.time);
                        }
                    })
                    // Duplicates hatao
                    .filter((item, index, self) => 
                        index === self.findIndex((t) => t.time === item.time)
                    );

                console.log("✅ Clean Data Points:", cleanData.length, "| Intraday:", isIntraday);
                if (cleanData.length > 0) {
                    console.log("📊 First clean data point time:", cleanData[0].time, "| Type:", typeof cleanData[0].time);
                    console.log("📊 Last clean data point time:", cleanData[cleanData.length - 1].time, "| Type:", typeof cleanData[cleanData.length - 1].time);
                    
                    // Debug: Count valid indicator values
                    const ema50Count = cleanData.filter(d => d.ema_50 !== undefined && !isNaN(d.ema_50)).length;
                    const ema200Count = cleanData.filter(d => d.ema_200 !== undefined && !isNaN(d.ema_200)).length;
                    console.log(`📊 Valid indicator counts - EMA50: ${ema50Count}, EMA200: ${ema200Count}`);
                }
                
                if (cleanData.length > 0) {
                    // Set candlestick data
                    candleSeries.setData(cleanData);
                    
                    // Set EMA data (conditional)
                    if (indicators.ema50) {
                        const ema50Data = cleanData
                            .filter(d => d.ema_50 !== undefined)
                            .map(d => ({ time: d.time, value: d.ema_50 }));
                        if (ema50Data.length > 0 && ema50Series) {
                            ema50Series.setData(ema50Data);
                        }
                    }
                    
                    if (indicators.ema200) {
                        const ema200Data = cleanData
                            .filter(d => d.ema_200 !== undefined)
                            .map(d => ({ time: d.time, value: d.ema_200 }));
                        if (ema200Data.length > 0 && ema200Series) {
                            ema200Series.setData(ema200Data);
                        }
                    }
                    
                    
                    chart.timeScale().fitContent(); // Zoom to fit
                    console.log("📈 Chart data set successfully with indicators");
                } else {
                    console.warn("⚠️ No valid data points after cleaning");
                }
            } catch (err) {
                console.error("❌ Chart Data Error:", err);
            }
        } else {
            if (!data || data.length === 0) {
                console.warn("⚠️ No chart data provided");
            }
            if (!candleSeries) {
                console.warn("⚠️ Candle series not created");
            }
        }

        // 6. Resize Handler
        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
            if (chartInstance.current) {
                try {
                    chartInstance.current.remove();
                } catch (e) {
                    // Chart might already be disposed, ignore error
                    console.log("Chart cleanup:", e.message);
                }
                chartInstance.current = null;
            }
        };
    }, [data, interval, indicators]);

    return <div ref={chartContainerRef} className="w-full h-full min-h-[400px]" />;
}