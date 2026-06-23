import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '..', 'public', 'data', 'baseball');

console.log('Starting Baseball Analytics data index generation...');
console.log(`Data directory: ${dataDir}`);

try {
  if (!fs.existsSync(dataDir)) {
    console.log(`⚠️ No data directory found for baseball, creating...`);
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Generate dates_index.json dynamically from whatever prediction files are present
  const files = fs.readdirSync(dataDir).filter(f =>
    f.startsWith('universal_predictions_') && f.endsWith('.json')
  );

  if (files.length === 0) {
    console.log(`⚠️ No prediction files found for baseball.`);
  }

  const dates = [];

  for (const file of files) {
    const match = file.match(/universal_predictions_(\d{4}-\d{2}-\d{2})\.json/);
    if (!match) continue;
    
    const dateStr = match[1];
    dates.push({ date: dateStr });
  }

  // Sort descending by date
  dates.sort((a, b) => b.date.localeCompare(a.date));

  fs.writeFileSync(
    path.join(dataDir, 'dates_index.json'),
    JSON.stringify({ dates }, null, 2)
  );
  console.log(`✅ Generated baseball dates_index.json (${dates.length} dates indexed).`);

} catch (error) {
  console.error(`❌ Failed to index baseball data:`, error);
  process.exit(1);
}
