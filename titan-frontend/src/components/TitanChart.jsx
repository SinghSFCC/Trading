import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries, LineSeries } from 'lightweight-charts';

export default function TitanChart({ data, interval = "1d", indicators = {
    ema50: false,
    ema200: false,
} }) {
    const chartContainerRef = useRef();
    const chartInstance = useRef(null);
    const resizeCleanupRef = useRef(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // Clean up existing chart instance
        if (chartInstance.current) {
            try {
                chartInstance.current.remove();
            } catch (e) {
                // Chart might already be disposed, ignore error
            }
            chartInstance.current = null;
        }

        // Wait for container to have final size (handles sidebar collapse/expand timing)
        const initializeChart = () => {
            const container = chartContainerRef.current;
            if (!container) return;
            
            const width = container.clientWidth || container.offsetWidth || container.getBoundingClientRect().width || 800;
            const height = container.clientHeight || container.offsetHeight || container.getBoundingClientRect().height || 400;
            
            // Ensure we have valid dimensions
            if (width <= 0 || height <= 0) {
                setTimeout(initializeChart, 50);
                return;
            }
            
            createChartInstance(container, width, height);
        };
        
        // Use requestAnimationFrame to ensure layout is complete
        requestAnimationFrame(() => {
            setTimeout(initializeChart, 0);
        });
        
        const createChartInstance = (container) => {
            const chart = createChart(container, {
            layout: {
                background: { type: ColorType.Solid, color: '#000000' },
                textColor: '#888888',
            },
            grid: {
                vertLines: { color: '#1A1A1A', style: 0 },
                horzLines: { color: '#1A1A1A', style: 0 },
            },
            // Remove explicit width/height - chart will auto-size to container
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
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

        // Create chart series
        let candleSeries, ema50Series, ema200Series;
        
        try {
            if (typeof chart.addSeries !== 'function') {
                console.error('Chart addSeries is not a function');
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
            console.error("Chart series creation error:", e);
            return;
        }
        
        if (!candleSeries) {
            console.error("Failed to create candle series");
            return;
        }

        // Set chart data
        if (data && data.length > 0 && candleSeries) {
            try {
                const isIntraday = interval && ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h"].includes(interval);
                
                // Configure timeScale based on interval
                chart.timeScale().applyOptions({
                    timeVisible: true,
                    secondsVisible: false,
                });
                
                // Format and sort data
                const cleanData = data
                    .map(d => {
                        // Ensure all values are numbers
                        const open = Number(d.open);
                        const high = Number(d.high);
                        const low = Number(d.low);
                        const close = Number(d.close);
                        
                        // Validate data
                        if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
                            return null;
                        }
                        
                        // Handle time format
                        let timeValue = d.time;
                        if (isIntraday) {
                            // For intraday, time should be Unix timestamp (number)
                            if (typeof timeValue === 'string') {
                                const date = new Date(timeValue);
                                if (isNaN(date.getTime())) {
                                    return null;
                                }
                                timeValue = Math.floor(date.getTime() / 1000);
                            } else if (typeof timeValue === 'number') {
                                if (timeValue <= 0 || isNaN(timeValue)) {
                                    return null;
                                }
                            } else {
                                return null;
                            }
                            
                            // Final validation for intraday timestamps
                            if (timeValue <= 0 || timeValue > 2147483647) {
                                return null;
                            }
                        } else {
                            // For daily/weekly/monthly, time is string format
                            if (typeof timeValue === 'number') {
                                if (timeValue <= 0 || isNaN(timeValue)) {
                                    return null;
                                }
                                const date = new Date(timeValue * 1000);
                                if (isNaN(date.getTime())) {
                                    return null;
                                }
                                timeValue = date.toISOString().split('T')[0];
                            } else if (typeof timeValue !== 'string') {
                                return null;
                            }
                        }
                        
                        const dataPoint = {
                            time: timeValue,
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
                    
                    
                    chart.timeScale().fitContent();
                } else {
                    console.warn("No valid data points after cleaning");
                }
            } catch (err) {
                console.error("Chart data error:", err);
            }
        } else {
            if (!data || data.length === 0) {
                console.warn("No chart data provided");
            }
            if (!candleSeries) {
                console.warn("Candle series not created");
            }
        }
        
        // Store chart reference
        chartInstance.current = chart;
        };

        // Set up ResizeObserver after chart is created
        let resizeObserver = null;
        if (chartContainerRef.current && typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(() => {
                requestAnimationFrame(() => {
                    if (!chartContainerRef.current || !chartInstance.current) return;
                    
                    const width = chartContainerRef.current.clientWidth || chartContainerRef.current.offsetWidth;
                    const height = chartContainerRef.current.clientHeight || chartContainerRef.current.offsetHeight;
                    
                    if (chartInstance.current && width > 0 && height > 0) {
                        try {
                            chartInstance.current.applyOptions({ 
                                width: width,
                                height: height
                            });
                        } catch (error) {
                            console.error('Chart resize error:', error);
                        }
                    }
                });
            });
            resizeObserver.observe(chartContainerRef.current);
        }

        // Window resize handler
        const handleWindowResize = () => {
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
        window.addEventListener('resize', handleWindowResize);
        
        // Store cleanup function for resize handlers
        resizeCleanupRef.current = () => {
            window.removeEventListener('resize', handleWindowResize);
            if (resizeObserver && chartContainerRef.current) {
                resizeObserver.unobserve(chartContainerRef.current);
                resizeObserver.disconnect();
            }
        };

        // Cleanup for the entire effect
        return () => {
            // Clean up resize handlers if they were set up
            if (resizeCleanupRef.current) {
                resizeCleanupRef.current();
                resizeCleanupRef.current = null;
            }
            if (chartInstance.current) {
                try {
                    chartInstance.current.remove();
                } catch (e) {
                    // Chart might already be disposed, ignore error
                }
                chartInstance.current = null;
            }
        };
    }, [data, interval, indicators]);

    // Manual resize trigger - catches any missed resize events
    useEffect(() => {
        const forceResize = () => {
            if (chartContainerRef.current && chartInstance.current) {
                const width = chartContainerRef.current.clientWidth || chartContainerRef.current.offsetWidth;
                const height = chartContainerRef.current.clientHeight || chartContainerRef.current.offsetHeight;
                
                if (width > 0 && height > 0) {
                    try {
                        chartInstance.current.applyOptions({ 
                            width: width,
                            height: height
                        });
                    } catch (error) {
                        console.error('Force resize error:', error);
                    }
                }
            }
        };

        const timeoutId = setTimeout(forceResize, 600);
        const resizeInterval = setInterval(forceResize, 200);

        return () => {
            clearTimeout(timeoutId);
            clearInterval(resizeInterval);
        };
    }, [data]);

    return <div ref={chartContainerRef} className="w-full h-full min-h-[400px]" style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0 }} />;
}