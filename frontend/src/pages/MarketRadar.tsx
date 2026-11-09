import React, { useState, useEffect } from 'react';
import {
  Radar,
  Thermometer,
  Calendar,
  Zap,
  TrendingUp,
  AlertOctagon,
  CloudSun,
  MessageSquare,
  Share2,
  Database,
} from 'lucide-react';

export const MarketRadar: React.FC = () => {
  const [weather25d, setWeather25d] = useState<any>({
    store_id: 'STORE-PLANO-07',
    city: 'Plano, TX',
    current_temp_f: 79.4,
    forecast_horizon_days: 25,
    predicted_peak_temp_f: 104.2,
    weather_anomaly_type: 'EXTREME_HEAT_DOME_PREDICTION',
    predicted_demand_multiplier: 3.2,
    predicted_extra_units_needed: 1500,
    api_connection_status: 'LIVE_OPEN_METEO_API',
    outlook_timeline: [
      { day: 'Today', temp_f: 79.4, regime: 'NORMAL' },
      { day: 'Day +7', temp_f: 82.5, regime: 'NORMAL' },
      { day: 'Day +14', temp_f: 88.0, regime: 'WARMING' },
      { day: 'Day +21', temp_f: 96.4, regime: 'PRE_HEATWAVE' },
      { day: 'Day +25 (Spike)', temp_f: 104.2, regime: 'EXTREME_HEAT_DOME' },
      { day: 'Day +28', temp_f: 102.8, regime: 'EXTREME_HEAT_DOME' },
    ],
  });

  const [socialSignals, setSocialSignals] = useState<any[]>([
    {
      signal_id: 'SOC-TX-8801',
      platform: 'Reddit (r/arlington & r/dfwrunning)',
      store_id: 'STORE-ARL-11',
      sku_id: 'SKU-4089-HYDRATE',
      author: 'u/DFWMarathonOfficial',
      post_text:
        '🔥 18,500 runners registered for the Arlington Stadium Charity Marathon! Official trackside hydration partner: HydroBoost Electro-Electrolyte 12-Packs — grab yours at Arlington Stadium Center #44!',
      hashtags: ['#ArlingtonMarathon', '#HydroBoost', '#TexasRunners'],
      mention_velocity_per_hr: 420,
      viral_buzz_score: 94.5,
      geo_radius_miles: 1.2,
      predicted_demand_spike_pct: 275.0,
      recommended_units: 1200,
    },
    {
      signal_id: 'SOC-TX-8802',
      platform: 'X / Public Community Forum',
      store_id: 'STORE-HOU-05',
      sku_id: 'SKU-4089-HYDRATE',
      author: '@HoustonFitnessClub',
      post_text:
        'Shelves of HydroBoost Electrolyte 12-packs disappearing fast at Houston Galleria Superstore #55 ahead of the Gulf Coast CrossFit Finals!',
      hashtags: ['#HoustonFitness', '#HydroBoost', '#StockAlert'],
      mention_velocity_per_hr: 310,
      viral_buzz_score: 89.0,
      geo_radius_miles: 2.0,
      predicted_demand_spike_pct: 340.0,
      recommended_units: 1800,
    },
  ]);

  useEffect(() => {
    const loadSignals = async () => {
      try {
        const wRes = await fetch('/api/v1/twin/weather/STORE-PLANO-07');
        if (wRes.ok) {
          const wData = await wRes.json();
          if (wData.outlook_timeline) setWeather25d(wData);
        }
        const sRes = await fetch('/api/v1/twin/social');
        if (sRes.ok) {
          const sData = await sRes.json();
          if (sData.signals?.length) setSocialSignals(sData.signals);
        }
      } catch {
        // Keep defaults
      }
    };
    loadSignals();
  }, []);

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Multi-Channel Demand Sensing Radar (POS + 25-Day Weather API + Social Monitor)
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Google ADK Sensing Agent continuously interrogates BigQuery POS streams, Open-Meteo 25-Day Weather API, and Reddit/X Public Forums via FastMCP (:8083).
          </p>
        </div>
        <div className="flex items-center space-x-2 bg-teal-500/10 border border-teal-500/30 px-3 py-1.5 rounded-lg text-xs text-teal-300 font-mono">
          <Database className="h-3.5 w-3.5" />
          <span>3 Active Ingestion Pipelines</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Real-Time POS Scanner Stream (Shop 1 & Shop 2) */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-semibold text-slate-200 flex items-center space-x-2">
              <Zap className="h-4 w-4 text-amber-400" />
              <span>1. Real-Time POS Simulator Stream</span>
            </span>
            <span className="text-[10px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 font-mono">
              pos_sales_stream
            </span>
          </div>

          {/* Shop 1 Card */}
          <div className="p-3.5 bg-slate-950 rounded-xl border border-red-500/30 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-bold text-white">Shop 1: STORE-DAL-04 (Dallas)</span>
              <span className="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded font-mono font-bold">
                215 u/hr (+348%)
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Baseline: 48 u/hr • Current Stock: 180 units • Serving DC: <strong>DC-ATX-02 (3,600 ATP)</strong>
            </p>
            <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded text-[11px] text-teal-300">
              <strong>Resolution:</strong> Fulfilled from Austin DC via Internal STO (1,500 units).
            </div>
          </div>

          {/* Shop 2 Card */}
          <div className="p-3.5 bg-slate-950 rounded-xl border border-amber-500/40 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-bold text-white">Shop 2: STORE-HOU-05 (Houston)</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono font-bold">
                230 u/hr (+342%)
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Baseline: 52 u/hr • Current Stock: 140 units • Serving DC: <strong>DC-HOU-01 (Only 180 ATP!)</strong>
            </p>
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded text-[11px] text-amber-200">
              <strong>Resolution:</strong> DC-HOU-01 lacks stock! Escalated to <strong>FMCG-PLANT-TX01</strong> via External PO (1,800 units) &amp; A2A HITL.
            </div>
          </div>
        </div>

        {/* Column 2: 25-Day Weather API Forecast Prediction (Shop 3: STORE-PLANO-07) */}
        <div className="bg-slate-900/60 border border-blue-500/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-semibold text-slate-200 flex items-center space-x-2">
              <CloudSun className="h-4 w-4 text-blue-400" />
              <span>2. Weather API (T+25 Days Prediction)</span>
            </span>
            <span className="text-[10px] text-blue-300 bg-blue-500/15 px-2 py-0.5 rounded border border-blue-500/30 font-mono">
              Open-Meteo API
            </span>
          </div>

          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-bold text-white">Shop 3: {weather25d.store_id} (Plano)</span>
              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded font-semibold">
                T+25 DAY HORIZON
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Current POS is normal today (42 u/hr @ {weather25d.current_temp_f}°F), but Weather API ensemble predicts a severe <strong>104.2°F Heat Dome in 25 days</strong>.
            </p>

            {/* 25-Day Temperature Progression Bars */}
            <div className="space-y-1.5 pt-2">
              {(weather25d.outlook_timeline || []).map((pt: any, idx: number) => {
                const isSpike = pt.temp_f >= 100;
                return (
                  <div key={idx} className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-slate-400 w-28">{pt.day}</span>
                    <div className="flex-1 mx-2 bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isSpike ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-blue-400'
                        }`}
                        style={{ width: `${Math.min(100, Math.round((pt.temp_f / 110) * 100))}%` }}
                      />
                    </div>
                    <span className={isSpike ? 'text-red-400 font-bold' : 'text-slate-300'}>{pt.temp_f}°F</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-3 bg-blue-500/10 border border-blue-500/25 rounded-lg text-xs space-y-1">
            <p className="font-semibold text-blue-300">System Prediction Identified (T+25 Days):</p>
            <p className="text-slate-300 text-[11px]">
              Projected <strong>+220% sales spike (+1,500 units)</strong> for SKU-4089-HYDRATE starting Day 25. Pre-positioning stock now from DC-ATX-02 via economy ground ($480).
            </p>
          </div>
        </div>

        {/* Column 3: Social Media & Public Forum Monitor (Shop 4: STORE-ARL-11) */}
        <div className="bg-slate-900/60 border border-purple-500/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="text-xs font-semibold text-slate-200 flex items-center space-x-2">
              <MessageSquare className="h-4 w-4 text-purple-400" />
              <span>3. Social Media &amp; Forum Monitor</span>
            </span>
            <span className="text-[10px] text-purple-300 bg-purple-500/15 px-2 py-0.5 rounded border border-purple-500/30 font-mono">
              Reddit / X Stream
            </span>
          </div>

          <div className="space-y-3">
            {socialSignals.map((sig, idx) => (
              <div key={idx} className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-purple-300 flex items-center space-x-1">
                    <Share2 className="h-3.5 w-3.5" />
                    <span>{sig.platform}</span>
                  </span>
                  <span className="text-[10px] bg-purple-500/20 text-purple-200 px-2 py-0.5 rounded font-mono font-bold">
                    Buzz: {sig.viral_buzz_score}/100
                  </span>
                </div>
                <p className="text-[11px] text-slate-200 italic leading-relaxed">"{sig.post_text}"</p>
                <div className="flex flex-wrap gap-1">
                  {(sig.hashtags || []).map((tag: string, tIdx: number) => (
                    <span
                      key={tIdx}
                      className="text-[10px] font-mono bg-slate-900 text-teal-300 px-1.5 py-0.5 rounded border border-slate-800"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="pt-1.5 border-t border-slate-800/80 flex justify-between text-[10px] font-mono text-slate-400">
                  <span>Target: {sig.store_id} ({sig.geo_radius_miles} mi)</span>
                  <span className="text-emerald-400 font-bold">
                    Action: Stage {sig.recommended_units} units
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
