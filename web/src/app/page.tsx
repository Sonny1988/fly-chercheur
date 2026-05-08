'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Feature,
  FlightAlert,
  SearchParams,
  SearchMode,
  PointsBalance,
  FEATURES_BY_MODE,
  TripClass,
} from '@/lib/types';

const AIRPORTS = [
  { code: 'AMS', label: 'Amsterdam (AMS)' },
  { code: 'CDG', label: 'Paris CDG (CDG)' },
  { code: 'LHR', label: 'Londres (LHR)' },
  { code: 'BRU', label: 'Bruxelles (BRU)' },
  { code: 'FRA', label: 'Francfort (FRA)' },
  { code: 'ZRH', label: 'Zurich (ZRH)' },
  { code: 'BCN', label: 'Barcelone (BCN)' },
  { code: 'MAD', label: 'Madrid (MAD)' },
  { code: 'FCO', label: 'Rome (FCO)' },
  { code: 'VIE', label: 'Vienne (VIE)' },
  { code: 'IST', label: 'Istanbul (IST)' },
  { code: 'DXB', label: 'Dubaï (DXB)' },
  { code: 'BKK', label: 'Bangkok (BKK)' },
  { code: 'SIN', label: 'Singapour (SIN)' },
  { code: 'NRT', label: 'Tokyo Narita (NRT)' },
  { code: 'HND', label: 'Tokyo Haneda (HND)' },
  { code: 'HKG', label: 'Hong Kong (HKG)' },
  { code: 'ICN', label: 'Séoul (ICN)' },
  { code: 'JFK', label: 'New York JFK (JFK)' },
  { code: 'LAX', label: 'Los Angeles (LAX)' },
  { code: 'MIA', label: 'Miami (MIA)' },
  { code: 'GRU', label: 'São Paulo (GRU)' },
  { code: 'SYD', label: 'Sydney (SYD)' },
  { code: 'DPS', label: 'Bali (DPS)' },
  { code: 'KUL', label: 'Kuala Lumpur (KUL)' },
  { code: 'CMN', label: 'Casablanca (CMN)' },
  { code: 'LIS', label: 'Lisbonne (LIS)' },
];

const defaultParams: SearchParams = {
  origin: 'AMS',
  destination: 'BKK',
  departDate: '',
  returnDate: '',
  tripType: 'round-trip',
  class: 'economy',
  adults: 1,
  budget: undefined,
};

const defaultPoints: PointsBalance = {
  flyingBlue: 0,
  krisflyer: 0,
  aeroplan: 0,
  avios: 0,
  chaseUR: 0,
  amexMR: 0,
  lifeMiles: 0,
};

const MODES: { id: SearchMode; label: string; icon: string; subtitle: string }[] = [
  { id: 'flights', label: 'Vols Cash', icon: '✈️', subtitle: '8 outils de recherche prix' },
  { id: 'points', label: 'Points & Miles', icon: '🏆', subtitle: 'Award flights & optimisation' },
  { id: 'hotel', label: 'Hôtels', icon: '🏨', subtitle: 'Cash & points fidélité' },
];

