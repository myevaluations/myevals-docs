/**
 * generate-tech-debt-index.ts
 *
 * Reads all 4 layer enrichment JSONs under generated/ai-enriched/dotnet/per-file/
 * and writes a compact static/tech-debt-data.json for the TechDebtRadar component.
 *
 * Usage: tsx scripts/generate-tech-debt-index.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENRICHED_BASE = path.join(PROJECT_ROOT, 'generated', 'ai-enriched', 'dotnet', 'per-file');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'static', 'tech-debt-data.json');

// Files to skip (auto-generated)
const SKIP_PATTERNS = [
  /^AssemblyInfo\.cs$/,
  /^Settings\.Designer\.cs$/,
  /^Reference\.cs$/,
  /^TemporaryGeneratedFile_/,
];

function slugify(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function complexityToNumber(c: string): number {
  switch (c) {
    case 'trivial': return 0;
    case 'simple': return 1;
    case 'moderate': return 2;
    case 'complex': return 3;
    case 'very-complex': return 4;
    default: return 1;
  }
}

function migrationToNumber(m: string): number {
  switch (m) {
    case 'none': return 0;
    case 'low': return 1;
    case 'medium': return 2;
    case 'high': return 3;
    default: return 0;
  }
}

function buildDocUrl(layer: string, jsonBasename: string): string {
  const slug = slugify(jsonBasename.replace(/\.json$/, ''));
  switch (layer) {
    case 'web':
      return `/docs/dotnet-backend/web/pages/${slug}`;
    case 'business':
      return `/docs/dotnet-backend/business/files/${slug}`;
    case 'scheduler':
    case 'schedulers':
      return `/docs/dotnet-backend/schedulers/files/schedulers`;
    case 'supporting':
      return `/docs/dotnet-backend/supporting/${slug}`;
    default:
      return `/docs/dotnet-backend/file-index`;
  }
}

interface CompactRecord {
  n: string;   // fileName
  p: string;   // filePath
  la: string;  // layer
  m: string;   // module
  c: number;   // complexity 0-4
  r: number;   // migrationRelevance 0-3
  lc: number;  // lineCount
  u: string;   // docUrl
}

async function main() {
  const layers: Array<{ dir: string; layerKey: string }> = [
    { dir: 'web', layerKey: 'web' },
    { dir: 'business', layerKey: 'business' },
    { dir: 'schedulers', layerKey: 'scheduler' },
    { dir: 'supporting', layerKey: 'supporting' },
  ];

  const records: CompactRecord[] = [];

  for (const { dir, layerKey } of layers) {
    const layerDir = path.join(ENRICHED_BASE, dir);
    let jsonFiles: string[];
    try {
      jsonFiles = (await fs.readdir(layerDir)).filter((f) => f.endsWith('.json'));
    } catch {
      console.warn(`Skipping layer ${dir} — directory not found`);
      continue;
    }

    for (const jsonFile of jsonFiles) {
      const filePath = path.join(layerDir, jsonFile);
      const raw = await fs.readFile(filePath, 'utf-8');
      let data: { files: Array<{ fileName: string; filePath: string; module: string; complexity: string; migrationRelevance: string; lineCount: number }> };
      try {
        data = JSON.parse(raw);
      } catch {
        console.warn(`Skipping malformed JSON: ${jsonFile}`);
        continue;
      }

      const docUrl = buildDocUrl(layerKey, jsonFile);

      for (const file of data.files) {
        // Skip auto-generated files
        if (SKIP_PATTERNS.some((p) => p.test(file.fileName))) continue;

        records.push({
          n: file.fileName,
          p: file.filePath,
          la: layerKey,
          m: file.module || '',
          c: complexityToNumber(file.complexity),
          r: migrationToNumber(file.migrationRelevance),
          lc: file.lineCount || 0,
          u: docUrl,
        });
      }
    }
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(records));
  const sizeMB = (JSON.stringify(records).length / 1024 / 1024).toFixed(2);
  console.log(`✅ Wrote ${records.length} records to static/tech-debt-data.json (${sizeMB} MB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
