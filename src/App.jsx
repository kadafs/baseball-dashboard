import { useState, useEffect } from 'react';
import { AlertTriangle, CloudRain, Wind, Target, Activity } from 'lucide-react';
import './index.css';

function ProgressBar({ label, underProb }) {
  const underPct = Math.round(underProb * 100);
  const overPct = 100 - underPct;
  
  return (
    <div className="prob-row">
      <div className="prob-header">
        <span>{label}</span>
        <span>U {underPct}% | {overPct}% O</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill fill-under" style={{ width: `${underPct}%` }}></div>
        <div className="progress-fill fill-over" style={{ width: `${overPct}%` }}></div>
      </div>
    </div>
  );
}

function ActionRow({ line, adv }) {
  if (!adv) return null;
  const isSkip = adv.includes('Skip');
  const isHigh = adv.includes('HIGH');
  const isMod = adv.includes('MODERATE');
  
  let advClass = 'adv-Skip';
  if (isHigh) advClass = 'adv-HIGH';
  if (isMod) advClass = 'adv-MODERATE';
  
  // parse "Bet **FULL GAME OVER** (e.g. 7.5) (HIGH)" into clean text
  const cleanAdv = adv.replace(/\*\*/g, '');
  
  return (
    <div className="action-row">
      <span className="action-line">Line {line}</span>
      <span className={`action-adv ${advClass}`}>{cleanAdv}</span>
    </div>
  );
}

function GameCard({ game }) {
  const p = game.predictions;
  const prob = game.probabilities;
  const env = game.environment;
  const pitch = game.pitchers;
  const action = game.action_matrix;
  
  // Check priority
  let isPriority = false;
  let priorityReasons = [];
  if (env.effective_pf) {
      const effPct = (env.effective_pf - 1.0) * 100;
      if (Math.abs(effPct) >= 5.0) {
          isPriority = true;
          priorityReasons.push(`Extreme Weather (${effPct > 0 ? '+' : ''}${effPct.toFixed(1)}%)`);
      }
  }
  
  ['adv_3_5', 'adv_4_5', 'adv_5_5'].forEach(k => {
      const a = action[k];
      if (a && a.includes('Bet') && !a.includes('Skip')) {
          if (prob.under_4_5 >= 0.58 || prob.under_4_5 <= 0.42) {
              isPriority = true;
              if (!priorityReasons.includes('High Confidence Edge')) priorityReasons.push('High Confidence Edge');
          }
      }
  });

  return (
    <div className="game-card">
      {isPriority && <div className="priority-flag"></div>}
      
      <div className="matchup">
        <div className="team">
          <span className="team-name">{game.away_team}</span>
          <span className="pitcher-info">{pitch.away.name} ({pitch.away.hand}HP, {pitch.away.fip})</span>
        </div>
        <div className="vs-badge">VS</div>
        <div className="team" style={{textAlign: 'right', alignItems: 'flex-end'}}>
          <span className="team-name">{game.home_team}</span>
          <span className="pitcher-info">{pitch.home.name} ({pitch.home.hand}HP, {pitch.home.fip})</span>
        </div>
      </div>
      
      <div className="environment">
        <div className="badge">
          <Target size={14} /> PF: {env.park_factor}x
        </div>
        {env.weather && (
          <div className={`badge ${isPriority && priorityReasons[0].includes('Weather') ? 'warning' : ''}`}>
            <CloudRain size={14} /> {env.weather.weather_label} | Eff: {env.effective_pf}x
          </div>
        )}
        {env.umpire && (
          <div className="badge">
            <Activity size={14} /> Ump: {env.umpire.name}
          </div>
        )}
      </div>

      <div className="projections-grid">
        <div className="proj-item">
          <span className="proj-label">Top-Down F5</span>
          <span className="proj-value">{p.top_down_f5}</span>
        </div>
        <div className="proj-item">
          <span className="proj-label">Monte Carlo F5</span>
          <span className="proj-value">{p.mc_f5}</span>
        </div>
        <div className="proj-item">
          <span className="proj-label">Late Innings (6-9)</span>
          <span className="proj-value">{p.mc_late}</span>
        </div>
        <div className="proj-item">
          <span className="proj-label">Full Game MC</span>
          <span className="proj-value">{p.mc_full_game}</span>
        </div>
      </div>

      <div className="probability-section">
        <h4 style={{marginBottom: '1rem', color: 'var(--text-secondary)'}}>F5 Probabilities</h4>
        <ProgressBar label="Line 3.5" underProb={prob.under_3_5} />
        <ProgressBar label="Line 4.5" underProb={prob.under_4_5} />
        <ProgressBar label="Line 5.5" underProb={prob.under_5_5} />
      </div>

      <div className="action-matrix">
        <ActionRow line="3.5" adv={action.adv_3_5} />
        <ActionRow line="4.5" adv={action.adv_4_5} />
        <ActionRow line="5.5" adv={action.adv_5_5} />
      </div>

    </div>
  );
}

