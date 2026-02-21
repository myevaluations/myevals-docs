/**
 * parse-dotnet-web-files.ts
 *
 * Scans all .cs files under the Web/ directory of the .NET backend repo,
 * grouped by subdirectory. For each file extracts:
 * - Class name, base class
 * - Using statements (to detect Business.* module references)
 * - Method signatures (Page_Load, button handlers, etc.)
 * - Stored procedure calls
 * - Line count
 *
 * Outputs per-subdirectory JSON to: generated/dotnet-metadata/web-files/{SubDirectory}.json
 *
 * Usage: tsx scripts/parse-dotnet-web-files.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DOTNET_REPO = path.join(PROJECT_ROOT, '.repos', 'myevals-dotnet-backend');
const WEB_DIR = path.join(DOTNET_REPO, 'Web');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'generated', 'dotnet-metadata', 'web-files');

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

interface WebFileInfo {
  fileName: string;
  filePath: string;          // Relative path from repo root
  lineCount: number;
  className: string | null;
  namespace: string;
  baseClass: string | null;
  interfaces: string[];
  usingStatements: string[];
  businessModuleRefs: string[];  // Business.* modules referenced via using
  methods: MethodInfo[];
  storedProcedureCalls: string[];
  fileType: 'code-behind' | 'handler' | 'user-control' | 'class' | 'other';
}

interface WebDirectoryData {
  directory: string;           // e.g. "Security", "Evaluations", "_root"
  directoryPath: string;       // e.g. "Web/Security"
  parsedAt: string;
  fileCount: number;
  totalLines: number;
  files: WebFileInfo[];
}

// ---------------------------------------------------------------------------
// Shared helpers (reused from parse-dotnet-classes.ts)
// ---------------------------------------------------------------------------

function extractStoredProcedures(code: string): string[] {
  const sprocs = new Set<string>();

  // Pattern: "sp_..." or "usp_..."
  const spRegex = /["']((?:sp_|usp_|dbo\.sp_|dbo\.usp_)\w+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = spRegex.exec(code)) !== null) {
    sprocs.add(match[1]);
  }

  // Pattern: CommandText = "..."
  const cmdTextRegex = /CommandText\s*=\s*["'](\w+)["']/gi;
  while ((match = cmdTextRegex.exec(code)) !== null) {
    sprocs.add(match[1]);
  }

  // Pattern: .StoredProcedure, "name"
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

function determineFileType(fileName: string, baseClass: string | null): WebFileInfo['fileType'] {
  if (fileName.endsWith('.ashx.cs') || fileName.endsWith('.ashx')) return 'handler';
  if (fileName.endsWith('.ascx.cs')) return 'user-control';
  if (fileName.endsWith('.aspx.cs')) return 'code-behind';
  if (baseClass && (baseClass.includes('HttpHandler') || baseClass.includes('IHttpHandler'))) return 'handler';
  if (baseClass && baseClass.includes('UserControl')) return 'user-control';
  if (baseClass && (baseClass.includes('BasePage') || baseClass.includes('Page'))) return 'code-behind';
  return 'class';
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseWebFile(source: string, filePath: string, fileName: string): WebFileInfo {
  const lines = source.split('\n');
  const lineCount = lines.length;

  // Extract using statements
  const usingStatements: string[] = [];
  const businessModuleRefs: string[] = [];
  const usingRegex = /^using\s+([\w.]+)\s*;/gm;
  let match: RegExpExecArray | null;
  while ((match = usingRegex.exec(source)) !== null) {
    usingStatements.push(match[1]);
    // Detect Business.* references
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

  // Extract methods from class body
  const methods: MethodInfo[] = [];
  // Find class body start
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

      // Skip false positives
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

  // Detect stored procedure calls
  const storedProcedureCalls = extractStoredProcedures(source);

  const fileType = determineFileType(fileName, baseClass);

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
    fileType,
  };
}

// ---------------------------------------------------------------------------
// File collection
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Parse .NET Web Files ===\n');

  if (!(await fileExists(WEB_DIR))) {
    console.warn('Warning: Web/ directory not found. Run "npm run sync-repos" first.');
    return;
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Discover all subdirectories under Web/
  const entries = await fs.readdir(WEB_DIR, { withFileTypes: true });

  // Directories that don't contain meaningful .cs files
  const skipDirs = new Set([
    'bin', 'obj', 'App_Browsers', 'App_Data', 'App_GlobalResources',
    'Css', 'DeptImages', 'Documents', 'Images', 'Include', 'JS',
    'Log', 'Logfiles', 'NewRelic', 'Reference DLL', 'References',
    'Scripts', 'Schedulers', 'QuestionsImporting', 'CustomError',
  ]);

  const subDirs = entries
    .filter((e) => e.isDirectory() && !skipDirs.has(e.name))
    .map((e) => e.name);

  let totalFiles = 0;
  let totalLines = 0;

  // Process each subdirectory
  for (const subDir of subDirs) {
    const dirPath = path.join(WEB_DIR, subDir);
    const csFiles = await collectCsFiles(dirPath);

    if (csFiles.length === 0) continue;

    console.log(`Processing: Web/${subDir} (${csFiles.length} .cs files)`);

    const files: WebFileInfo[] = [];
    for (const csFile of csFiles) {
      try {
        const source = await fs.readFile(csFile, 'utf-8');
        const relativePath = path.relative(DOTNET_REPO, csFile);
        const fileName = path.basename(csFile);
        files.push(parseWebFile(source, relativePath, fileName));
      } catch (err) {
        console.warn(`  Warning: Failed to parse ${csFile}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const dirTotalLines = files.reduce((sum, f) => sum + f.lineCount, 0);

    const dirData: WebDirectoryData = {
      directory: subDir,
      directoryPath: `Web/${subDir}`,
      parsedAt: new Date().toISOString(),
      fileCount: files.length,
      totalLines: dirTotalLines,
      files,
    };

    const outputPath = path.join(OUTPUT_DIR, `${subDir}.json`);
    await fs.writeFile(outputPath, JSON.stringify(dirData, null, 2), 'utf-8');
    console.log(`  → ${files.length} files, ${dirTotalLines} lines → ${subDir}.json`);

    totalFiles += files.length;
    totalLines += dirTotalLines;
  }

  // Process root-level .cs files (directly in Web/)
  const rootCsFiles = entries
    .filter((e) => !e.isDirectory() && e.name.endsWith('.cs'))
    .map((e) => path.join(WEB_DIR, e.name));

  if (rootCsFiles.length > 0) {
    console.log(`Processing: Web/ root (${rootCsFiles.length} .cs files)`);
    const files: WebFileInfo[] = [];
    for (const csFile of rootCsFiles) {
      try {
        const source = await fs.readFile(csFile, 'utf-8');
        const relativePath = path.relative(DOTNET_REPO, csFile);
        const fileName = path.basename(csFile);
        files.push(parseWebFile(source, relativePath, fileName));
      } catch (err) {
        console.warn(`  Warning: Failed to parse ${csFile}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const dirTotalLines = files.reduce((sum, f) => sum + f.lineCount, 0);

    const dirData: WebDirectoryData = {
      directory: '_root',
      directoryPath: 'Web',
      parsedAt: new Date().toISOString(),
      fileCount: files.length,
      totalLines: dirTotalLines,
      files,
    };

    const outputPath = path.join(OUTPUT_DIR, '_root.json');
    await fs.writeFile(outputPath, JSON.stringify(dirData, null, 2), 'utf-8');
    console.log(`  → ${files.length} files, ${dirTotalLines} lines → _root.json`);

    totalFiles += files.length;
    totalLines += dirTotalLines;
  }

  console.log(`\n=== Web files parse complete: ${totalFiles} files, ${totalLines} lines across ${subDirs.length + 1} groups ===`);
}

main().catch((err) => {
  console.error('Fatal error parsing web files:', err);
  process.exit(1);
});
