/**
 * parse-dotnet-all-files.ts
 *
 * Scans .cs files under Schedulers/ and supporting project directories
 * of the .NET backend repo. Extracts class metadata for each file.
 *
 * Outputs:
 *   generated/dotnet-metadata/schedulers-files/{ProjectName}.json
 *   generated/dotnet-metadata/supporting/{ProjectName}.json
 *
 * Usage: tsx scripts/parse-dotnet-all-files.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DOTNET_REPO = path.join(PROJECT_ROOT, '.repos', 'myevals-dotnet-backend');
const SCHEDULERS_DIR = path.join(DOTNET_REPO, 'Schedulers');
const SCHED_OUTPUT_DIR = path.join(PROJECT_ROOT, 'generated', 'dotnet-metadata', 'schedulers-files');
const SUPPORT_OUTPUT_DIR = path.join(PROJECT_ROOT, 'generated', 'dotnet-metadata', 'supporting');

// Supporting projects (non-Business, non-Web, non-Scheduler)
const SUPPORTING_PROJECTS = [
  'MyEvaluations.DataAccess.SQL',
  'MyEvaluations.Logging',
  'MyEvaluations.Web',
  'SAMLServiceProvider',
  'FusionChartLibrary',
  'GoogleConsole',
  'EssentialActivities',
  'FileUploadService',
  'MyEvalsExportImportService',
  'MyEvaluations.AmionScheduleUpdater',
  'TangierScheduleUpdater',
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MethodInfo {
  name: string;
  returnType: string;
  visibility: string;
  parameters: string[];
  isStatic: boolean;
  isAsync: boolean;
}

interface FileInfo {
  fileName: string;
  filePath: string;          // Relative path from repo root
  lineCount: number;
  className: string | null;
  namespace: string;
  baseClass: string | null;
  interfaces: string[];
  usingStatements: string[];
  businessModuleRefs: string[];
  methods: MethodInfo[];
  storedProcedureCalls: string[];
}

interface ProjectFileData {
  projectName: string;
  layer: 'scheduler' | 'supporting';
  projectPath: string;        // Relative path from repo root
  parsedAt: string;
  fileCount: number;
  totalLines: number;
  files: FileInfo[];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function extractStoredProcedures(code: string): string[] {
  const sprocs = new Set<string>();

  const spRegex = /["']((?:sp_|usp_|dbo\.sp_|dbo\.usp_)\w+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = spRegex.exec(code)) !== null) {
    sprocs.add(match[1]);
  }

  const cmdTextRegex = /CommandText\s*=\s*["'](\w+)["']/gi;
  while ((match = cmdTextRegex.exec(code)) !== null) {
    sprocs.add(match[1]);
  }

  const spTypeRegex = /StoredProcedure[^"]*["'](\w+)["']/gi;
  while ((match = spTypeRegex.exec(code)) !== null) {
    sprocs.add(match[1]);
  }

  return Array.from(sprocs);
}

function extractBraceBlock(source: string, startIndex: number): string {
  let depth = 0;
  let i = startIndex;
  const start = i;

  while (i < source.length) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.substring(start, i + 1);
    }
    i++;
  }
  return source.substring(start);
}

function parseCsFile(source: string, filePath: string, fileName: string): FileInfo {
  const lines = source.split('\n');
  const lineCount = lines.length;

  // Extract using statements
  const usingStatements: string[] = [];
  const businessModuleRefs: string[] = [];
  const usingRegex = /^using\s+([\w.]+)\s*;/gm;
  let match: RegExpExecArray | null;
  while ((match = usingRegex.exec(source)) !== null) {
    usingStatements.push(match[1]);
    const bizMatch = match[1].match(/MyEvaluations\.Business\.(\w+)/);
    if (bizMatch) {
      businessModuleRefs.push(bizMatch[1]);
    }
  }

  // Extract namespace
  const nsMatch = source.match(/namespace\s+([\w.]+)/);
  const namespace = nsMatch ? nsMatch[1] : '';

  // Extract class declaration
  let className: string | null = null;
  let baseClass: string | null = null;
  const interfaces: string[] = [];

  const classRegex = /(?:(public|private|protected|internal)\s+)?(?:(abstract|static|sealed|partial)\s+)*class\s+(\w+)(?:<[^>]+>)?(?:\s*:\s*([^\{]+))?\s*\{/g;
  const classMatch = classRegex.exec(source);
  if (classMatch) {
    className = classMatch[3];
    const inheritance = classMatch[4] || '';
    if (inheritance) {
      const parts = inheritance.split(',').map((s) => s.trim());
      for (const part of parts) {
        const typeName = part.replace(/<[^>]*>/g, '').trim();
        if (!typeName) continue;
        if (typeName.startsWith('I') && typeName.length > 1 && typeName[1] === typeName[1].toUpperCase()) {
          interfaces.push(typeName);
        } else if (!baseClass) {
          baseClass = typeName;
        } else {
          interfaces.push(typeName);
        }
      }
    }
  }

  // Extract methods
  const methods: MethodInfo[] = [];
  if (classMatch) {
    const classStart = classMatch.index + classMatch[0].length - 1;
    const classBody = extractBraceBlock(source, classStart);

    const methodRegex = /(?:(public|private|protected|internal)\s+)?(?:(static|async|virtual|override|abstract)\s+)*(?:([\w.<>\[\]?,\s]+?)\s+)(\w+)\s*\(([^)]*)\)/g;
    let methodMatch: RegExpExecArray | null;
    while ((methodMatch = methodRegex.exec(classBody)) !== null) {
      const mVis = methodMatch[1] || 'private';
      const mMods = methodMatch[2] || '';
      const returnType = methodMatch[3] || 'void';
      const methodName = methodMatch[4];
      const params = methodMatch[5]
        ? methodMatch[5].split(',').map((p) => p.trim()).filter(Boolean)
        : [];

      if (methodName === className || ['if', 'while', 'for', 'switch', 'catch', 'using', 'return', 'new', 'throw'].includes(methodName)) {
        continue;
      }

      methods.push({
        name: methodName,
        returnType,
        visibility: mVis,
        parameters: params,
        isStatic: mMods.includes('static'),
        isAsync: mMods.includes('async'),
      });
    }
  }

  const storedProcedureCalls = extractStoredProcedures(source);

  return {
    fileName,
    filePath,
    lineCount,
    className,
    namespace,
    baseClass,
    interfaces,
    usingStatements,
    businessModuleRefs: [...new Set(businessModuleRefs)],
    methods,
    storedProcedureCalls,
  };
}

async function collectCsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['bin', 'obj', 'packages', 'node_modules', '.git'].includes(entry.name)) continue;
        const subFiles = await collectCsFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.name.endsWith('.cs')) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory may not exist
  }
  return files;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function processProjectDir(
  projectDir: string,
  projectName: string,
  layer: 'scheduler' | 'supporting',
  outputDir: string,
): Promise<{ files: number; lines: number }> {
  const csFiles = await collectCsFiles(projectDir);
  if (csFiles.length === 0) return { files: 0, lines: 0 };

  const files: FileInfo[] = [];
  for (const csFile of csFiles) {
    try {
      const source = await fs.readFile(csFile, 'utf-8');
      const relativePath = path.relative(DOTNET_REPO, csFile);
      const fileName = path.basename(csFile);
      files.push(parseCsFile(source, relativePath, fileName));
    } catch (err) {
      console.warn(`  Warning: Failed to parse ${csFile}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const totalLines = files.reduce((sum, f) => sum + f.lineCount, 0);
  const relativeProjPath = path.relative(DOTNET_REPO, projectDir);

  const projData: ProjectFileData = {
    projectName,
    layer,
    projectPath: relativeProjPath,
    parsedAt: new Date().toISOString(),
    fileCount: files.length,
    totalLines,
    files,
  };

  // Sanitize project name for filename (replace dots and spaces with hyphens)
  const safeFileName = projectName.replace(/[\s.]+/g, '-');
  const outputPath = path.join(outputDir, `${safeFileName}.json`);
  await fs.writeFile(outputPath, JSON.stringify(projData, null, 2), 'utf-8');

  return { files: files.length, lines: totalLines };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Parse .NET All Files (Schedulers + Supporting) ===\n');

  if (!(await fileExists(DOTNET_REPO))) {
    console.warn('Warning: dotnet-backend repo not found. Run "npm run sync-repos" first.');
    return;
  }

  await fs.mkdir(SCHED_OUTPUT_DIR, { recursive: true });
  await fs.mkdir(SUPPORT_OUTPUT_DIR, { recursive: true });

  let totalFiles = 0;
  let totalLines = 0;

  // --- Schedulers ---
  console.log('--- Schedulers ---\n');

  if (await fileExists(SCHEDULERS_DIR)) {
    const schedEntries = await fs.readdir(SCHEDULERS_DIR, { withFileTypes: true });
    const schedDirs = schedEntries.filter((e) => e.isDirectory()).map((e) => e.name);

    for (const schedDir of schedDirs) {
      const schedPath = path.join(SCHEDULERS_DIR, schedDir);
      const result = await processProjectDir(schedPath, schedDir, 'scheduler', SCHED_OUTPUT_DIR);
      if (result.files > 0) {
        console.log(`  ${schedDir}: ${result.files} files, ${result.lines} lines`);
        totalFiles += result.files;
        totalLines += result.lines;
      }
    }
  } else {
    console.warn('  Schedulers/ directory not found');
  }

  // Also check for top-level scheduler-like projects
  const topLevelSchedulers = [
    'MyEvaluations.AmionScheduleUpdater',
    'TangierScheduleUpdater',
  ];
  for (const projName of topLevelSchedulers) {
    const projPath = path.join(DOTNET_REPO, projName);
    if (await fileExists(projPath)) {
      const result = await processProjectDir(projPath, projName, 'scheduler', SCHED_OUTPUT_DIR);
      if (result.files > 0) {
        console.log(`  ${projName}: ${result.files} files, ${result.lines} lines`);
        totalFiles += result.files;
        totalLines += result.lines;
      }
    }
  }

  // --- Supporting Projects ---
  console.log('\n--- Supporting Projects ---\n');

  for (const projName of SUPPORTING_PROJECTS) {
    // Skip schedule updaters already handled above
    if (projName.includes('AmionScheduleUpdater') || projName.includes('TangierScheduleUpdater')) continue;

    const projPath = path.join(DOTNET_REPO, projName);
    if (await fileExists(projPath)) {
      const result = await processProjectDir(projPath, projName, 'supporting', SUPPORT_OUTPUT_DIR);
      if (result.files > 0) {
        console.log(`  ${projName}: ${result.files} files, ${result.lines} lines`);
        totalFiles += result.files;
        totalLines += result.lines;
      }
    } else {
      console.warn(`  ${projName}: directory not found, skipping`);
    }
  }

  console.log(`\n=== All files parse complete: ${totalFiles} files, ${totalLines} lines ===`);
}

main().catch((err) => {
  console.error('Fatal error parsing all files:', err);
  process.exit(1);
});
