import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', 'public', 'data', 'baseball');

console.log('Starting Baseball Analytics data index generation...');
console.log(`Data directory: ${dataDir}`);

// Regex patterns for filename formats
// New:    universal_predictions_MLB_2026-07-12.json
// Legacy: universal_predictions_2026-07-12.json
const LEAGUE_RE  = /^universal_predictions_([A-Za-z0-9\-]+)_(\d{4}-\d{2}-\d{2})\.json$/;
const LEGACY_RE  = /^universal_predictions_(\d{4}-\d{2}-\d{2})\.json$/;

const KNOWN_LEAGUES = ['MLB', 'AAA', 'AA', 'High-A', 'Single-A'];

try {
  if (!fs.existsSync(dataDir)) {
    console.log(`⚠️ No data directory found for baseball, creating...`);
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const files = fs.readdirSync(dataDir).filter(f =>
    f.startsWith('universal_predictions_') && f.endsWith('.json') && f !== 'dates_index.json'
  );

  if (files.length === 0) {
    console.log(`⚠️ No prediction files found for baseball.`);
  }

  // Build per-league date sets
  const leagueDates = {};   // { MLB: Set<string>, AAA: Set<string>, ... }

  for (const file of files) {
    const mLeague = file.match(LEAGUE_RE);
    const mLegacy = file.match(LEGACY_RE);

    if (mLeague) {
      const [, league, dateStr] = mLeague;
      if (!leagueDates[league]) leagueDates[league] = new Set();
      leagueDates[league].add(dateStr);
    } else if (mLegacy) {
      const dateStr = mLegacy[1];
      // Legacy files assumed to be MLB
      if (!leagueDates['MLB']) leagueDates['MLB'] = new Set();
      leagueDates['MLB'].add(dateStr);
    }
  }

  // Convert to sorted arrays (descending)
  const leagues = {};
  for (const [league, dateSet] of Object.entries(leagueDates)) {
    leagues[league] = [...dateSet]
      .sort((a, b) => b.localeCompare(a))
      .map(date => ({ date }));
  }

  // Also produce a flat "all dates" list (union across all leagues, descending)
  const allDates = [...new Set(Object.values(leagueDates).flatMap(s => [...s]))]
    .sort((a, b) => b.localeCompare(a))
    .map(date => ({ date }));

  const index = {
    leagues,           // { MLB: [{date},...], AAA: [{date},...], ... }
    dates: allDates,   // backward-compat flat list
  };

  fs.writeFileSync(
    path.join(dataDir, 'dates_index.json'),
    JSON.stringify(index, null, 2)
  );

  const summary = Object.entries(leagues)
    .map(([l, d]) => `${l}: ${d.length}`)
    .join(', ');
  console.log(`✅ Generated dates_index.json — ${summary}`);

} catch (error) {
  console.error(`❌ Failed to index baseball data:`, error);
  process.exit(1);
}
