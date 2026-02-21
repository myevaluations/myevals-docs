/**
 * merge-enrichment-batches.ts
 *
 * Merges per-directory batch JSON files into final enrichment outputs.
 * For directories that were split into batches (e.g., Security-batch1.json,
 * Security-batch2.json), merges them into a single Security.json.
 *
 * Also generates:
 *   - enrichment-index.json (master index of all enriched files)
 *   - cache-manifest.json (SHA-based cache for incremental re-runs)
 *
 * Usage: tsx scripts/merge-enrichment-batches.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENRICHED_BASE = path.join(PROJECT_ROOT, 'generated', 'ai-enriched', 'dotnet', 'per-file');

interface FileEnrichment {
  filePath: string;
  fileName: string;
  fileType: string;
  className: string;
  inheritsFrom: string | null;
  module: string;
  summary: string;
  businessPurpose: string;
  keyMethods: string[];
  storedProcedures: string[];
  businessManagersUsed: string[];
  migrationRelevance: string;
  migrationNote?: string;
  complexity: string;
  lineCount: number;
}

interface DirectoryEnrichment {
  directory: string;
  layer: string;
  generatedAt: string;
  fileCount: number;
  batchInfo?: string;
  files: FileEnrichment[];
  directoryOverview: string;
  keyWorkflows: string[];
}

interface IndexEntry {
  filePath: string;
  fileName: string;
  directory: string;
  layer: string;
  fileType: string;
  className: string;
  complexity: string;
  migrationRelevance: string;
  lineCount: number;
}

interface EnrichmentIndex {
  generatedAt: string;
  totalFiles: number;
  totalDirectories: number;
  byLayer: Record<string, number>;
  byComplexity: Record<string, number>;
  byMigrationRelevance: Record<string, number>;
  byFileType: Record<string, number>;
  totalLines: number;
  files: IndexEntry[];
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function mergeLayerBatches(layerDir: string, layerName: string): Promise<DirectoryEnrichment[]> {
  if (!(await fileExists(layerDir))) return [];

  const entries = await fs.readdir(layerDir);
  const jsonFiles = entries.filter((f) => f.endsWith('.json'));

  // Group batch files by base directory name
  const batchGroups = new Map<string, string[]>();
  const standalone: string[] = [];

  for (const file of jsonFiles) {
    const batchMatch = file.match(/^(.+)-batch\d+\.json$/);
    if (batchMatch) {
      const baseName = batchMatch[1];
      if (!batchGroups.has(baseName)) {
        batchGroups.set(baseName, []);
      }
      batchGroups.get(baseName)!.push(file);
    } else {
      standalone.push(file);
    }
  }

  const results: DirectoryEnrichment[] = [];

  // Process batch groups - merge into single file
  for (const [baseName, batchFiles] of batchGroups) {
    console.log(`  Merging ${batchFiles.length} batches for ${baseName}...`);

    const allFiles: FileEnrichment[] = [];
    let directoryOverview = '';
    let keyWorkflows: string[] = [];
    let directory = '';
    let layer = layerName;

    // Sort batch files to ensure consistent ordering
    batchFiles.sort();

    for (const batchFile of batchFiles) {
      try {
        const content = await fs.readFile(path.join(layerDir, batchFile), 'utf-8');
        const batch: DirectoryEnrichment = JSON.parse(content);
        allFiles.push(...batch.files);
        if (batch.directoryOverview) directoryOverview = batch.directoryOverview;
        if (batch.keyWorkflows?.length) keyWorkflows = batch.keyWorkflows;
        if (batch.directory) directory = batch.directory;
        if (batch.layer) layer = batch.layer;
      } catch (err) {
        console.warn(`    Warning: Failed to parse ${batchFile}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Deduplicate by filePath
    const seen = new Set<string>();
    const uniqueFiles = allFiles.filter((f) => {
      if (seen.has(f.filePath)) return false;
      seen.add(f.filePath);
      return true;
    });

    const merged: DirectoryEnrichment = {
      directory: directory || `Web/${baseName}`,
      layer,
      generatedAt: new Date().toISOString(),
      fileCount: uniqueFiles.length,
      files: uniqueFiles,
      directoryOverview,
      keyWorkflows,
    };

    const outputPath = path.join(layerDir, `${baseName}.json`);
    await fs.writeFile(outputPath, JSON.stringify(merged, null, 2), 'utf-8');
    console.log(`    → Merged ${uniqueFiles.length} files → ${baseName}.json`);

    results.push(merged);

    // Remove batch files after merge
    for (const batchFile of batchFiles) {
      await fs.unlink(path.join(layerDir, batchFile));
    }
  }

  // Process standalone files
  for (const file of standalone) {
    try {
      const content = await fs.readFile(path.join(layerDir, file), 'utf-8');
      const data: DirectoryEnrichment = JSON.parse(content);
      results.push(data);
    } catch (err) {
      console.warn(`  Warning: Failed to parse ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return results;
}

async function main(): Promise<void> {
  console.log('=== Merge Enrichment Batches ===\n');

  const allDirectories: DirectoryEnrichment[] = [];

  // Process each layer
  for (const layer of ['web', 'schedulers', 'business', 'supporting']) {
    const layerDir = path.join(ENRICHED_BASE, layer);
    console.log(`Processing ${layer}/...`);
    const dirs = await mergeLayerBatches(layerDir, layer);
    allDirectories.push(...dirs);
    console.log(`  Found ${dirs.length} directories, ${dirs.reduce((s, d) => s + d.fileCount, 0)} total files\n`);
  }

  // Generate enrichment index
  const allFiles: IndexEntry[] = [];
  const byLayer: Record<string, number> = {};
  const byComplexity: Record<string, number> = {};
  const byMigrationRelevance: Record<string, number> = {};
  const byFileType: Record<string, number> = {};
  let totalLines = 0;

  for (const dir of allDirectories) {
    for (const file of dir.files) {
      allFiles.push({
        filePath: file.filePath,
        fileName: file.fileName,
        directory: dir.directory,
        layer: dir.layer,
        fileType: file.fileType,
        className: file.className,
        complexity: file.complexity,
        migrationRelevance: file.migrationRelevance,
        lineCount: file.lineCount,
      });

      byLayer[dir.layer] = (byLayer[dir.layer] || 0) + 1;
      byComplexity[file.complexity] = (byComplexity[file.complexity] || 0) + 1;
      byMigrationRelevance[file.migrationRelevance] = (byMigrationRelevance[file.migrationRelevance] || 0) + 1;
      byFileType[file.fileType] = (byFileType[file.fileType] || 0) + 1;
      totalLines += file.lineCount;
    }
  }

  const index: EnrichmentIndex = {
    generatedAt: new Date().toISOString(),
    totalFiles: allFiles.length,
    totalDirectories: allDirectories.length,
    byLayer,
    byComplexity,
    byMigrationRelevance,
    byFileType,
    totalLines,
    files: allFiles,
  };

  const indexPath = path.join(ENRICHED_BASE, 'enrichment-index.json');
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`Enrichment index: ${allFiles.length} files across ${allDirectories.length} directories`);
  console.log(`Total lines: ${totalLines.toLocaleString()}`);
  console.log(`Written to: ${indexPath}`);

  // Generate cache manifest (SHA of each enrichment JSON)
  const cacheManifest: Record<string, string> = {};
  for (const layer of ['web', 'schedulers', 'business', 'supporting']) {
    const layerDir = path.join(ENRICHED_BASE, layer);
    if (!(await fileExists(layerDir))) continue;
    const files = await fs.readdir(layerDir);
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const content = await fs.readFile(path.join(layerDir, file), 'utf-8');
      const sha = crypto.createHash('sha256').update(content).digest('hex').substring(0, 12);
      cacheManifest[`${layer}/${file}`] = sha;
    }
  }

  const cachePath = path.join(ENRICHED_BASE, 'cache-manifest.json');
  await fs.writeFile(cachePath, JSON.stringify(cacheManifest, null, 2), 'utf-8');
  console.log(`Cache manifest: ${Object.keys(cacheManifest).length} files`);

  console.log('\n=== Merge complete ===');
}

main().catch((err) => {
  console.error('Fatal error merging batches:', err);
  process.exit(1);
});