function App() {
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [mode, setMode] = useState('confirmed'); // 'generic' or 'confirmed'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/data/baseball/dates_index.json')
      .then(r => r.json())
      .then(d => {
        if (d.dates && d.dates.length > 0) {
          setDates(d.dates);
          setSelectedDate(d.dates[0].date);
          
          // Auto-select mode if confirmed isn't available
          if (!d.dates[0].confirmed && d.dates[0].generic) {
              setMode('generic');
          }
        } else {
          setLoading(false);
          setError('No prediction data found.');
        }
      })
      .catch(e => {
        setLoading(false);
        setError('Failed to load dates index.');
      });
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    
    setLoading(true);
    setError(null);
    setData(null);

    // Check if the current selected date has the requested mode
    const dateObj = dates.find(d => d.date === selectedDate);
    if (dateObj && !dateObj[mode]) {
        // Fallback if toggled to a mode that doesn't exist for this date
        setError(`No ${mode} data available for ${selectedDate}.`);
        setLoading(false);
        return;
    }

    const filename = `/data/baseball/universal_predictions_${selectedDate}-${mode}.json`;
    fetch(filename)
      .then(r => {
        if (!r.ok) throw new Error('File not found');
        return r.json();
      })
      .then(d => {
        setData(d);
        setLoading(false);
      })
      .catch(e => {
        setLoading(false);
        setError(`Failed to load data for ${selectedDate} (${mode}).`);
      });
  }, [selectedDate, mode, dates]);

  if (!selectedDate && !loading && !error) return <div className="loading">Initializing...</div>;

  const currentGames = data?.predictions || [];
  
  // Determine Priority Games
  const priorityGames = currentGames.filter(g => {
    const env = g.environment;
    const prob = g.probabilities;
    const action = g.action_matrix;
    
    if (env.effective_pf && Math.abs((env.effective_pf - 1.0) * 100) >= 5.0) return true;
    for (let k of ['adv_3_5', 'adv_4_5', 'adv_5_5']) {
        const a = action[k];
        if (a && a.includes('Bet') && !a.includes('Skip') && (prob.under_4_5 >= 0.58 || prob.under_4_5 <= 0.42)) return true;
    }
    return false;
  });

  return (
    <div className="container">
      <header className="header">
        <h1>Baseball Analytics</h1>
        
        <div className="controls-container">
          <select 
            className="date-select" 
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          >
            {dates.map(d => (
              <option key={d.date} value={d.date}>{d.date}</option>
            ))}
          </select>
          
          <div className="toggle-container">
            <button 
              className={`toggle-btn ${mode === 'generic' ? 'active' : ''}`}
              onClick={() => setMode('generic')}
            >
              Generic
            </button>
            <button 
              className={`toggle-btn ${mode === 'confirmed' ? 'active' : ''}`}
              onClick={() => setMode('confirmed')}
            >
              Confirmed
            </button>
          </div>
        </div>
      </header>

      {loading && <div className="loading">Loading predictions...</div>}
      {error && <div className="error-state">{error}</div>}

      {!loading && !error && (
        <main>
          {priorityGames.length > 0 && (
            <div className="hero-section">
              <h2 className="hero-title"><AlertTriangle size={24} /> TOP PRIORITY GAMES</h2>
              <div className="games-grid">
                {priorityGames.map((g, i) => <GameCard key={i} game={g} />)}
              </div>
            </div>
          )}
          
          <div style={{marginBottom: '2rem'}}>
            <h2 style={{fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '1rem'}}>All Matchups</h2>
            <div className="games-grid">
              {currentGames.map((g, i) => <GameCard key={`all-${i}`} game={g} />)}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

export default App;
