import React, { useState, useEffect } from 'react';
import { apiUrl } from '../apiConfig';
import { getNodeDisplayName } from '../nodeCatalog';
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
  const [liveInv, setLiveInv] = useState<any>({});
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
        '18,500 runners registered for the Arlington Stadium Charity Marathon! Official trackside hydration partner: HydroBoost Electrolyte 12-Packs — grab yours at Shop 4: Arlington (STORE-ARL-11)!',
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
      store_id: 'STORE-HOU-05',
      sku_id: 'SKU-4089-HYDRATE',
      author: '@HoustonFitnessClub',
      post_text:
        'Shelves of HydroBoost Electrolyte 12-packs disappearing fast at Shop 2: Houston (STORE-HOU-05) ahead of the Gulf Coast CrossFit Finals!',
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
        const stateRes = await fetch(apiUrl('/api/v1/twin/state'));
        if (stateRes.ok) {
          const stData = await stateRes.json();
          if (stData.inventory) setLiveInv(stData.inventory);
          if (stData.weather_forecast_25d?.outlook_timeline) setWeather25d(stData.weather_forecast_25d);
          if (stData.social_media_signals?.length) setSocialSignals(stData.social_media_signals);
          return;
        }
      } catch {
        // Keep defaults
      }
    };
    loadSignals();
  }, []);

  const shop1 = liveInv['STORE-DAL-04']?.['SKU-4089-HYDRATE'] || { on_hand: 480, current_velocity: 48, burn_rate_base: 48 };
  const shop2 = liveInv['STORE-HOU-05']?.['SKU-4089-HYDRATE'] || { on_hand: 460, current_velocity: 52, burn_rate_base: 52 };
  const dcAtx = liveInv['DC-ATX-02']?.['SKU-4089-HYDRATE'] || { atp_surplus: 3600 };
  const dcHou = liveInv['DC-HOU-01']?.['SKU-4089-HYDRATE'] || { atp_surplus: 180 };

  const s1Pct = Math.round(((shop1.current_velocity / Math.max(shop1.burn_rate_base || 48, 1)) - 1) * 100);
  const s2Pct = Math.round(((shop2.current_velocity / Math.max(shop2.burn_rate_base || 52, 1)) - 1) * 100);

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      <div className="bg-white border border-[#DCE4EE] rounded-2xl p-5 shadow-enterprise flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-lg font-bold text-[#14213D]">
            Early-Warning Demand &amp; Weather Radar (Live DB Telemetry)
          </h1>
          <p className="text-xs text-[#526582] mt-1">
            Monitors 3 live signals simultaneously: <strong>Live Store POS Streams (Firestore)</strong>, <strong>25-Day Open-Meteo Forecasts</strong>, and <strong>Local Event Social Buzz</strong>.
          </p>
        </div>
        <div className="flex items-center space-x-2 bg-[#ECF5FC] border border-[#C2DFF3] px-3.5 py-2 rounded-xl text-xs text-[#094266] font-bold">
          <TrendingUp className="h-4 w-4 text-[#0E5A8A]" />
          <span>3 Live Demand Channels Active</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Live Cash Register (POS) State from Firestore */}
        <div className="bg-white border border-[#DCE4EE] rounded-2xl p-5 shadow-enterprise space-y-4">
          <div className="flex items-center justify-between border-b border-[#DCE4EE] pb-3">
            <span className="font-serif text-xs font-bold text-[#14213D] flex items-center space-x-2">
              <Zap className="h-4 w-4 text-[#C93B2B]" />
              <span>1. Live Store POS Telemetry (Firestore)</span>
            </span>
            <span className="text-[10px] font-bold text-[#C93B2B] bg-[#FDF2F2] px-2.5 py-0.5 rounded-full border border-[#F8CACA]">
              Real-Time DB
            </span>
          </div>

          {/* Shop 1 Card */}
          <div className="p-4 bg-[#FDF2F2]/70 rounded-xl border border-[#F8CACA] space-y-2.5 text-xs">
            <div className="flex justify-between items-center gap-2">
              <span className="font-bold text-[#14213D]">{getNodeDisplayName('STORE-DAL-04')}</span>
              <span className={`text-[11px] text-white px-2.5 py-0.5 rounded-full font-bold shrink-0 ${s1Pct > 50 ? 'bg-[#C93B2B]' : 'bg-[#0D7A5F]'}`}>
                {shop1.current_velocity} packs/hr ({s1Pct >= 0 ? `+${s1Pct}%` : `${s1Pct}%`})
              </span>
            </div>
            <p className="text-[11px] text-[#3B4E6B]">
              Baseline: <strong>{shop1.burn_rate_base || 48} packs/hr</strong> • Live DB Shelf: <strong>{shop1.on_hand} packs</strong> • {getNodeDisplayName('DC-ATX-02')}: <strong>{dcAtx.atp_surplus?.toLocaleString()} spare ATP</strong>
            </p>
            <div className="w-full bg-[#FCE4E4] h-2.5 rounded-full overflow-hidden">
              <div className="bg-[#C93B2B] h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.round((shop1.current_velocity / 240) * 100))}%` }} />
            </div>
            <div className="p-2.5 bg-[#EEFBF6] border border-[#B8EAD8] rounded-lg text-[11px] text-[#095C47] flex items-start space-x-1.5">
              <CheckCircle2 className="h-4 w-4 text-[#0D7A5F] shrink-0 mt-0.5" />
              <span>
                <strong>Autonomous Path:</strong> Served by {getNodeDisplayName('DC-ATX-02')} via internal Retail STO (&le; $1,000 cap).
              </span>
            </div>
          </div>

          {/* Shop 2 Card */}
          <div className="p-4 bg-[#FFFBEB] rounded-xl border border-[#FDE68A] space-y-2.5 text-xs">
            <div className="flex justify-between items-center gap-2">
              <span className="font-bold text-[#14213D]">{getNodeDisplayName('STORE-HOU-05')}</span>
              <span className={`text-[11px] text-white px-2.5 py-0.5 rounded-full font-bold shrink-0 ${s2Pct > 50 ? 'bg-[#C27803]' : 'bg-[#0D7A5F]'}`}>
                {shop2.current_velocity} packs/hr ({s2Pct >= 0 ? `+${s2Pct}%` : `${s2Pct}%`})
              </span>
            </div>
            <p className="text-[11px] text-[#3B4E6B]">
              Baseline: <strong>{shop2.burn_rate_base || 52} packs/hr</strong> • Live DB Shelf: <strong>{shop2.on_hand} packs</strong> • {getNodeDisplayName('DC-HOU-01')}: <strong className="text-[#C93B2B]">Only {dcHou.atp_surplus} spare ATP!</strong>
            </p>
            <div className="w-full bg-[#FEF3C7] h-2.5 rounded-full overflow-hidden">
              <div className="bg-[#C27803] h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.round((shop2.current_velocity / 240) * 100))}%` }} />
            </div>
            <div className="p-2.5 bg-white border border-[#FDE68A] rounded-lg text-[11px] text-[#925802]">
              <strong>B2B Escalation Path:</strong> Insufficient Retail Warehouse ATP &rarr; crosses B2B MCP boundary to {getNodeDisplayName('FMCG-PLANT-TX01')} &amp; pauses for VP Sign-Off in Tab 5.
            </div>
          </div>
        </div>

        {/* Column 2: 25-Day Weather Forecast Prediction (Shop 3: Plano) */}
        <div className="bg-white border border-[#DCE4EE] rounded-2xl p-5 shadow-enterprise space-y-4">
          <div className="flex items-center justify-between border-b border-[#DCE4EE] pb-3">
            <span className="font-serif text-xs font-bold text-[#14213D] flex items-center space-x-2">
              <CloudSun className="h-4 w-4 text-[#0E5A8A]" />
              <span>2. 25-Day Weather Forecast</span>
            </span>
            <span className="text-[10px] font-bold text-[#094266] bg-[#ECF5FC] px-2.5 py-0.5 rounded-full border border-[#C2DFF3]">
              Live Open-Meteo API
            </span>
          </div>

          <div className="bg-[#F5F8FC] p-4 rounded-xl border border-[#DCE4EE] space-y-3 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-bold text-[#14213D]">{getNodeDisplayName('STORE-PLANO-07')}</span>
              <span className="text-[10px] bg-[#D6EAF8] text-[#094266] px-2 py-0.5 rounded-full font-bold">
                25 Days Ahead
              </span>
            </div>
            <p className="text-[11px] text-[#3B4E6B] leading-relaxed">
              Today’s temperature in Plano is mild (<strong>{weather25d.current_temp_f}°F</strong>). The 25-day ensemble detects a <strong>104.2°F Extreme Heat Dome arriving on Day +25</strong>:
            </p>

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
              Spotting the heat dome 25 days early enables scheduled economy ground freight (<strong>$480</strong>) from {getNodeDisplayName('DC-ATX-02')} instead of $3,500 emergency air freight.
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
                  <span>Near: {getNodeDisplayName(sig.store_id)} ({sig.geo_radius_miles} mi)</span>
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