export default function Home() {
  const [mode, setMode] = useState<SearchMode>('flights');
  const [params, setParams] = useState<SearchParams>(defaultParams);
  const [points, setPoints] = useState<PointsBalance>(defaultPoints);
  const [showPoints, setShowPoints] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<Feature>('date-scanner');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<FlightAlert[]>([]);
  const [alertForm, setAlertForm] = useState({
    origin: 'AMS',
    destination: 'BKK',
    class: 'business' as TripClass,
    maxPrice: 1500,
    email: '',
  });
  const [alertLoading, setAlertLoading] = useState<string | null>(null);
  const [alertResults, setAlertResults] = useState<Record<string, string>>({});
  const [showAlerts, setShowAlerts] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('flight-alerts');
    if (stored) setAlerts(JSON.parse(stored));
    const storedPoints = localStorage.getItem('points-balance');
    if (storedPoints) setPoints(JSON.parse(storedPoints));
  }, []);

  useEffect(() => {
    // Set default feature when mode changes
    const features = FEATURES_BY_MODE(mode);
    if (features.length > 0) setSelectedFeature(features[0].id);
    setResult('');
  }, [mode]);

  const saveAlerts = (updated: FlightAlert[]) => {
    setAlerts(updated);
    localStorage.setItem('flight-alerts', JSON.stringify(updated));
  };

  const savePoints = (updated: PointsBalance) => {
    setPoints(updated);
    localStorage.setItem('points-balance', JSON.stringify(updated));
  };

  const hasPoints = Object.values(points).some((v) => v > 0);

  const handleAnalyze = async () => {
    if (!params.origin || !params.destination || !params.departDate) return;
    setLoading(true);
    setResult('');
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

    try {
      const body: Record<string, unknown> = {
        feature: selectedFeature,
        ...params,
      };
      if (mode === 'points' && hasPoints) body.points = points;

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.body) throw new Error('Pas de réponse');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setResult((p) => p + decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      setResult(`**Erreur :** ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAlert = () => {
    if (!alertForm.email) return;
    const alert: FlightAlert = {
      id: Date.now().toString(),
      ...alertForm,
      createdAt: new Date().toISOString(),
    };
    saveAlerts([...alerts, alert]);
    setAlertForm({ ...alertForm, email: '' });
  };

  const handleCheckAlert = async (alert: FlightAlert) => {
    setAlertLoading(alert.id);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature: 'deals-detector',
          isAlert: true,
          alertOrigin: alert.origin,
          alertDest: alert.destination,
          alertClass: alert.class === 'business' ? 'Affaires (Business)' : 'Première classe',
          alertMaxPrice: alert.maxPrice,
        }),
      });
      if (!res.body) throw new Error('No body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setAlertResults((p) => ({ ...p, [alert.id]: text }));
      }
    } catch (e) {
      setAlertResults((p) => ({ ...p, [alert.id]: `Erreur : ${e}` }));
    } finally {
      setAlertLoading(null);
    }
  };

  const handleCheckAllAlerts = () => alerts.forEach(handleCheckAlert);
  const isAlertTriggered = (id: string) => alertResults[id]?.includes('🚨');

  const features = FEATURES_BY_MODE(mode);
  const currentFeature = features.find((f) => f.id === selectedFeature);

  const dateLabel1 = mode === 'hotel' ? 'Check-in' : 'Date départ';
  const dateLabel2 = mode === 'hotel' ? 'Check-out' : 'Date retour';

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0a0d1a 0%, #0f1629 50%, #0a0d1a 100%)' }}>
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">✈️</span>
            <div>
              <h1 className="text-xl font-bold text-white">FlightScanner <span className="text-yellow-400">AI</span></h1>
              <p className="text-xs text-slate-400">Vols · Points & Miles · Hôtels — tout en un</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAlerts((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{ background: showAlerts ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.07)', color: showAlerts ? '#fbbf24' : '#94a3b8', border: '1px solid', borderColor: showAlerts ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.1)' }}
            >
              🔔 Alertes {alerts.length > 0 && <span className="bg-yellow-400 text-black text-xs rounded-full px-1.5">{alerts.length}</span>}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">

        {/* Mode Switcher */}
        <div className="flex gap-2">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className="flex-1 rounded-xl p-4 text-left transition-all"
              style={{
                background: mode === m.id ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${mode === m.id ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <div className="text-xl mb-1">{m.icon}</div>
              <div className={`text-sm font-semibold ${mode === m.id ? 'text-yellow-400' : 'text-white'}`}>{m.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{m.subtitle}</div>
            </button>
          ))}
        </div>

        {/* Points Balance Panel (Points mode) */}
        {mode === 'points' && (
          <div className="rounded-2xl p-5" style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-yellow-400">🏆 Mes balances de points</h2>
              <button
                onClick={() => setShowPoints((v) => !v)}
                className="text-xs px-3 py-1 rounded-lg"
                style={{ background: 'rgba(255,255,255,0.07)', color: '#94a3b8' }}
              >
                {showPoints ? 'Masquer' : 'Modifier'}
              </button>
            </div>

            {!showPoints ? (
              <div className="flex flex-wrap gap-3">
                {[
                  { key: 'flyingBlue', label: 'Flying Blue', icon: '🔵' },
                  { key: 'krisflyer', label: 'KrisFlyer', icon: '🟡' },
                  { key: 'aeroplan', label: 'Aeroplan', icon: '🍁' },
                  { key: 'avios', label: 'Avios', icon: '🇬🇧' },
                  { key: 'lifeMiles', label: 'LifeMiles', icon: '🟠' },
                  { key: 'chaseUR', label: 'Chase UR', icon: '💳' },
                  { key: 'amexMR', label: 'Amex MR', icon: '💎' },
                ].map(({ key, label, icon }) => {
                  const val = points[key as keyof PointsBalance];
                  return (
                    <div
                      key={key}
                      className="rounded-lg px-3 py-2 text-xs"
                      style={{ background: val > 0 ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${val > 0 ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.08)'}` }}
                    >
                      <span className="mr-1">{icon}</span>
                      <span className={val > 0 ? 'text-yellow-300' : 'text-slate-500'}>{label}: {val > 0 ? val.toLocaleString() : '0'}</span>
                    </div>
                  );
                })}
                {!hasPoints && <p className="text-xs text-slate-500 self-center">Cliquez Modifier pour saisir vos balances</p>}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { key: 'flyingBlue', label: 'Flying Blue (AF/KLM)', placeholder: '50000' },
                  { key: 'krisflyer', label: 'KrisFlyer (SQ)', placeholder: '30000' },
                  { key: 'aeroplan', label: 'Aeroplan (AC)', placeholder: '25000' },
                  { key: 'avios', label: 'Avios (BA/IB)', placeholder: '20000' },
                  { key: 'lifeMiles', label: 'LifeMiles (AV)', placeholder: '15000' },
                  { key: 'chaseUR', label: 'Chase Ultimate Rewards', placeholder: '100000' },
                  { key: 'amexMR', label: 'Amex Membership Rewards', placeholder: '80000' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="block text-xs text-slate-400 mb-1">{label}</label>
                    <input
                      type="number"
                      placeholder={placeholder}
                      value={points[key as keyof PointsBalance] || ''}
                      onChange={(e) => {
                        const updated = { ...points, [key]: +e.target.value || 0 };
                        savePoints(updated);
                      }}
                      className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600"
                      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
                    />
                  </div>
                ))}
                <div className="flex items-end">
                  <button
                    onClick={() => setShowPoints(false)}
                    className="w-full rounded-lg px-3 py-2 text-sm font-semibold"
                    style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}
                  >
                    ✓ Sauvegarder
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Search Form */}
        <div className="rounded-2xl p-6 space-y-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
            {mode === 'hotel' ? 'Paramètres de séjour' : 'Paramètres de recherche'}
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">{mode === 'hotel' ? 'Destination (aéroport)' : 'Départ'}</label>
              {mode === 'hotel' ? (
                <select
                  value={params.destination}
                  onChange={(e) => setParams({ ...params, destination: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  {AIRPORTS.map((a) => <option key={a.code} value={a.code} style={{ background: '#1a1f35' }}>{a.label}</option>)}
                </select>
              ) : (
                <select
                  value={params.origin}
                  onChange={(e) => setParams({ ...params, origin: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  {AIRPORTS.map((a) => <option key={a.code} value={a.code} style={{ background: '#1a1f35' }}>{a.label}</option>)}
                </select>
              )}
            </div>

            {mode !== 'hotel' && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Arrivée</label>
                <select
                  value={params.destination}
                  onChange={(e) => setParams({ ...params, destination: e.target.value })}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  {AIRPORTS.map((a) => <option key={a.code} value={a.code} style={{ background: '#1a1f35' }}>{a.label}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-400 mb-1">{dateLabel1}</label>
              <input
                type="date"
                value={params.departDate}
                onChange={(e) => setParams({ ...params, departDate: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm text-white"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', colorScheme: 'dark' }}
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">{dateLabel2}</label>
              <input
                type="date"
                value={params.returnDate || ''}
                onChange={(e) => setParams({ ...params, returnDate: e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm text-white"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', colorScheme: 'dark' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
            {mode !== 'hotel' && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Classe</label>
                <select
                  value={params.class}
                  onChange={(e) => setParams({ ...params, class: e.target.value as TripClass })}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  <option value="economy" style={{ background: '#1a1f35' }}>Économique</option>
                  <option value="business" style={{ background: '#1a1f35' }}>Business</option>
                  <option value="first" style={{ background: '#1a1f35' }}>Première</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-400 mb-1">Personnes</label>
              <select
                value={params.adults}
                onChange={(e) => setParams({ ...params, adults: +e.target.value })}
                className="w-full rounded-lg px-3 py-2 text-sm text-white"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n} style={{ background: '#1a1f35' }}>{n} adulte{n > 1 ? 's' : ''}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Budget max (EUR)</label>
              <input
                type="number"
                placeholder="Ex: 800"
                value={params.budget || ''}
                onChange={(e) => setParams({ ...params, budget: e.target.value ? +e.target.value : undefined })}
                className="w-full rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
              />
            </div>

            {mode !== 'hotel' && (
              <div className="flex items-end">
                <button
                  onClick={() => setParams({ ...params, origin: params.destination, destination: params.origin })}
                  className="w-full rounded-lg px-3 py-2 text-sm font-medium transition-all text-slate-300 hover:text-white"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  ⇄ Inverser
                </button>
              </div>
            )}

            <div className="flex items-end">
              <button
                onClick={handleAnalyze}
                disabled={loading || !params.departDate}
                className="w-full rounded-lg px-4 py-2 text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: loading ? 'rgba(251,191,36,0.3)' : 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000' }}
              >
                {loading ? '⏳ Recherche...' : '🔍 Analyser'}
              </button>
            </div>
          </div>
        </div>

        {/* Feature Grid */}
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            {mode === 'flights' && "Choisir un outil d'analyse vol"}
            {mode === 'points' && 'Choisir un outil points & miles'}
            {mode === 'hotel' && "Choisir un outil hôtel"}
          </h2>
          <div className={`grid gap-3 ${features.length <= 3 ? 'grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>
            {features.map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedFeature(f.id)}
                className={`rounded-xl p-4 text-left transition-all bg-gradient-to-br border ${f.color} ${selectedFeature === f.id ? 'ring-2 ring-yellow-400/60 scale-[1.02]' : 'opacity-70 hover:opacity-100'}`}
              >
                <div className="text-2xl mb-1">{f.icon}</div>
                <div className="text-sm font-semibold text-white">{f.label}</div>
                <div className="text-xs text-slate-400 mt-1">{f.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        {(result || loading) && (
          <div ref={resultRef} className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xl">{currentFeature?.icon}</span>
              <h2 className="text-lg font-semibold text-white">{currentFeature?.label}</h2>
              {loading && (
                <span className="ml-auto text-xs text-yellow-400 animate-pulse">
                  🔄 Recherche web en cours...
                </span>
              )}
            </div>
            <div className="prose prose-invert max-w-none text-sm leading-relaxed text-slate-200">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
              {loading && <span className="inline-block w-2 h-4 bg-yellow-400 animate-pulse ml-1" />}
            </div>
          </div>
        )}

        {/* Business Class Alerts */}
        {showAlerts && (
          <div className="rounded-2xl p-6 space-y-5" style={{ background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.2)' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-yellow-400">🔔 Alertes — Business &amp; Première Classe</h2>
              {alerts.length > 0 && (
                <button
                  onClick={handleCheckAllAlerts}
                  disabled={alertLoading !== null}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium"
                  style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}
                >
                  {alertLoading ? '⏳ Vérification...' : '🔄 Vérifier toutes'}
                </button>
              )}
            </div>

            <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 className="text-sm font-semibold text-white">Nouvelle alerte</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <select value={alertForm.origin} onChange={(e) => setAlertForm({ ...alertForm, origin: e.target.value })} className="rounded-lg px-3 py-2 text-sm text-white" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  {AIRPORTS.map((a) => <option key={a.code} value={a.code} style={{ background: '#1a1f35' }}>{a.code}</option>)}
                </select>
                <select value={alertForm.destination} onChange={(e) => setAlertForm({ ...alertForm, destination: e.target.value })} className="rounded-lg px-3 py-2 text-sm text-white" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  {AIRPORTS.map((a) => <option key={a.code} value={a.code} style={{ background: '#1a1f35' }}>{a.code}</option>)}
                </select>
                <select value={alertForm.class} onChange={(e) => setAlertForm({ ...alertForm, class: e.target.value as TripClass })} className="rounded-lg px-3 py-2 text-sm text-white" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
                  <option value="business" style={{ background: '#1a1f35' }}>Business</option>
                  <option value="first" style={{ background: '#1a1f35' }}>Première</option>
                </select>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
                  <input type="number" placeholder="Prix max" value={alertForm.maxPrice} onChange={(e) => setAlertForm({ ...alertForm, maxPrice: +e.target.value })} className="w-full rounded-lg pl-7 pr-3 py-2 text-sm text-white" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} />
                </div>
                <input type="email" placeholder="Email notification" value={alertForm.email} onChange={(e) => setAlertForm({ ...alertForm, email: e.target.value })} className="rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} />
              </div>
              <button onClick={handleAddAlert} disabled={!alertForm.email} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40" style={{ background: 'rgba(251,191,36,0.2)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' }}>
                + Ajouter l&apos;alerte
              </button>
            </div>

            {alerts.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Aucune alerte configurée.</p>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div key={alert.id} className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${isAlertTriggered(alert.id) ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.08)'}` }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold ${isAlertTriggered(alert.id) ? 'text-red-400' : 'text-white'}`}>{alert.origin} → {alert.destination}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>{alert.class === 'business' ? 'Business' : 'Première'}</span>
                        <span className="text-xs text-slate-400">max {alert.maxPrice} €</span>
                        <span className="text-xs text-slate-500">{alert.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleCheckAlert(alert)} disabled={alertLoading === alert.id} className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.12)' }}>
                          {alertLoading === alert.id ? '⏳' : '🔄 Vérifier'}
                        </button>
                        <button onClick={() => saveAlerts(alerts.filter((a) => a.id !== alert.id))} className="text-xs px-2 py-1.5 rounded-lg text-slate-500 hover:text-red-400" style={{ background: 'rgba(255,255,255,0.05)' }}>✕</button>
                      </div>
                    </div>
                    {alertResults[alert.id] && (
                      <div className={`mt-2 rounded-lg p-3 text-xs ${isAlertTriggered(alert.id) ? 'border border-red-500/30' : ''}`} style={{ background: isAlertTriggered(alert.id) ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)' }}>
                        <div className="prose prose-invert max-w-none text-xs leading-relaxed">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{alertResults[alert.id]}</ReactMarkdown>
                        </div>
                        {isAlertTriggered(alert.id) && alert.email && (
                          <a href={`mailto:${alert.email}?subject=🚨 Alerte vol ${alert.origin}→${alert.destination} ${alert.class}&body=${encodeURIComponent(alertResults[alert.id])}`} className="inline-block mt-2 px-3 py-1 rounded text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', border: '1px solid rgba(239,68,68,0.3)' }}>
                            📧 Envoyer l&apos;alerte par email
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick Links */}
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs text-slate-500 mb-2">Liens rapides :</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Google Flights', url: `https://www.google.com/travel/flights?q=flights+from+${params.origin}+to+${params.destination}&curr=EUR` },
              { label: 'Kayak', url: `https://www.kayak.fr/flights/${params.origin}-${params.destination}` },
              { label: 'Skyscanner', url: `https://www.skyscanner.fr/transport/vols/${params.origin.toLowerCase()}/${params.destination.toLowerCase()}/` },
              { label: 'Skiplagged', url: `https://skiplagged.com/flights/${params.origin}/${params.destination}` },
              { label: 'Seats.aero', url: 'https://seats.aero' },
              { label: 'Point.me', url: 'https://app.point.me' },
              { label: 'Booking', url: `https://www.booking.com/searchresults.fr.html?dest_type=city&checkin=${params.departDate}&checkout=${params.returnDate || ''}` },
              { label: 'KLM Flying Blue', url: 'https://www.flyingblue.com' },
            ].map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-lg transition-all hover:text-white"
                style={{ background: 'rgba(255,255,255,0.06)', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                {link.label} ↗
              </a>
            ))}
          </div>
        </div>

      </main>

      <footer className="text-center py-6 text-xs text-slate-600 border-t border-white/5 mt-8">
        FlightScanner AI — Vols · Points & Miles · Hôtels · Powered by Claude + Web Search · Les prix varient en temps réel
      </footer>
    </div>
  );
}
