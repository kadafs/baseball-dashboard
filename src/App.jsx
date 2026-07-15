import { useState, useEffect, useMemo } from 'react';
import './index.css';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function fipClass(fip) {
  if (fip <= 3.5)  return 'fip-good';
  if (fip <= 4.5)  return 'fip-mid';
  return 'fip-bad';
}

// Removed old parseAction logic

function getFgClass(pct) {
  if (pct >= 60) return 'fg-high';
  if (pct >= 40) return 'fg-mid';
  return 'fg-low';
}

function classifyGame(game) {
  const env    = game.environment;
  const gk     = game.gatekeeper_logic;
  const reasons = [];

  // New architecture: use env_display.signal (directional, qualitative)
  // instead of effective_pf percentage (which distorted the pure core)
  const envDisplay = env?.env_display;
  if (envDisplay && envDisplay.signal !== 'NEUTRAL') {
    const tagType = {
      'STRONG_CONFIRM':    'env-strong-confirm',
      'CONFIRM':           'env-confirm',
      'CONTRADICT':        'env-contradict',
      'STRONG_CONTRADICT': 'env-strong-contradict',
    }[envDisplay.signal] || 'weather-tag';
    const arrow = envDisplay.lean === 'OVER' ? '▲' : '▼';
    reasons.push({ label: `ENV ${envDisplay.signal.replace(/_/g, ' ')} ${arrow}`, type: tagType });
  }

  // Priority flags
  if (gk && (gk.category === 'High-Value Strategy' || gk.category === 'High-Confidence')) {
    reasons.push({ label: gk.category, type: 'edge-tag' });
  }

  if (gk && gk.category === 'Quarantined') {
    reasons.push({ label: 'Asymmetric Total', type: 'veto-tag' });
  }

  return { isPriority: reasons.length > 0, reasons };
}

