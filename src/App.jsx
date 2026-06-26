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

function parseAction(adv) {
  if (!adv || adv === 'Skip') return { type: 'skip', conf: null, label: 'SKIP' };

  if (adv.includes('Under Lean')) {
    const isR1 = adv.includes('R1');
    const isR2 = adv.includes('R2');
    return {
      type: 'skip-lean',
      conf: isR1 ? 'LEAN R1' : isR2 ? 'LEAN R2' : 'LEAN',
      label: 'UNDER',
    };
  }

  if (adv.includes('Team Bias Veto')) {
    return { type: 'skip-veto', conf: 'TEAM BIAS', label: 'VETO' };
  }

  if (adv.includes('Roof Closed')) {
    return { type: 'skip-roof', conf: 'ROOF PROTOCOL', label: 'SKIP' };
  }

  const isOver  = adv.includes('OVER');
  const isUnder = adv.includes('UNDER');
  const isHigh  = adv.includes('HIGH');
  const isMod   = adv.includes('MODERATE');
  return {
    type:  isOver ? 'bet-over' : isUnder ? 'bet-under' : 'skip',
    conf:  isHigh ? 'HIGH' : isMod ? 'MODERATE' : null,
    label: isOver ? 'OVER' : isUnder ? 'UNDER' : 'SKIP',
  };
}

function getFgClass(pct) {
  if (pct >= 60) return 'fg-high';
  if (pct >= 40) return 'fg-mid';
  return 'fg-low';
}

function classifyGame(game) {
  const env    = game.environment;
  const prob   = game.probabilities;
  const action = game.action_matrix;
  const reasons = [];

  if (env.effective_pf) {
    const pct = (env.effective_pf - 1.0) * 100;
    if (Math.abs(pct) >= 5.0)
      reasons.push({ label: `Weather ${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`, type: 'weather-tag' });
  }

  const hasStrongEdge =
    prob.under_4_5 >= 0.58 || prob.under_4_5 <= 0.42;
  const hasBet = ['adv_3_5','adv_4_5','adv_5_5'].some(k => {
    const a = action[k];
    return a && a !== 'Skip' && a.includes('Bet');
  });

  if (hasStrongEdge && hasBet)
    reasons.push({ label: 'High Confidence Edge', type: 'edge-tag' });

  // Priority flags for execution filters
  if (game.predictions.asymmetric_warning) {
    reasons.push({ label: 'Asymmetric Total', type: 'veto-tag' });
  }
  
  const hasTeamBiasVeto = ['adv_3_5','adv_4_5','adv_5_5'].some(k => {
    const a = action[k];
    return a && a.includes('Team Bias Veto');
  });
  if (hasTeamBiasVeto) {
    reasons.push({ label: 'Team Bias Veto', type: 'veto-tag' });
  }

  return { isPriority: reasons.length > 0, reasons };
}

