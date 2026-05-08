'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Feature,
  FlightAlert,
  SearchMode,
  PointsBalance,
  FEATURES_BY_MODE,
  TripClass,
  TripType,
  AIRPORT_CITIES,
} from '@/lib/types';

// ── Constants ─────────────────────────────────────────────────────────────

const POINTS_LABELS: Record<keyof PointsBalance, string> = {
  flyingBlue: 'Flying Blue (AF/KLM)',
  krisflyer: 'KrisFlyer (Singapore)',
  aeroplan: 'Aeroplan (Air Canada)',
  avios: 'Avios (BA/IB)',
  chaseUR: 'Chase Ultimate Rewards',
  amexMR: 'Amex Membership Rewards',
  lifeMiles: 'LifeMiles (Avianca)',
};

const EMPTY_POINTS: PointsBalance = {
  flyingBlue: 0, krisflyer: 0, aeroplan: 0,
  avios: 0, chaseUR: 0, amexMR: 0, lifeMiles: 0,
};

// ── Airport datalist (rendered once, shared) ──────────────────────────────

function AirportDatalist() {
  return (
    <datalist id="airports">
      {Object.entries(AIRPORT_CITIES).map(([code, city]) => (
        <option key={code} value={code}>{code} — {city}</option>
      ))}
    </datalist>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function Home() {
  // Search state
  const [mode, setMode] = useState<SearchMode>('flights');
  const [origin, setOrigin] = useState('AMS');
  const [destination, setDestination] = useState('BKK');
  const [departDate, setDepartDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [tripType, setTripType] = useState<TripType>('round-trip');
  const [seatClass, setSeatClass] = useState<TripClass>('economy');
  const [adults, setAdults] = useState(1);
  const [budget, setBudget] = useState('');

  // Feature state
  const [selectedFeature, setSelectedFeature] = useState<Feature>('date-scanner');

  // Result state
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  // Alerts state
  const [alerts, setAlerts] = useState<FlightAlert[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [alertForm, setAlertForm] = useState({
    origin: 'AMS', destination: 'BKK',
    class: 'business', maxPrice: '', email: '',
  });
  const [alertLoading, setAlertLoading] = useState<string | null>(null);
  const [alertResults, setAlertResults] = useState<Record<string, string>>({});

  // Points state
  const [points, setPoints] = useState<PointsBalance>(EMPTY_POINTS);
  const [showPoints, setShowPoints] = useState(false);

  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const a = localStorage.getItem('flysearch-alerts');
      if (a) setAlerts(JSON.parse(a));
      const p = localStorage.getItem('flysearch-points');
      if (p) setPoints(JSON.parse(p));
    } catch { /* ignore */ }
  }, []);

  const saveAlerts = (updated: FlightAlert[]) => {
    setAlerts(updated);
    localStorage.setItem('flysearch-alerts', JSON.stringify(updated));
  };

  const savePoints = (updated: PointsBalance) => {
    setPoints(updated);
    localStorage.setItem('flysearch-points', JSON.stringify(updated));
  };

  const handleModeChange = (m: SearchMode) => {
    setMode(m);
    const feats = FEATURES_BY_MODE(m);
    if (feats.length > 0) setSelectedFeature(feats[0].id);
    setResult('');
  };

  // ── Streaming fetch helper ───────────────────────────────────────────────

  const streamFetch = async (
    body: Record<string, unknown>,
    onChunk: (text: string) => void,
  ) => {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.body) throw new Error('Pas de réponse du serveur');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      onChunk(text);
    }
  };

  // ── Analyze ──────────────────────────────────────────────────────────────

  const handleAnalyze = async () => {
    if (!origin || !destination || !departDate) return;
    setLoading(true);
    setResult('');
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    try {
      await streamFetch(
        {
          feature: selectedFeature,
          origin,
          destination,
          departDate,
          returnDate: tripType === 'round-trip' ? returnDate : undefined,
          tripType,
          class: seatClass,
          adults,
          budget: budget ? Number(budget) : undefined,
          ...(mode === 'points' ? { points } : {}),
        },
        setResult,
      );
    } catch (e) {
      setResult(`**Erreur :** ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Alert check ──────────────────────────────────────────────────────────

  const handleCheckAlert = async (alert: FlightAlert) => {
    setAlertLoading(alert.id);
    try {
      await streamFetch(
        {
          feature: 'deals-detector',
          isAlert: true,
          alertOrigin: alert.origin,
          alertDest: alert.destination,
          alertClass: alert.class === 'business' ? 'Affaires (Business)' : 'Première classe',
          alertMaxPrice: alert.maxPrice,
        },
        (text) => setAlertResults((p) => ({ ...p, [alert.id]: text })),
      );
    } catch (e) {
      setAlertResults((p) => ({ ...p, [alert.id]: `Erreur : ${e}` }));
    } finally {
      setAlertLoading(null);
    }
  };

  const addAlert = () => {
    if (!alertForm.destination || !alertForm.maxPrice || !alertForm.email) return;
    const newAlert: FlightAlert = {
      id: Date.now().toString(),
      origin: alertForm.origin,
      destination: alertForm.destination,
      class: alertForm.class as TripClass,
      maxPrice: Number(alertForm.maxPrice),
      email: alertForm.email,
      createdAt: new Date().toISOString(),
    };
    saveAlerts([...alerts, newAlert]);
    setAlertForm({ ...alertForm, destination: 'BKK', maxPrice: '', email: '' });
  };

  const isTriggered = (id: string) => alertResults[id]?.includes('🚨');

  const features = FEATURES_BY_MODE(mode);
  const currentFeature = features.find((f) => f.id === selectedFeature);
  const canAnalyze = !!origin && !!destination && !!departDate && !loading;

  const dateLabel1 = mode === 'hotel' ? 'Check-in' : 'Départ';
  const dateLabel2 = mode === 'hotel' ? 'Check-out' : 'Retour';

  return (
    <>
      <AirportDatalist />

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="container">
          <span className="wordmark">FlySearch</span>
          <nav className="mode-tabs">
            {([
              { id: 'flights' as SearchMode, label: 'Vols' },
              { id: 'points' as SearchMode, label: 'Miles & Points' },
              { id: 'hotel' as SearchMode, label: 'Hôtels' },
            ] as const).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => handleModeChange(id)}
                className={`mode-tab${mode === id ? ' active' : ''}`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Search strip ───────────────────────────────────────────────── */}
      <div className="search-strip">
        <div className="container">
          <div className="search-row">

            {mode !== 'hotel' && (
              <>
                <label className="field">
                  <span className="field-label">Départ</span>
                  <input
                    list="airports"
                    className="field-input"
                    style={{ width: '80px', textTransform: 'uppercase' }}
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value.toUpperCase().slice(0, 3))}
                    placeholder="AMS"
                  />
                </label>
                <span className="arrow">→</span>
              </>
            )}

            <label className="field">
              <span className="field-label">{mode === 'hotel' ? 'Destination' : 'Arrivée'}</span>
              <input
                list="airports"
                className="field-input"
                style={{ width: '80px', textTransform: 'uppercase' }}
                value={destination}
                onChange={(e) => setDestination(e.target.value.toUpperCase().slice(0, 3))}
                placeholder="BKK"
              />
            </label>

            {mode !== 'hotel' && (
              <label className="field">
                <span className="field-label">Type</span>
                <select
                  className="field-input"
                  style={{ width: '140px' }}
                  value={tripType}
                  onChange={(e) => setTripType(e.target.value as TripType)}
                >
                  <option value="one-way">Aller simple</option>
                  <option value="round-trip">Aller-retour</option>
                </select>
              </label>
            )}

            <label className="field">
              <span className="field-label">{dateLabel1}</span>
              <input
                type="date"
                className="field-input"
                style={{ width: '148px' }}
                value={departDate}
                onChange={(e) => setDepartDate(e.target.value)}
              />
            </label>

            {(mode === 'hotel' || tripType === 'round-trip') && (
              <label className="field">
                <span className="field-label">{dateLabel2}</span>
                <input
                  type="date"
                  className="field-input"
                  style={{ width: '148px' }}
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                />
              </label>
            )}

            {mode !== 'hotel' && (
              <label className="field">
                <span className="field-label">Classe</span>
                <select
                  className="field-input"
                  style={{ width: '130px' }}
                  value={seatClass}
                  onChange={(e) => setSeatClass(e.target.value as TripClass)}
                >
                  <option value="economy">Économique</option>
                  <option value="business">Affaires</option>
                  <option value="first">Première</option>
                </select>
              </label>
            )}

            <label className="field">
              <span className="field-label">Passagers</span>
              <select
                className="field-input"
                style={{ width: '72px' }}
                value={adults}
                onChange={(e) => setAdults(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Budget max €</span>
              <input
                type="number"
                className="field-input"
                style={{ width: '90px' }}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="900"
                min="0"
              />
            </label>

            <button
              className={`analyze-btn${canAnalyze ? ' active' : ''}`}
              onClick={handleAnalyze}
              disabled={!canAnalyze}
            >
              {loading ? 'Analyse...' : 'Analyser →'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────────────────── */}
      <main className="main">
        <div className="container">

          {/* Feature pills */}
          <div className="feature-row-wrap">
            <div className="feature-row">
              {features.map((f) => (
                <button
                  key={f.id}
                  className={`feature-pill${selectedFeature === f.id ? ' active' : ''}`}
                  onClick={() => setSelectedFeature(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {currentFeature && (
              <p className="feature-desc">{currentFeature.description}</p>
            )}
          </div>

          {/* Points panel (Points & Miles mode only) */}
          {mode === 'points' && (
            <div className="panel">
              <button
                className="panel-header"
                onClick={() => setShowPoints((v) => !v)}
              >
                <span>Soldes de points</span>
                <span className="chevron">{showPoints ? '▲' : '▼'}</span>
              </button>
              {showPoints && (
                <div className="points-grid">
                  {(Object.keys(EMPTY_POINTS) as (keyof PointsBalance)[]).map((key) => (
                    <label key={key} className="points-field">
                      <span className="points-label">{POINTS_LABELS[key]}</span>
                      <input
                        type="number"
                        className="field-input"
                        value={points[key] || ''}
                        onChange={(e) =>
                          savePoints({ ...points, [key]: Number(e.target.value) || 0 })
                        }
                        placeholder="0"
                        min="0"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Alerts panel */}
          <div className="panel">
            <button
              className="panel-header"
              onClick={() => setShowAlerts((v) => !v)}
            >
              <span>
                Alertes prix
                {alerts.length > 0 && (
                  <span className="alert-badge">{alerts.length}</span>
                )}
              </span>
              <span className="chevron">{showAlerts ? '▲' : '▼'}</span>
            </button>

            {showAlerts && (
              <div className="panel-body">
                {/* Alert creation form */}
                <div className="alert-form">
                  <label className="field">
                    <span className="field-label">De</span>
                    <input
                      list="airports"
                      className="field-input"
                      style={{ width: '80px', textTransform: 'uppercase' }}
                      value={alertForm.origin}
                      onChange={(e) =>
                        setAlertForm({ ...alertForm, origin: e.target.value.toUpperCase().slice(0, 3) })
                      }
                      placeholder="AMS"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Vers</span>
                    <input
                      list="airports"
                      className="field-input"
                      style={{ width: '80px', textTransform: 'uppercase' }}
                      value={alertForm.destination}
                      onChange={(e) =>
                        setAlertForm({ ...alertForm, destination: e.target.value.toUpperCase().slice(0, 3) })
                      }
                      placeholder="BKK"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Classe</span>
                    <select
                      className="field-input"
                      style={{ width: '130px' }}
                      value={alertForm.class}
                      onChange={(e) => setAlertForm({ ...alertForm, class: e.target.value })}
                    >
                      <option value="economy">Économique</option>
                      <option value="business">Affaires</option>
                      <option value="first">Première</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Prix max €</span>
                    <input
                      type="number"
                      className="field-input"
                      style={{ width: '90px' }}
                      value={alertForm.maxPrice}
                      onChange={(e) => setAlertForm({ ...alertForm, maxPrice: e.target.value })}
                      placeholder="500"
                      min="0"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Email</span>
                    <input
                      type="email"
                      className="field-input"
                      style={{ width: '200px' }}
                      value={alertForm.email}
                      onChange={(e) => setAlertForm({ ...alertForm, email: e.target.value })}
                      placeholder="vous@email.com"
                    />
                  </label>
                  <button
                    className="add-alert-btn"
                    onClick={addAlert}
                    disabled={!alertForm.destination || !alertForm.maxPrice || !alertForm.email}
                  >
                    + Ajouter
                  </button>
                  {alerts.length > 0 && (
                    <button
                      className="add-alert-btn"
                      onClick={() => alerts.forEach(handleCheckAlert)}
                      disabled={alertLoading !== null}
                      style={{ marginLeft: 'auto' }}
                    >
                      {alertLoading ? 'Vérification...' : 'Vérifier toutes'}
                    </button>
                  )}
                </div>

                {alerts.length === 0 ? (
                  <p className="empty-state">Aucune alerte configurée.</p>
                ) : (
                  <ul className="alert-list">
                    {alerts.map((alert) => (
                      <li key={alert.id} className="alert-item" style={{
                        flexDirection: 'column',
                        alignItems: 'stretch',
                        gap: '8px',
                        borderColor: isTriggered(alert.id) ? 'oklch(52% 0.18 22 / 0.5)' : undefined,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div className="alert-info">
                            <span className="alert-route">{alert.origin} → {alert.destination}</span>
                            <span className="alert-meta">
                              {alert.class} · max {alert.maxPrice} € · {alert.email}
                            </span>
                          </div>
                          <div className="alert-actions">
                            <button
                              className="check-btn"
                              onClick={() => handleCheckAlert(alert)}
                              disabled={alertLoading === alert.id}
                            >
                              {alertLoading === alert.id ? 'Vérification...' : 'Vérifier'}
                            </button>
                            <button
                              className="remove-btn"
                              onClick={() => saveAlerts(alerts.filter((a) => a.id !== alert.id))}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        {alertResults[alert.id] && (
                          <div style={{
                            borderRadius: '8px',
                            padding: '12px 14px',
                            backgroundColor: isTriggered(alert.id)
                              ? 'oklch(97% 0.02 22)'
                              : 'var(--bg-elevated)',
                            fontSize: '13px',
                          }}>
                            <div className="prose">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {alertResults[alert.id]}
                              </ReactMarkdown>
                            </div>
                            {isTriggered(alert.id) && alert.email && (
                              <a
                                href={`mailto:${alert.email}?subject=Alerte vol ${alert.origin}→${alert.destination}&body=${encodeURIComponent(alertResults[alert.id])}`}
                                style={{
                                  display: 'inline-block',
                                  marginTop: '8px',
                                  padding: '5px 12px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: 500,
                                  backgroundColor: 'oklch(52% 0.18 22 / 0.1)',
                                  color: 'oklch(52% 0.18 22)',
                                  border: '1px solid oklch(52% 0.18 22 / 0.3)',
                                  textDecoration: 'none',
                                }}
                              >
                                Envoyer par email
                              </a>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Results */}
          {(result || loading) && (
            <div ref={resultRef} className="result-card">
              {loading && !result && (
                <div className="loading-state">
                  <span className="spinner" />
                  <span>Analyse en cours — recherche web en temps réel...</span>
                </div>
              )}
              {result && (
                <div className="prose">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
                  {loading && (
                    <span style={{
                      display: 'inline-block',
                      width: '2px',
                      height: '16px',
                      backgroundColor: 'var(--accent)',
                      animation: 'spin 1s step-end infinite',
                      verticalAlign: 'middle',
                      marginLeft: '2px',
                    }} />
                  )}
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!result && !loading && (
            <div className="empty-results">
              <p>
                Sélectionnez une destination, choisissez une date de départ et un module
                d&apos;analyse, puis cliquez sur Analyser.
              </p>
            </div>
          )}

          {/* Quick links */}
          <div style={{
            marginTop: '40px',
            paddingTop: '20px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '4px' }}>
              Rechercher aussi sur :
            </span>
            {[
              { label: 'Google Flights', url: `https://www.google.com/travel/flights?q=flights+from+${origin}+to+${destination}&curr=EUR` },
              { label: 'Skyscanner', url: `https://www.skyscanner.fr/transport/vols/${origin.toLowerCase()}/${destination.toLowerCase()}/` },
              { label: 'Kayak', url: `https://www.kayak.fr/flights/${origin}-${destination}` },
              { label: 'Skiplagged', url: `https://skiplagged.com/flights/${origin}/${destination}` },
              { label: 'Seats.aero', url: 'https://seats.aero' },
              { label: 'Point.me', url: 'https://app.point.me' },
              { label: 'Flying Blue', url: 'https://www.flyingblue.com' },
              { label: 'Booking.com', url: `https://www.booking.com/searchresults.fr.html?dest_type=city&checkin=${departDate}&checkout=${returnDate || ''}` },
            ].map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '12px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)',
                  textDecoration: 'none',
                  transition: 'all 0.12s ease',
                  backgroundColor: 'transparent',
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLAnchorElement).style.color = 'var(--accent)';
                  (e.target as HTMLAnchorElement).style.borderColor = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLAnchorElement).style.color = 'var(--text-muted)';
                  (e.target as HTMLAnchorElement).style.borderColor = 'var(--border-subtle)';
                }}
              >
                {link.label} ↗
              </a>
            ))}
          </div>

        </div>
      </main>

      <footer style={{
        textAlign: 'center',
        padding: '24px',
        fontSize: '12px',
        color: 'var(--text-muted)',
        borderTop: '1px solid var(--border-subtle)',
      }}>
        FlySearch — Vols · Miles & Points · Hôtels · Analyse IA + recherche web en temps réel
      </footer>
    </>
  );
}