// Count helper for stats bar & filter counts
function countGkCategory(games, category) {
  return games.filter(g => g.gatekeeper_logic?.category === category).length;
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────
function GatekeeperCell({ logic }) {
  if (!logic || logic.category === "No Edge") return null;

  let bgClass = "gatekeeper-neutral";
  let icon = "📊";

  if (logic.category === "Quarantined") {
    bgClass = "gatekeeper-quarantined";
    icon = "🚨";
  } else if (logic.category === "High-Value Strategy") {
    bgClass = "gatekeeper-strategy";
    icon = "🎯";
  } else if (logic.category === "High-Confidence") {
    bgClass = "gatekeeper-confidence";
    icon = "💎";
  }

  return (
    <div className={`gatekeeper-cell ${bgClass}`}>
      <div className="gatekeeper-header">
        <span className="gatekeeper-icon">{icon}</span>
        <span className="gatekeeper-category">{logic.category}</span>
      </div>
      {logic.action && (
        <div className="gatekeeper-lines">
          <div className="gatekeeper-line-row">
            <span className={`gk-action ${logic.action.includes('SKIP') ? 'gk-skip' : 'gk-bet'}`}>{logic.action}</span>
            {logic.odds && <span className="gk-line" style={{marginLeft: '8px'}}>@{logic.odds.toFixed(2)}</span>}
          </div>
        </div>
      )}
      {logic.reason && <div className="gatekeeper-reason">{logic.reason}</div>}
    </div>
  );
}

function ProbBar({ label, under }) {
  const u = Math.round(under * 100);
  const o = 100 - u;
  return (
    <div className="prob-row-wrap">
      <div className="prob-header">
        <span className="prob-line-label">{label}</span>
        <div className="prob-pct-row">
          <span className="prob-pct under-pct">U {u}%</span>
          <span className="prob-pct over-pct">{o}% O</span>
        </div>
      </div>
      <div className="prob-track">
        <div className="prob-fill fill-u" style={{ width: `${u}%` }} />
        <div className="prob-fill fill-o" style={{ width: `${o}%` }} />
      </div>
    </div>
  );
}

function EnvironmentRow({ env, isPriority, reasons }) {
  const weather    = env.weather;
  const envDisplay = env.env_display;
  const chips = [];

  // Layer 2: ENV signal chip — always shown, always subtle in the env-row
  // (priority tags at top of card carry the color weight)
  const envSignal = envDisplay?.signal || 'NEUTRAL';
  const pf        = env.park_factor || 1.0;
  const pfStr     = pf !== 1.0 ? ` PF${pf > 1 ? '+' : ''}${((pf - 1) * 100).toFixed(0)}%` : '';

  if (envSignal === 'NEUTRAL') {
    chips.push(
      <span key="env-neutral" className="env-chip env-subtle" title="ENV filters: all within normal thresholds">
        🔘 ENV NEUTRAL{pfStr}
      </span>
    );
  } else {
    // Non-neutral: subtle tint (amber for contradict, green for confirm) — NOT bold
    const tintClass = envSignal.includes('CONTRADICT') ? 'env-subtle-contradict' : 'env-subtle-confirm';
    const arrow = envDisplay.lean === 'OVER' ? '▲' : '▼';
    const parts = [];
    if (envDisplay.park_flag    !== 'NEUTRAL') parts.push(`Park: ${envDisplay.park_flag}`);
    if (envDisplay.weather_flag !== 'NEUTRAL') parts.push(`Wx: ${envDisplay.weather_flag}`);
    if (envDisplay.umpire_flag  !== 'NEUTRAL') parts.push(`Ump: ${envDisplay.umpire_flag}`);
    const tooltip = parts.join(' | ') || envSignal;
    chips.push(
      <span key="env-sig" className={`env-chip ${tintClass}`} title={tooltip}>
        🔘 {envSignal.replace(/_/g, ' ')} {arrow}{pfStr}
      </span>
    );
  }

  // Weather chip — purely informational
  if (weather) {
    let windClass = '';
    if (weather.wind_dir === 'Out') windClass = 'wind-out';
    else if (weather.wind_dir === 'In') windClass = 'wind-in';
    chips.push(
      <span key="wl" className={`env-chip ${windClass}`}>
        {weather.is_indoor ? '🏠 Indoor' : `🌡 ${weather.temp}°F | ${weather.wind_mph > 0 ? `${weather.wind_mph}mph ${weather.wind_dir}` : 'Calm'}`}
      </span>
    );
  }

  // Park factor chip — always shown
  chips.push(
    <span key="pf" className="env-chip">
      🏟 PF {env.park_factor}x
    </span>
  );

  // Umpire chip — shows name + K-direction if flagged
  if (env.umpire) {
    const umpFlag = envDisplay?.umpire_flag || 'NEUTRAL';
    const umpDir  = umpFlag.includes('UNDER') ? ' ▼K' : umpFlag.includes('OVER') ? ' ▲K' : '';
    chips.push(
      <span key="ump" className={`env-chip ${umpFlag !== 'NEUTRAL' ? 'umpire-active' : 'umpire'}`}>
        ⚖ {env.umpire.name}{umpDir}
      </span>
    );
  }

  return <div className="env-row">{chips}</div>;
}

function GameCard({ game }) {
  const p      = game.predictions;
  const prob   = game.probabilities;
  const env    = game.environment;
  const pitch  = game.pitchers;
  const gk     = game.gatekeeper_logic;
  const { isPriority, reasons } = classifyGame(game);

  const isConfirmed = game.lineups_status?.toLowerCase().includes('confirmed');

  const fg75  = Math.round((prob.full_over_7_5 || 0) * 100);
  const fg85  = Math.round((prob.full_over_8_5 || 0) * 100);
  const fg95  = Math.round((prob.full_over_9_5 || 0) * 100);

  return (
    <div className={`game-card ${isPriority ? 'is-priority' : ''}`}>
      <div className="card-accent-bar" />

      <div className={`lineup-banner ${isConfirmed ? 'confirmed' : 'generic'}`}>
        <div className="lineup-dot" />
        {isConfirmed ? '✓ Confirmed Lineups' : 'Projected Lineups'}
      </div>

      <div className="card-body">

        {/* Priority tags */}
        {isPriority && (
          <div className="priority-tags">
            {reasons.map((r, i) => (
              <span key={i} className={`p-tag ${r.type}`}>{r.label}</span>
            ))}
          </div>
        )}

        {/* TD-Anchor Clamp warning */}
        {p.td_clamp_applied && (
          <div className="clamp-banner">
            <span className="clamp-icon">&#9889;</span>
            <span className="clamp-text">
              <strong>Lower Conviction</strong> &mdash; MC diverged from Top-Down model.
              Reduce bet size or require stronger line edge.
            </span>
          </div>
        )}

        {/* Execution Flag: Asymmetric Total removed */}

        {/* F5 Form Adjustment banner */}
        {(() => {
          const af = p.away_f5_form;
          const hf = p.home_f5_form;
          if (!af || !hf) return null;
          const alerts = [];
          if (af.factor < 0.88 || af.factor > 1.12) {
            const isCold = af.factor < 0.95;
            alerts.push(
              <span key="af" className={`form-chip ${isCold ? 'form-cold' : 'form-hot'}`}>
                {isCold ? '\u2744' : '\uD83D\uDD25'} {game.away_team}: {af.factor}x
                <span className="form-chip-sub">avg {af.raw_avg} F5 runs</span>
              </span>
            );
          }
          if (hf.factor < 0.88 || hf.factor > 1.12) {
            const isCold = hf.factor < 0.95;
            alerts.push(
              <span key="hf" className={`form-chip ${isCold ? 'form-cold' : 'form-hot'}`}>
                {isCold ? '\u2744' : '\uD83D\uDD25'} {game.home_team}: {hf.factor}x
                <span className="form-chip-sub">avg {hf.raw_avg} F5 runs</span>
              </span>
            );
          }
          if (alerts.length === 0) return null;
          return (
            <div className="form-banner">
              <span className="form-banner-label">F5 Form</span>
              {alerts}
            </div>
          );
        })()}

        {/* Matchup */}
        <div className="matchup">
          <div className="team-block away">
            <span className="team-name">{game.away_team}</span>
            <div className="pitcher-row">
              <span className={`fip-badge ${fipClass(pitch.away.fip)}`}>{pitch.away.fip}</span>
              <span className="pitcher-hand">{pitch.away.hand}HP</span>
              <span style={{ color: 'var(--text-2)', fontSize: '0.78rem' }}>{pitch.away.name || '—'}</span>
            </div>
          </div>

          <div className="vs-center">
            <span className="vs-label">VS</span>
          </div>

          <div className="team-block home">
            <span className="team-name">{game.home_team}</span>
            <div className="pitcher-row home">
              <span className={`fip-badge ${fipClass(pitch.home.fip)}`}>{pitch.home.fip}</span>
              <span className="pitcher-hand">{pitch.home.hand}HP</span>
              <span style={{ color: 'var(--text-2)', fontSize: '0.78rem' }}>{pitch.home.name || '—'}</span>
            </div>
          </div>
        </div>

        {/* Environment */}
        <EnvironmentRow env={env} isPriority={isPriority} reasons={reasons} />

        {/* Projections */}
        <div className="proj-grid">
          <div className="proj-cell">
            <span className="proj-label">TD F5</span>
            <span className="proj-value">{p.top_down_f5}</span>
          </div>
          <div className="proj-cell">
            <span className="proj-label">MC F5</span>
            <span className="proj-value">{p.mc_f5}</span>
          </div>
          {p.consensus_f5 != null && (
            <div className="proj-cell consensus-cell">
              <span className="proj-label">Consensus</span>
              <span className="proj-value highlighted">{p.consensus_f5}</span>
            </div>
          )}
          <div className="proj-cell">
            <span className="proj-label">Late Inn</span>
            <span className="proj-value">{p.mc_late}</span>
          </div>
          <div className="proj-cell">
            <span className="proj-label">Full Game</span>
            <span className="proj-value">{p.mc_full_game}</span>
          </div>
        </div>

        {/* F5 Prob Bars */}
        <div className="prob-section">
          <ProbBar label="3.5" under={prob.under_3_5} />
          <ProbBar label="4.5" under={prob.under_4_5} />
          <ProbBar label="5.5" under={prob.under_5_5} />
        </div>

        {/* Gatekeeper Engine */}
        <GatekeeperCell logic={gk} />

        {/* Full Game Prob Strip */}
        <div className="fg-strip">
          <div className="fg-chip">
            <div className="fg-chip-label">O 7.5</div>
            <div className={`fg-chip-value ${getFgClass(fg75)}`}>{fg75}%</div>
          </div>
          <div className="fg-chip">
            <div className="fg-chip-label">O 8.5</div>
            <div className={`fg-chip-value ${getFgClass(fg85)}`}>{fg85}%</div>
          </div>
          <div className="fg-chip">
            <div className="fg-chip-label">O 9.5</div>
            <div className={`fg-chip-value ${getFgClass(fg95)}`}>{fg95}%</div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────
function Sidebar({ filters, onToggle, games }) {
  const [showHighlight, setShowHighlight] = useState(false);
  const [showGatekeeper, setShowGatekeeper] = useState(false);

  const counts = {
    priority: games.filter(g => classifyGame(g).isPriority).length,
    weather:  games.filter(g => {
                const sig = g.environment?.env_display?.signal;
                return sig && sig !== 'NEUTRAL';
              }).length,
    strategy: countGkCategory(games, 'High-Value Strategy'),
    confidence: countGkCategory(games, 'High-Confidence'),
    quarantined: countGkCategory(games, 'Quarantined'),
  };

  const filterItems = [
    { key: 'priority', label: 'Priority Games',     dot: 'dot-priority', count: counts.priority },
    { key: 'weather',  label: 'ENV Signal Active',  dot: 'dot-weather',  count: counts.weather },
  ];
  const gkItems = [
    { key: 'strategy',  label: 'High-Value Strategy', dot: 'dot-over', count: counts.strategy },
    { key: 'confidence', label: 'High-Confidence', dot: 'dot-high', count: counts.confidence },
    { key: 'quarantined', label: 'Quarantined (Error)', dot: 'dot-skip', count: counts.quarantined },
  ];

  const renderItem = (item) => (
    <div
      key={item.key}
      className={`filter-item ${filters[item.key] ? 'active-filter' : ''}`}
      onClick={() => onToggle(item.key)}
    >
      <div className={`filter-dot ${item.dot}`} />
      <span className="filter-label">{item.label}</span>
      <span className="filter-count">{item.count}</span>
    </div>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-section">
        <div 
          className="sidebar-label" 
          onClick={() => setShowHighlight(!showHighlight)}
          style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span>Highlight</span>
          <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{showHighlight ? '▲' : '▼'}</span>
        </div>
        {showHighlight && <div className="filter-group">{filterItems.map(renderItem)}</div>}
      </div>
      <div className="sidebar-section">
        <div 
          className="sidebar-label" 
          onClick={() => setShowGatekeeper(!showGatekeeper)}
          style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span>Gatekeeper Engine</span>
          <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{showGatekeeper ? '▲' : '▼'}</span>
        </div>
        {showGatekeeper && <div className="filter-group">{gkItems.map(renderItem)}</div>}
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────
// App
// ─────────────────────────────────────────────
export default function App() {
  const [leaguesIndex, setLeaguesIndex] = useState({});  // { MLB: [{date}], AAA: [{date}], ... }
  const [selectedLeague, setLeague]     = useState('MLB');
  const [dates, setDates]               = useState([]);
  const [selectedDate, setDate]         = useState('');
  const [data, setData]                 = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [filters, setFilters]           = useState({
    priority: false, weather: false,
    strategy: false, confidence: false, quarantined: false
  });

  // Load dates index — populates all league date lists
  useEffect(() => {
    fetch('/data/baseball/dates_index.json')
      .then(r => r.json())
      .then(d => {
        const index = d.leagues || {};
        // Backward-compat: if no leagues key, treat flat dates as MLB
        if (!d.leagues && d.dates?.length > 0) {
          index['MLB'] = d.dates;
        }
        setLeaguesIndex(index);

        // Pick a default league: prefer MLB, then first available
        const availLeagues = Object.keys(index);
        const defaultLeague = availLeagues.includes('MLB') ? 'MLB' : (availLeagues[0] || 'MLB');
        setLeague(defaultLeague);

        const leagueDates = index[defaultLeague] || [];
        if (leagueDates.length > 0) {
          setDates(leagueDates);
          setDate(leagueDates[0].date);
        } else {
          setLoading(false);
          setError('No prediction data found.');
        }
      })
      .catch(() => { setLoading(false); setError('Failed to load dates index.'); });
  }, []);

  // When league changes, update dates list and reset date selection
  useEffect(() => {
    if (!leaguesIndex || Object.keys(leaguesIndex).length === 0) return;
    const leagueDates = leaguesIndex[selectedLeague] || [];
    setDates(leagueDates);
    if (leagueDates.length > 0) {
      setDate(leagueDates[0].date);
    } else {
      setDate('');
      setData(null);
      setLoading(false);
      setError(`No data available for ${selectedLeague}.`);
    }
  }, [selectedLeague, leaguesIndex]);

  // Load prediction data — uses league-prefixed filename when available
  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true); setError(null); setData(null);

    // Try league-prefixed file first, fall back to legacy flat name
    const leaguedUrl  = `/data/baseball/universal_predictions_${selectedLeague}_${selectedDate}.json`;
    const legacyUrl   = `/data/baseball/universal_predictions_${selectedDate}.json`;

    fetch(leaguedUrl)
      .then(r => { if (!r.ok) throw new Error('try-legacy'); return r.json(); })
      .catch(() => fetch(legacyUrl).then(r => { if (!r.ok) throw new Error(); return r.json(); }))
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setLoading(false); setError(`No ${selectedLeague} data for ${selectedDate}.`); });
  }, [selectedDate, selectedLeague]);

  const toggleFilter = (key) =>
    setFilters(f => ({ ...f, [key]: !f[key] }));

  const allGames = data?.predictions || [];

  // Filtering
  const anyActive = Object.values(filters).some(Boolean);
  const filtered = useMemo(() => {
    if (!anyActive) return allGames;
    return allGames.filter(game => {
      const { isPriority, reasons } = classifyGame(game);
      const isWeather = game.environment.effective_pf && Math.abs((game.environment.effective_pf - 1.0) * 100) >= 5.0;
      const cat = game.gatekeeper_logic?.category;

      if (filters.priority  && !isPriority) return false;
      if (filters.weather   && !isWeather)  return false;
      if (filters.strategy  && cat !== 'High-Value Strategy') return false;
      if (filters.confidence && cat !== 'High-Confidence') return false;
      if (filters.quarantined && cat !== 'Quarantined') return false;
      return true;
    });
  }, [allGames, filters, anyActive]);

  // Stats
  const priorityGames = allGames.filter(g => classifyGame(g).isPriority);
  const stratCount    = countGkCategory(allGames, 'High-Value Strategy');
  const confCount     = countGkCategory(allGames, 'High-Confidence');
  const quarCount     = countGkCategory(allGames, 'Quarantined');

  const currentDateObj = dates.find(d => d.date === selectedDate);

  return (
    <>
      {/* ── Header ── */}
      <header className="header">
        <div className="header-logo-container">
          <a href="/" className="logo">
            <img
              src="/darklogo.png"
              alt="blowrout — Mathematical Baseball Predictions"
              className="logo-img desktop-logo"
            />
            <img
              src="/favicon_glow.png"
              alt="blowrout — Mathematical Baseball Predictions"
              className="logo-img mobile-logo"
            />
          </a>
        </div>

        <div className="header-controls">


          {/* League switcher */}
          {Object.keys(leaguesIndex).length > 1 && (
            <select
              className="date-select"
              value={selectedLeague}
              onChange={e => {
                setLeague(e.target.value);
                setFilters({ priority: false, weather: false, strategy: false, confidence: false, quarantined: false });
              }}
              style={{ marginRight: '8px' }}
            >
              {Object.keys(leaguesIndex).sort().map(lg => (
                <option key={lg} value={lg}>{lg}</option>
              ))}
            </select>
          )}

          <select
            className="date-select"
            value={selectedDate}
            onChange={e => setDate(e.target.value)}
          >
            {dates.map(d => (
              <option key={d.date} value={d.date}>{d.date}</option>
            ))}
          </select>
        </div>
      </header>

      {/* ── Stats Bar ── */}
      {!loading && !error && (
        <div className="stats-bar">
          <span className="stat-chip chip-total">
            <span className="chip-num">{allGames.length}</span> Matchups
          </span>
          <span className="stat-chip chip-priority">
            🚨 <span className="chip-num">{priorityGames.length}</span> Priority
          </span>
          <span className="stat-chip chip-over">
            🎯 <span className="chip-num">{stratCount}</span> Strategy
          </span>
          <span className="stat-chip chip-under">
            💎 <span className="chip-num">{confCount}</span> Confidence
          </span>
          <span className="stat-chip chip-skip">
            🚫 <span className="chip-num">{quarCount}</span> Quarantined
          </span>
          {anyActive && (
            <span className="stat-chip chip-total" style={{ cursor: 'pointer', borderColor: 'var(--blue)', color: 'var(--blue)' }}
              onClick={() => setFilters({ priority: false, weather: false, strategy: false, confidence: false, quarantined: false })}>
              ✕ Clear Filters ({filtered.length} shown)
            </span>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div className="app-shell">
        {!loading && !error && (
          <Sidebar filters={filters} onToggle={toggleFilter} games={allGames} />
        )}

        <main className="main-content">
          {loading && (
            <div className="loading-state">
              <div className="spinner" />
              <span className="loading-text">Loading predictions…</span>
            </div>
          )}
          {error && <div className="error-state">{error}</div>}

          {!loading && !error && (
            <>
              {/* All / Filtered games */}
              <section>
                <div className="section-header">
                  <span className="section-title">
                    {anyActive ? 'Filtered Results' : 'All Matchups'}
                  </span>
                  <span className="section-count">{filtered.length}</span>
                </div>
                {filtered.length === 0
                  ? <div className="empty-state">No games match the selected filters.</div>
                  : (
                    <div className="games-grid">
                      {filtered.map((g, i) => <GameCard key={`f-${i}`} game={g} />)}
                    </div>
                  )
                }
              </section>
            </>
          )}
        </main>
      </div>
    </>
  );
}