// Count helpers for stats bar & filter counts
function countActionType(games, type) {
  return games.filter(g => {
    const acts = ['adv_3_5','adv_4_5','adv_5_5'].map(k => parseAction(g.action_matrix[k]));
    return acts.some(a => a.type === type);
  }).length;
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────
function ActionCell({ line, adv }) {
  const a = parseAction(adv);
  return (
    <div className={`action-cell ${a.type}`}>
      <span className="action-line-tag">{line}</span>
      <span className="action-verdict">{a.label}</span>
      {a.conf
        ? <span className={`action-conf conf-${a.conf}`}>{a.conf}</span>
        : <span className="action-conf conf-skip">-</span>
      }
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
  const weather = env.weather;
  const chips = [];

  if (isPriority && reasons.some(r => r.type === 'weather-tag')) {
    const pct = ((env.effective_pf - 1.0) * 100).toFixed(1);
    chips.push(
      <span key="w" className="env-chip extreme-weather">
        🌤 {pct > 0 ? `+${pct}` : pct}% Weather
      </span>
    );
  } else if (weather) {
    let windClass = '';
    if (weather.wind_dir === 'Out') windClass = 'wind-out';
    else if (weather.wind_dir === 'In') windClass = 'wind-in';
    chips.push(
      <span key="wl" className={`env-chip ${windClass}`}>
        {weather.is_indoor ? '🏠 Indoor' : `🌡 ${weather.temp}°F | ${weather.wind_mph > 0 ? `${weather.wind_mph}mph ${weather.wind_dir}` : 'Calm'}`}
      </span>
    );
  }

  chips.push(
    <span key="pf" className="env-chip">
      🏟 PF {env.park_factor}x
    </span>
  );

  if (env.umpire) {
    chips.push(
      <span key="ump" className="env-chip umpire">
        ⚖ {env.umpire.name}
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
  const action = game.action_matrix;
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

        {/* Asymmetric Total warning */}
        {p.asymmetric_warning && (
          <div className="asymmetric-banner">
            <span className="asymmetric-icon">&#9888;</span>
            <span className="asymmetric-text">
              <strong>Asymmetric Total</strong> &mdash; F5 is {(p.f5_ratio * 100).toFixed(1)}% of full game total (Target: 55-60%). Verify SP baselines vs Bullpen.
            </span>
          </div>
        )}

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

        {/* Action Matrix */}
        <div className="action-matrix">
          <ActionCell line="3.5" adv={action.adv_3_5} />
          <ActionCell line="4.5" adv={action.adv_4_5} />
          <ActionCell line="5.5" adv={action.adv_5_5} />
        </div>

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
  const counts = {
    over:     countActionType(games, 'bet-over'),
    under:    countActionType(games, 'bet-under'),
    skip:     games.filter(g => {
                const acts = ['adv_3_5','adv_4_5','adv_5_5'].map(k => parseAction(g.action_matrix[k]));
                return acts.every(a => a.type === 'skip');
              }).length,
    priority: games.filter(g => classifyGame(g).isPriority).length,
    weather:  games.filter(g => {
                const env = g.environment;
                return env.effective_pf && Math.abs((env.effective_pf - 1.0) * 100) >= 5.0;
              }).length,
    high:     games.filter(g => {
                const acts = ['adv_3_5','adv_4_5','adv_5_5'].map(k => parseAction(g.action_matrix[k]));
                return acts.some(a => a.conf === 'HIGH');
              }).length,
    moderate: games.filter(g => {
                const acts = ['adv_3_5','adv_4_5','adv_5_5'].map(k => parseAction(g.action_matrix[k]));
                return acts.some(a => a.conf === 'MODERATE') && !acts.some(a => a.conf === 'HIGH');
              }).length,
  };

  const filterItems = [
    { key: 'priority', label: 'Priority Games', dot: 'dot-priority', count: counts.priority },
    { key: 'weather',  label: 'Extreme Weather', dot: 'dot-weather',  count: counts.weather },
  ];
  const actionItems = [
    { key: 'over',  label: 'Bet OVER',  dot: 'dot-over',  count: counts.over },
    { key: 'under', label: 'Bet UNDER', dot: 'dot-under', count: counts.under },
    { key: 'skip',  label: 'Skip Only', dot: 'dot-skip',  count: counts.skip },
  ];
  const confItems = [
    { key: 'high',     label: 'HIGH',     dot: 'dot-high', count: counts.high },
    { key: 'moderate', label: 'MODERATE', dot: 'dot-mod',  count: counts.moderate },
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
        <div className="sidebar-label">Highlight</div>
        <div className="filter-group">{filterItems.map(renderItem)}</div>
      </div>
      <div className="sidebar-section">
        <div className="sidebar-label">Action</div>
        <div className="filter-group">{actionItems.map(renderItem)}</div>
      </div>
      <div className="sidebar-section">
        <div className="sidebar-label">Confidence</div>
        <div className="filter-group">{confItems.map(renderItem)}</div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────
// App
// ─────────────────────────────────────────────
export default function App() {
  const [dates, setDates]       = useState([]);
  const [selectedDate, setDate] = useState('');
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [filters, setFilters]   = useState({
    priority: false, weather: false,
    over: false, under: false, skip: false,
    high: false, moderate: false,
  });

  // Load dates index
  useEffect(() => {
    fetch('/data/baseball/dates_index.json')
      .then(r => r.json())
      .then(d => {
        if (d.dates?.length > 0) {
          setDates(d.dates);
          setDate(d.dates[0].date);
        } else {
          setLoading(false);
          setError('No prediction data found.');
        }
      })
      .catch(() => { setLoading(false); setError('Failed to load dates index.'); });
  }, []);

  // Load prediction data
  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true); setError(null); setData(null);

    fetch(`/data/baseball/universal_predictions_${selectedDate}.json`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setLoading(false); setError(`Failed to load data for ${selectedDate}.`); });
  }, [selectedDate, dates]);

  const toggleFilter = (key) =>
    setFilters(f => ({ ...f, [key]: !f[key] }));

  const allGames = data?.predictions || [];

  // Filtering
  const anyActive = Object.values(filters).some(Boolean);
  const filtered = useMemo(() => {
    if (!anyActive) return allGames;
    return allGames.filter(game => {
      const { isPriority, reasons } = classifyGame(game);
      const acts = ['adv_3_5','adv_4_5','adv_5_5'].map(k => parseAction(game.action_matrix[k]));
      const hasType = (t) => acts.some(a => a.type === t);
      const hasConf = (c) => acts.some(a => a.conf === c);
      const isWeather = game.environment.effective_pf && Math.abs((game.environment.effective_pf - 1.0) * 100) >= 5.0;
      const allSkip = acts.every(a => a.type === 'skip');

      if (filters.priority  && !isPriority) return false;
      if (filters.weather   && !isWeather)  return false;
      if (filters.over      && !hasType('bet-over'))  return false;
      if (filters.under     && !hasType('bet-under')) return false;
      if (filters.skip      && !allSkip) return false;
      if (filters.high      && !hasConf('HIGH')) return false;
      if (filters.moderate  && !hasConf('MODERATE')) return false;
      return true;
    });
  }, [allGames, filters, anyActive]);

  // Stats
  const priorityGames = allGames.filter(g => classifyGame(g).isPriority);
  const overCount     = countActionType(allGames, 'bet-over');
  const underCount    = countActionType(allGames, 'bet-under');
  const skipCount     = allGames.filter(g => {
    const acts = ['adv_3_5','adv_4_5','adv_5_5'].map(k => parseAction(g.action_matrix[k]));
    return acts.every(a => a.type === 'skip');
  }).length;

  const currentDateObj = dates.find(d => d.date === selectedDate);

  return (
    <>
      {/* ── Header ── */}
      <header className="header">
        <div className="header-logo">
          <span className="logo-icon">⚾</span>
          <h1>Baseball F5 Analytics</h1>
          <span className="badge-v3">V3</span>
        </div>

        <div className="header-controls">
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
            <span className="chip-num">{allGames.length}</span> Games
          </span>
          <span className="stat-chip chip-priority">
            🚨 <span className="chip-num">{priorityGames.length}</span> Priority
          </span>
          <span className="stat-chip chip-over">
            🔥 <span className="chip-num">{overCount}</span> Bet OVER
          </span>
          <span className="stat-chip chip-under">
            🧊 <span className="chip-num">{underCount}</span> Bet UNDER
          </span>
          <span className="stat-chip chip-skip">
            ⬜ <span className="chip-num">{skipCount}</span> Skip
          </span>
          {anyActive && (
            <span className="stat-chip chip-total" style={{ cursor: 'pointer', borderColor: 'var(--blue)', color: 'var(--blue)' }}
              onClick={() => setFilters({ priority: false, weather: false, over: false, under: false, skip: false, high: false, moderate: false })}>
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
