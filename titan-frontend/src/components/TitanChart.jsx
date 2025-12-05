import { useEffect, useRef } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';

export default function TitanChart({ data }) {
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

        // Save Instance
        chartInstance.current = chart;

        // 4. Series Add Karo (v5 API: use addSeries with CandlestickSeries)
        let candleSeries;
        try {
            if (typeof chart.addSeries !== 'function') {
                console.error('❌ addSeries is not a function');
                return;
            }
            candleSeries = chart.addSeries(CandlestickSeries, {
                upColor: '#00FF00',
                downColor: '#FF4444',
                borderVisible: false,
                wickUpColor: '#00FF00',
                wickDownColor: '#FF4444',
            });
            console.log("✅ Candle series created successfully");
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
                        
                        return {
                            time: d.time, // String 'YYYY-MM-DD' format
                            open: open,
                            high: high,
                            low: low,
                            close: close,
                        };
                    })
                    .filter(d => d !== null) // Remove invalid entries
                    .sort((a, b) => {
                        // Sort by time
                        const dateA = new Date(a.time);
                        const dateB = new Date(b.time);
                        return dateA - dateB;
                    })
                    // Duplicates hatao
                    .filter((item, index, self) => 
                        index === self.findIndex((t) => t.time === item.time)
                    );

                console.log("✅ Clean Data Points:", cleanData.length);
                
                if (cleanData.length > 0) {
                    candleSeries.setData(cleanData);
                    chart.timeScale().fitContent(); // Zoom to fit
                    console.log("📈 Chart data set successfully");
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
    }, [data]);

    return <div ref={chartContainerRef} className="w-full h-full min-h-[400px]" />;
}