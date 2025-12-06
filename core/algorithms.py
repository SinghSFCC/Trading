"""
Core algorithms for Titan Trading Dashboard
Supply & Demand Zone Detection using Pivot Clustering
"""
import numpy as np
import pandas as pd
from scipy.signal import argrelextrema
from sklearn.cluster import KMeans


def calculate_supply_demand_zones(df):
    """
    Calculate Supply & Demand Zones using pivot detection and K-Means clustering.
    
    Algorithm:
    1. Find local extrema (pivots) using argrelextrema (order=5)
    2. Cluster pivots using KMeans clustering (AI-driven)
    3. Create zones around cluster centers (Center +/- 0.5%)
    4. Filter zones with Strength >= 2 and within 20% of current price
    
    Returns:
        List of zone dictionaries with: type, top, bottom, strength, start_date, end_date
    """
    try:
        if df is None or len(df) < 50:
            return []
        
        # Get current price (last close)
        current_price = float(df['Close'].iloc[-1])
        
        # Get price data and dates
        high_prices = df['High'].values
        low_prices = df['Low'].values
        dates = df.index.values if isinstance(df.index, pd.DatetimeIndex) else pd.to_datetime(df.index).values
        
        # Find local maxima in High prices (resistance pivots)
        # order=5 means we need 5 points on each side to be lower/higher
        resistance_indices = argrelextrema(high_prices, np.greater, order=5)[0]
        
        # Find local minima in Low prices (support pivots)
        support_indices = argrelextrema(low_prices, np.less, order=5)[0]
        
        # Extract pivot prices and dates
        resistance_pivots = []
        for idx in resistance_indices:
            resistance_pivots.append({
                'price': float(high_prices[idx]),
                'date': dates[idx]
            })
        
        support_pivots = []
        for idx in support_indices:
            support_pivots.append({
                'price': float(low_prices[idx]),
                'date': dates[idx]
            })
        
        # Cluster pivots using KMeans - AI-driven feature
        def cluster_pivots_kmeans(pivots):
            """Cluster pivots using KMeans - AI-driven feature"""
            if len(pivots) < 2:
                return []
            
            # Extract prices for clustering
            prices = np.array([[p['price']] for p in pivots])
            
            # Dynamically decide n_clusters (e.g., len(pivots) // 60, but ensure reasonable bounds)
            # Use more clusters for more pivots, but cap it
            n_clusters = max(2, min(len(pivots) // 3, len(pivots) - 1))
            if len(pivots) < 60:
                n_clusters = max(2, len(pivots) // 3)
            
            # Apply KMeans
            kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = kmeans.fit_predict(prices)
            cluster_centers = kmeans.cluster_centers_.flatten()
            
            # Group pivots by cluster and get cluster centers
            clusters = {}
            for i, label in enumerate(labels):
                if label not in clusters:
                    clusters[label] = {'pivots': [], 'center': cluster_centers[label]}
                clusters[label]['pivots'].append(pivots[i])
            
            # Return clusters with strength >= 2 (at least 2 touches)
            return [cluster for cluster in clusters.values() if len(cluster['pivots']) >= 2]
        
        # Cluster resistance and support pivots using KMeans
        resistance_clusters = cluster_pivots_kmeans(resistance_pivots)
        support_clusters = cluster_pivots_kmeans(support_pivots)
        
        # Build zones from clusters - Create zones around cluster centers (Center +/- 0.5%)
        zones = []
        
        # Resistance zones (Supply zones)
        for cluster in resistance_clusters:
            center = float(cluster['center'])
            pivots = cluster['pivots']
            dates_list = [p['date'] for p in pivots]
            
            # Create zone around center: Center +/- 0.5%
            zone_range = center * 0.005  # 0.5% of center price
            zone = {
                'type': 'RESISTANCE',
                'top': center + zone_range,
                'bottom': center - zone_range,
                'strength': len(pivots),  # Number of touches
                'start_date': pd.to_datetime(min(dates_list)).strftime('%Y-%m-%d'),
                'end_date': pd.to_datetime(max(dates_list)).strftime('%Y-%m-%d')
            }
            zones.append(zone)
        
        # Support zones (Demand zones)
        for cluster in support_clusters:
            center = float(cluster['center'])
            pivots = cluster['pivots']
            dates_list = [p['date'] for p in pivots]
            
            # Create zone around center: Center +/- 0.5%
            zone_range = center * 0.005  # 0.5% of center price
            zone = {
                'type': 'SUPPORT',
                'top': center + zone_range,
                'bottom': center - zone_range,
                'strength': len(pivots),  # Number of touches
                'start_date': pd.to_datetime(min(dates_list)).strftime('%Y-%m-%d'),
                'end_date': pd.to_datetime(max(dates_list)).strftime('%Y-%m-%d')
            }
            zones.append(zone)
        
        # Filter zones: Keep only zones with Strength >= 2 and within 20% range of current price
        filtered_zones = []
        for zone in zones:
            # Check strength requirement (already filtered in clustering, but double-check)
            if zone['strength'] < 2:
                continue
                
            # Check if zone overlaps with current price range (20% above/below)
            zone_top = zone['top']
            zone_bottom = zone['bottom']
            
            # Zone is relevant if:
            # 1. Current price is within zone
            # 2. Zone is within 20% above current price
            # 3. Zone is within 20% below current price
            price_in_zone = zone_bottom <= current_price <= zone_top
            zone_above = zone_bottom <= current_price * 1.20  # Zone within 20% above
            zone_below = zone_top >= current_price * 0.80  # Zone within 20% below
            
            if price_in_zone or zone_above or zone_below:
                filtered_zones.append(zone)
        
        # Sort by strength (descending) and limit to top 10
        filtered_zones.sort(key=lambda x: x['strength'], reverse=True)
        filtered_zones = filtered_zones[:10]
        
        # Remove overlapping zones - if zones overlap, keep the stronger one
        non_overlapping_zones = []
        for zone in filtered_zones:
            overlaps = False
            for existing_zone in non_overlapping_zones:
                # Check if zones overlap in price range
                zone_overlaps = not (zone['top'] < existing_zone['bottom'] or zone['bottom'] > existing_zone['top'])
                if zone_overlaps:
                    # If new zone is stronger, replace the existing one
                    if zone['strength'] > existing_zone['strength']:
                        non_overlapping_zones.remove(existing_zone)
                        break
                    else:
                        overlaps = True
                        break
            
            if not overlaps:
                non_overlapping_zones.append(zone)
        
        # Debug output
        print(f"📊 Zones calculated: {len(zones)} total, {len(filtered_zones)} after filtering, {len(non_overlapping_zones)} after overlap removal")
        if non_overlapping_zones:
            for z in non_overlapping_zones[:3]:
                print(f"  - {z['type']}: {z['bottom']:.2f} to {z['top']:.2f} (strength: {z['strength']}, start: {z['start_date']})")
        
        return non_overlapping_zones
        
    except Exception as e:
        print(f"⚠️ Supply/Demand Zones calculation error: {str(e)[:100]}")
        import traceback
        traceback.print_exc()
        return []


def analyze_market_structure(df):
    """
    Analyze market structure based on last 20 candles.
    
    Compares Last High vs Previous High and Last Low vs Previous Low
    to determine if trend is making Higher Highs (Bullish) or Lower Lows (Bearish).
    
    Returns:
        "BULLISH (Higher Highs)", "BEARISH (Lower Lows)", or "SIDEWAYS"
    """
    try:
        if df is None or len(df) < 40:
            return "SIDEWAYS"
        
        # Get last 20 candles
        recent_20 = df.tail(20)
        
        # Get previous 20 candles (before the last 20)
        if len(df) >= 40:
            previous_20 = df.iloc[-40:-20]
        else:
            previous_20 = df.iloc[:-20] if len(df) > 20 else df.iloc[:len(df)-20]
        
        if len(previous_20) == 0:
            return "SIDEWAYS"
        
        # Find highest high and lowest low in last 20 candles
        current_high = float(recent_20['High'].max())
        current_low = float(recent_20['Low'].min())
        
        # Find highest high and lowest low in previous 20 candles
        previous_high = float(previous_20['High'].max())
        previous_low = float(previous_20['Low'].min())
        
        # Compare: Higher Highs and Higher Lows = BULLISH
        # Lower Highs and Lower Lows = BEARISH
        # Otherwise = SIDEWAYS
        if current_high > previous_high and current_low > previous_low:
            return "BULLISH (Higher Highs)"
        elif current_high < previous_high and current_low < previous_low:
            return "BEARISH (Lower Lows)"
        else:
            return "SIDEWAYS"
            
    except Exception as e:
        print(f"⚠️ Market Structure analysis error: {str(e)[:100]}")
        return "SIDEWAYS"
