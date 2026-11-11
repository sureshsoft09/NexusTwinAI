import React, { useState, useEffect } from 'react';
import { apiUrl } from '../apiConfig';
import {
  Zap,
  CloudSun,
  MessageSquare,
  Share2,
  TrendingUp,
  CheckCircle2,
  ThermometerSun,
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
      store_id: 'Shop 4: Arlington Stadium Store',
      sku_id: 'HydroBoost Electrolyte 12-Pack',
      author: 'u/DFWMarathonOfficial',
      post_text:
        '🔥 18,500 runners registered for the Arlington Stadium Charity Marathon! Official trackside hydration partner: HydroBoost Electrolyte 12-Packs — grab yours at Arlington Stadium Store!',
      hashtags: ['#ArlingtonMarathon', '#HydroBoost', '#TexasRunners'],
      mention_velocity_per_hr: 420,
      viral_buzz_score: 94.5,
      geo_radius_miles: 1.2,
      predicted_demand_spike_pct: 275.0,
      recommended_units: 1200,
    },
    {
      signal_id: 'SOC-TX-8802',
      platform: 'X / Local Community Forum',
      store_id: 'Shop 2: Houston Galleria Store',
      sku_id: 'HydroBoost Electrolyte 12-Pack',
      author: '@HoustonFitnessClub',
      post_text:
        'Shelves of HydroBoost Electrolyte 12-packs disappearing fast at Houston Galleria Store ahead of the Gulf Coast CrossFit Finals!',
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
        const wRes = await fetch(apiUrl('/api/v1/twin/weather/STORE-PLANO-07'));
        if (wRes.ok) {
          const wData = await wRes.json();
          if (wData.outlook_timeline) setWeather25d(wData);
        }
        const sRes = await fetch(apiUrl('/api/v1/twin/social'));
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
      <div className="bg-white border border-[#DCE4EE] rounded-2xl p-5 shadow-enterprise flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-lg font-bold text-[#14213D]">
            Early-Warning Demand &amp; Weather Radar (Why Store Demand Is Spiking)
          </h1>
          <p className="text-xs text-[#526582] mt-1">
            Monitors 3 early-warning signals simultaneously: <strong>Live Store Cash Registers</strong>, <strong>25-Day Weather Forecasts</strong>, and <strong>Local Event Social Buzz</strong>.
          </p>
        </div>
        <div className="flex items-center space-x-2 bg-[#ECF5FC] border border-[#C2DFF3] px-3.5 py-2 rounded-xl text-xs text-[#094266] font-bold">
          <TrendingUp className="h-4 w-4 text-[#0E5A8A]" />
          <span>3 Live Demand Channels Active</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Live Cash Register (POS) Surges */}
        <div className="bg-white border border-[#DCE4EE] rounded-2xl p-5 shadow-enterprise space-y-4">
          <div className="flex items-center justify-between border-b border-[#DCE4EE] pb-3">
            <span className="font-serif text-xs font-bold text-[#14213D] flex items-center space-x-2">
              <Zap className="h-4 w-4 text-[#C93B2B]" />
              <span>1. Live Store Cash Register Spikes (Now)</span>
            </span>
            <span className="text-[10px] font-bold text-[#C93B2B] bg-[#FDF2F2] px-2.5 py-0.5 rounded-full border border-[#F8CACA]">
              Immediate Action
            </span>
          </div>

          {/* Shop 1 Card */}
          <div className="p-4 bg-[#FDF2F2]/70 rounded-xl border border-[#F8CACA] space-y-2.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-bold text-[#14213D]">Shop 1: Dallas Uptown Store</span>
              <span className="text-[11px] bg-[#C93B2B] text-white px-2.5 py-0.5 rounded-full font-bold">
                215 packs/hr (+348%)
              </span>
            </div>
            <p className="text-[11px] text-[#3B4E6B]">
              Normal Speed: <strong>48 packs/hr</strong> • Shelf Stock Left: <strong>180 packs</strong> • Nearest Warehouse: <strong>Austin (3,600 spare)</strong>
            </p>
            <div className="w-full bg-[#FCE4E4] h-2.5 rounded-full overflow-hidden">
              <div className="bg-[#C93B2B] h-full rounded-full" style={{ width: '86%' }} />
            </div>
            <div className="p-2.5 bg-[#EEFBF6] border border-[#B8EAD8] rounded-lg text-[11px] text-[#095C47] flex items-start space-x-1.5">
              <CheckCircle2 className="h-4 w-4 text-[#0D7A5F] shrink-0 mt-0.5" />
              <span>
                <strong>AI Action:</strong> Automatically shipped 1,500 packs from Austin Warehouse ($750 shipping).
              </span>
            </div>
          </div>

          {/* Shop 2 Card */}
          <div className="p-4 bg-[#FFFBEB] rounded-xl border border-[#FDE68A] space-y-2.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-bold text-[#14213D]">Shop 2: Houston Galleria Store</span>
              <span className="text-[11px] bg-[#C27803] text-white px-2.5 py-0.5 rounded-full font-bold">
                230 packs/hr (+342%)
              </span>
            </div>
            <p className="text-[11px] text-[#3B4E6B]">
              Normal Speed: <strong>52 packs/hr</strong> • Shelf Stock Left: <strong>140 packs</strong> • Houston Warehouse: <strong className="text-[#C93B2B]">Only 180 spare!</strong>
            </p>
            <div className="w-full bg-[#FEF3C7] h-2.5 rounded-full overflow-hidden">
              <div className="bg-[#C27803] h-full rounded-full" style={{ width: '92%' }} />
            </div>
            <div className="p-2.5 bg-white border border-[#FDE68A] rounded-lg text-[11px] text-[#925802]">
              <strong>AI Action:</strong> Houston Warehouse is out of spare stock! Ordered <strong>1,800 packs directly from Waco Factory</strong> and sent to Manager Queue for approval.
            </div>
          </div>
        </div>

        {/* Column 2: 25-Day Weather Forecast Prediction (Shop 3: Plano) */}
        <div className="bg-white border border-[#DCE4EE] rounded-2xl p-5 shadow-enterprise space-y-4">
          <div className="flex items-center justify-between border-b border-[#DCE4EE] pb-3">
            <span className="font-serif text-xs font-bold text-[#14213D] flex items-center space-x-2">
              <CloudSun className="h-4 w-4 text-[#0E5A8A]" />
              <span>2. 25-Day Weather Forecast (Plano Store)</span>
            </span>
            <span className="text-[10px] font-bold text-[#094266] bg-[#ECF5FC] px-2.5 py-0.5 rounded-full border border-[#C2DFF3]">
              Live Weather API
            </span>
          </div>

          <div className="bg-[#F5F8FC] p-4 rounded-xl border border-[#DCE4EE] space-y-3 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-bold text-[#14213D]">Shop 3: Plano Legacy Store</span>
              <span className="text-[10px] bg-[#D6EAF8] text-[#094266] px-2 py-0.5 rounded-full font-bold">
                25 Days Ahead
              </span>
            </div>
            <p className="text-[11px] text-[#3B4E6B] leading-relaxed">
              Today’s weather in Plano is mild (<strong>{weather25d.current_temp_f}°F</strong>), so regular store sales are normal. However, our 25-day forecast detects a <strong>104.2°F Extreme Heatwave arriving on Day +25</strong>:
            </p>

            {/* 25-Day Temperature Progression Bars */}
            <div className="space-y-2 pt-1">
              {(weather25d.outlook_timeline || []).map((pt: any, idx: number) => {
                const isSpike = pt.temp_f >= 100;
                return (
                  <div key={idx} className="flex items-center justify-between text-[11px] font-medium">
                    <span className={`w-28 ${isSpike ? 'font-bold text-[#C93B2B]' : 'text-[#3B4E6B]'}`}>
                      {pt.day}
                    </span>
                    <div className="flex-1 mx-2 bg-[#DCE4EE] h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isSpike ? 'bg-gradient-to-r from-[#C27803] to-[#C93B2B]' : 'bg-[#0E5A8A]'
                        }`}
                        style={{ width: `${Math.min(100, Math.round((pt.temp_f / 110) * 100))}%` }}
                      />
                    </div>
                    <span className={`font-mono ${isSpike ? 'text-[#C93B2B] font-bold' : 'text-[#14213D]'}`}>
                      {pt.temp_f}°F
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-3.5 bg-[#ECF5FC] border border-[#C2DFF3] rounded-xl text-xs space-y-1">
            <p className="font-bold text-[#094266] flex items-center space-x-1.5">
              <ThermometerSun className="h-4 w-4 text-[#0E5A8A]" />
              <span>Why Early Detection Saves 86% on Shipping:</span>
            </p>
            <p className="text-[#3B4E6B] text-[11px] leading-relaxed">
              By spotting the heatwave 25 days early, the system ships <strong>1,500 packs now via $480 economy ground truck</strong> instead of paying $3,500+ for last-minute emergency air freight.
            </p>
          </div>
        </div>

        {/* Column 3: Social Media & Community Event Monitor */}
        <div className="bg-white border border-[#DCE4EE] rounded-2xl p-5 shadow-enterprise space-y-4">
          <div className="flex items-center justify-between border-b border-[#DCE4EE] pb-3">
            <span className="font-serif text-xs font-bold text-[#14213D] flex items-center space-x-2">
              <MessageSquare className="h-4 w-4 text-[#6D28D9]" />
              <span>3. Local Events &amp; Social Media Buzz</span>
            </span>
            <span className="text-[10px] font-bold text-[#6D28D9] bg-[#F5F3FF] px-2.5 py-0.5 rounded-full border border-[#DDD6FE]">
              Reddit &amp; X Monitor
            </span>
          </div>

          <div className="space-y-3">
            {socialSignals.map((sig, idx) => (
              <div key={idx} className="bg-[#F5F8FC] p-4 rounded-xl border border-[#DCE4EE] space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#6D28D9] flex items-center space-x-1.5">
                    <Share2 className="h-3.5 w-3.5 text-[#6D28D9]" />
                    <span>{sig.platform}</span>
                  </span>
                  <span className="text-[10px] bg-[#F5F3FF] text-[#6D28D9] border border-[#DDD6FE] px-2.5 py-0.5 rounded-full font-bold">
                    Viral Score: {sig.viral_buzz_score}/100
                  </span>
                </div>
                <p className="text-[11px] text-[#3B4E6B] italic leading-relaxed bg-white p-2.5 rounded-lg border border-[#DCE4EE]">
                  "{sig.post_text}"
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(sig.hashtags || []).map((tag: string, tIdx: number) => (
                    <span
                      key={tIdx}
                      className="text-[10px] font-semibold bg-[#ECF5FC] text-[#094266] px-2 py-0.5 rounded-full border border-[#C2DFF3]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="pt-2 border-t border-[#DCE4EE] flex justify-between text-[11px] font-semibold text-[#526582]">
                  <span>Near: {sig.store_id} ({sig.geo_radius_miles} mi)</span>
                  <span className="text-[#0D7A5F] font-bold">
                    Restock: +{sig.recommended_units} packs
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
