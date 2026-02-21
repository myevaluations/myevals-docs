/**
 * generate-reverse-deps.ts
 *
 * Reads all enrichment JSONs (web + scheduler layers) and inverts the
 * `businessManagersUsed[]` arrays to build per-module reverse dependency maps.
 *
 * Output: generated/reverse-deps/{ModuleName}.json
 *   {
 *     module: "Evaluations",
 *     businessClasses: ["EvaluationsManager", "EvaluationsInfo", ...],
 *     dependents: {
 *       web: [{ fileName, filePath, directory, module }],
 *       schedulers: [{ fileName, filePath, directory }]
 *     },
 *     totals: { web: N, schedulers: N }
 *   }
 *
 * Also outputs: generated/reverse-deps/index.json — summary across all modules.
 *
 * Usage: tsx scripts/generate-reverse-deps.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENRICHED_BASE = path.join(PROJECT_ROOT, 'generated', 'ai-enriched', 'dotnet', 'per-file');
const OUT_DIR = path.join(PROJECT_ROOT, 'generated', 'reverse-deps');

interface FileEntry {
  filePath: string;
  fileName: string;
  className?: string;
  module?: string;
  businessManagersUsed?: string[];
  lineCount?: number;
}

interface DirectoryEnrichment {
  directory: string;
  layer: string;
  generatedAt: string;
  fileCount: number;
  files: FileEntry[];
}

interface DependentFile {
  fileName: string;
  filePath: string;
  directory: string;
  module?: string;
}

interface ModuleRevDeps {
  module: string;
  businessClasses: string[];
  dependents: {
    web: DependentFile[];
    schedulers: DependentFile[];
  };
  totals: { web: number; schedulers: number };
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function loadAllJsonsInDir(dir: string): Promise<(DirectoryEnrichment & { _filename: string })[]> {
  const results: (DirectoryEnrichment & { _filename: string })[] = [];
  try {
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue;
      const data = await readJson<DirectoryEnrichment>(path.join(dir, entry));
      if (data) results.push({ ...data, _filename: entry });
    }
  } catch {
    // directory doesn't exist
  }
  return results;
}

/**
 * Normalize a businessManagersUsed entry to a short class name.
 * Handles both "EvaluationsManager" (short) and
 * "MyEvaluations.Business.Evaluations.EvaluationsManager" (fully qualified).
 */
function toShortName(name: string): string {
  const parts = name.split('.');
  return parts[parts.length - 1];
}

async function main(): Promise<void> {
  console.log('=== Generate Reverse Dependencies ===\n');

  await fs.mkdir(OUT_DIR, { recursive: true });

  // Step 1: Load all business module JSONs → build class → module map
  const bizDir = path.join(ENRICHED_BASE, 'business');
  const bizJsons = await loadAllJsonsInDir(bizDir);

  // Map: short class name → module name (e.g., "Evaluations")
  const classToModule = new Map<string, string>();
  // Map: module name → list of all classes in that module
  const moduleToClasses = new Map<string, string[]>();

  for (const biz of bizJsons) {
    // Use the JSON filename as the canonical module name (e.g., "Evaluations.json" → "Evaluations")
    // This is more reliable than the directory field which has inconsistent prefixes.
    const cleanModule = biz._filename.replace(/\.json$/, '');

    const classes: string[] = [];
    for (const file of biz.files || []) {
      if (file.className) {
        classToModule.set(file.className, cleanModule);
        classes.push(file.className);
      }
      if (file.fileName) {
        // Also map by file name without extension
        const baseName = file.fileName.replace(/\.cs$/, '');
        if (!classToModule.has(baseName)) {
          classToModule.set(baseName, cleanModule);
        }
      }
    }
    moduleToClasses.set(cleanModule, classes);
  }

  console.log(`Loaded ${classToModule.size} classes across ${moduleToClasses.size} business modules`);

  // Step 2: Load web enrichment JSONs → collect dependents
  const webDir = path.join(ENRICHED_BASE, 'web');
  const webJsons = await loadAllJsonsInDir(webDir);

  // module → web files that use it
  const webDependents = new Map<string, DependentFile[]>();

  for (const webJson of webJsons) {
    for (const file of webJson.files || []) {
      for (const rawManager of file.businessManagersUsed || []) {
        const shortName = toShortName(rawManager);
        const moduleName = classToModule.get(shortName);
        if (!moduleName) continue;

        if (!webDependents.has(moduleName)) webDependents.set(moduleName, []);
        const existing = webDependents.get(moduleName)!;
        // Deduplicate by filePath
        if (!existing.some((e) => e.filePath === file.filePath)) {
          existing.push({
            fileName: file.fileName,
            filePath: file.filePath,
            directory: webJson.directory,
            module: file.module,
          });
        }
      }
    }
  }

  // Step 3: Load scheduler enrichment JSON → collect dependents
  const schedDir = path.join(ENRICHED_BASE, 'schedulers');
  const schedJsons = await loadAllJsonsInDir(schedDir);
  const schedDependents = new Map<string, DependentFile[]>();

  for (const schedJson of schedJsons) {
    for (const file of schedJson.files || []) {
      for (const rawManager of file.businessManagersUsed || []) {
        const shortName = toShortName(rawManager);
        const moduleName = classToModule.get(shortName);
        if (!moduleName) continue;

        if (!schedDependents.has(moduleName)) schedDependents.set(moduleName, []);
        const existing = schedDependents.get(moduleName)!;
        if (!existing.some((e) => e.filePath === file.filePath)) {
          existing.push({
            fileName: file.fileName,
            filePath: file.filePath,
            directory: schedJson.directory,
          });
        }
      }
    }
  }

  // Step 4: Write per-module output files
  const indexEntries: { module: string; web: number; schedulers: number }[] = [];

  for (const [moduleName, classes] of moduleToClasses.entries()) {
    const web = webDependents.get(moduleName) || [];
    const schedulers = schedDependents.get(moduleName) || [];

    const output: ModuleRevDeps = {
      module: moduleName,
      businessClasses: classes,
      dependents: { web, schedulers },
      totals: { web: web.length, schedulers: schedulers.length },
    };

    const outFile = path.join(OUT_DIR, `${moduleName}.json`);
    await fs.writeFile(outFile, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`  ${moduleName}: ${web.length} web dependents, ${schedulers.length} scheduler dependents`);
    indexEntries.push({ module: moduleName, web: web.length, schedulers: schedulers.length });
  }

  // Step 5: Write index
  indexEntries.sort((a, b) => (b.web + b.schedulers) - (a.web + a.schedulers));
  await fs.writeFile(
    path.join(OUT_DIR, 'index.json'),
    JSON.stringify(indexEntries, null, 2),
    'utf-8',
  );

  console.log(`\n✓ Written ${indexEntries.length} module files + index to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
