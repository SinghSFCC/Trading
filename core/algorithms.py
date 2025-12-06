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
    Calculate Supply & Demand Zones using pivot detection and clustering.
    
    Algorithm:
    1. Find local extrema (pivots) using argrelextrema (order=5)
    2. Cluster pivots using KMeans clustering
    3. Create zones from clusters with 3+ pivots
    4. Filter zones within 15% of current price
    
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
        
        # Cluster pivots using KMeans
        def cluster_pivots_kmeans(pivots):
            """Cluster pivots using KMeans"""
            if len(pivots) < 3:
                return []
            
            # Extract prices for clustering
            prices = np.array([[p['price']] for p in pivots])
            
            # Calculate number of clusters dynamically
            # Ensure at least 2 clusters and at most len(pivots) - 1
            n_clusters = max(2, min(len(pivots) // 3, len(pivots) - 1))
            
            # Apply KMeans
            kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = kmeans.fit_predict(prices)
            
            # Group pivots by cluster
            clusters = {}
            for i, label in enumerate(labels):
                if label not in clusters:
                    clusters[label] = []
                clusters[label].append(pivots[i])
            
            # Return only clusters with 3+ pivots
            return [cluster for cluster in clusters.values() if len(cluster) >= 3]
        
        # Cluster resistance and support pivots using KMeans
        resistance_clusters = cluster_pivots_kmeans(resistance_pivots)
        support_clusters = cluster_pivots_kmeans(support_pivots)
        
        # Build zones from clusters
        zones = []
        
        # Resistance zones (Supply zones)
        for cluster in resistance_clusters:
            prices = [p['price'] for p in cluster]
            dates_list = [p['date'] for p in cluster]
            
            zone = {
                'type': 'RESISTANCE',
                'top': float(max(prices)),
                'bottom': float(min(prices)),
                'strength': len(cluster),
                'start_date': pd.to_datetime(min(dates_list)).strftime('%Y-%m-%d'),
                'end_date': pd.to_datetime(max(dates_list)).strftime('%Y-%m-%d')
            }
            zones.append(zone)
        
        # Support zones (Demand zones)
        for cluster in support_clusters:
            prices = [p['price'] for p in cluster]
            dates_list = [p['date'] for p in cluster]
            
            zone = {
                'type': 'SUPPORT',
                'top': float(max(prices)),
                'bottom': float(min(prices)),
                'strength': len(cluster),
                'start_date': pd.to_datetime(min(dates_list)).strftime('%Y-%m-%d'),
                'end_date': pd.to_datetime(max(dates_list)).strftime('%Y-%m-%d')
            }
            zones.append(zone)
        
        # Filter zones within 15% of current price
        filtered_zones = []
        for zone in zones:
            # Check if zone overlaps with current price range
            zone_top = zone['top']
            zone_bottom = zone['bottom']
            
            # Zone is relevant if:
            # 1. Current price is within zone
            # 2. Zone is within 15% above current price
            # 3. Zone is within 15% below current price
            price_in_zone = zone_bottom <= current_price <= zone_top
            zone_above = zone_bottom <= current_price * 1.15  # Zone within 15% above
            zone_below = zone_top >= current_price * 0.85  # Zone within 15% below
            
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

