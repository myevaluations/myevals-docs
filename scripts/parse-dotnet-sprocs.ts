/**
 * parse-dotnet-sprocs.ts
 *
 * Extract stored procedure references from the .NET backend repo.
 * Scans DataAccess and Business projects for SP call patterns and maps
 * each stored procedure to the class/method that calls it.
 *
 * Output: generated/dotnet-metadata/stored-procedures.json
 *
 * Usage: tsx scripts/parse-dotnet-sprocs.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DOTNET_REPO = path.join(PROJECT_ROOT, '.repos', 'myevals-dotnet-backend');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'generated', 'dotnet-metadata');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SprocReference {
  procedureName: string;
  callingClass: string;
  callingMethod: string;
  matchPattern: string;
  filePath: string;
  projectName: string;
  lineNumber: number;
}

interface SprocSummary {
  procedureName: string;
  callCount: number;
  calledBy: Array<{
    className: string;
    methodName: string;
    filePath: string;
  }>;
}

interface SprocCatalog {
  parsedAt: string;
  totalUniqueProcedures: number;
  totalReferences: number;
  byProject: Record<string, number>;
  byPrefix: Record<string, number>;
  procedures: SprocSummary[];
  allReferences: SprocReference[];
}

// ---------------------------------------------------------------------------
// Stored procedure detection patterns
// ---------------------------------------------------------------------------

interface SprocPattern {
  name: string;
  regex: RegExp;
  extractName: (match: RegExpExecArray) => string;
}

const SPROC_PATTERNS: SprocPattern[] = [
  {
    // "sp_DoSomething" or "usp_DoSomething" or 'sp_DoSomething'
    name: 'string-literal-sp',
    regex: /["']((?:sp_|usp_|dbo\.sp_|dbo\.usp_)[\w.]+)["']/gi,
    extractName: (match) => match[1].replace(/^dbo\./, ''),
  },
  {
    // CommandText = "StoredProcedureName"
    name: 'command-text-assignment',
    regex: /CommandText\s*=\s*["'](\w+)["']/gi,
    extractName: (match) => match[1],
  },
  {
    // .CommandType = CommandType.StoredProcedure followed by .CommandText = "name"
    name: 'command-type-sp',
    regex: /CommandType\.StoredProcedure[\s\S]{0,200}?CommandText\s*=\s*["'](\w+)["']/gi,
    extractName: (match) => match[1],
  },
  {
    // SqlCommand("sp_name", ...) or new SqlCommand("sp_name")
    name: 'sql-command-constructor',
    regex: /new\s+SqlCommand\s*\(\s*["']([\w.]+)["']/gi,
    extractName: (match) => match[1],
  },
  {
    // ExecuteStoredProcedure("name") or RunStoredProc("name")
    name: 'execute-sp-method',
    regex: /(?:Execute|Run|Call)(?:Stored)?(?:Proc(?:edure)?|SP)\s*(?:<[^>]*>)?\s*\(\s*["']([\w.]+)["']/gi,
    extractName: (match) => match[1],
  },
  {
    // "EXEC sp_name" or "EXECUTE sp_name"
    name: 'exec-statement',
    regex: /(?:EXEC|EXECUTE)\s+([\w.]+)/gi,
    extractName: (match) => match[1],
  },
  {
    // StoredProcedureName = "name" (property assignment)
    name: 'sp-property',
    regex: /(?:Stored)?Proc(?:edure)?(?:Name)?\s*=\s*["']((?:sp_|usp_)[\w.]+)["']/gi,
    extractName: (match) => match[1],
  },
  {
    // AddCommand("sp_name") or AddStoredProc("sp_name")
    name: 'add-command',
    regex: /(?:Add(?:Stored)?(?:Proc(?:edure)?|Command|SP))\s*\(\s*["']([\w.]+)["']/gi,
    extractName: (match) => match[1],
  },
];

// Common system stored procedures to exclude (SQL Server built-ins)
const SYSTEM_SPROCS = new Set([
  'sp_executesql',
  'sp_xml_preparedocument',
  'sp_xml_removedocument',
  'sp_helptext',
  'sp_columns',
  'sp_tables',
  'sp_stored_procedures',
  'sp_depends',
  'sp_help',
  'sp_who',
  'sp_lock',
  'sp_configure',
  'sp_addextendedproperty',
  'sp_updateextendedproperty',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectCsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['bin', 'obj', 'packages', 'node_modules', '.git'].includes(entry.name)) continue;
        files.push(...(await collectCsFiles(fullPath)));
      } else if (entry.name.endsWith('.cs')) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory may not exist
  }
  return files;
}

/**
 * Determine which class and method a match at a given position belongs to.
 */
function findEnclosingContext(
  source: string,
  matchIndex: number
): { className: string; methodName: string } {
  // Get the text before the match
  const before = source.substring(0, matchIndex);

  // Find the nearest class declaration
  let className = 'Unknown';
  const classMatches = [...before.matchAll(/class\s+(\w+)/g)];
  if (classMatches.length > 0) {
    className = classMatches[classMatches.length - 1][1];
  }

  // Find the nearest method declaration
  let methodName = 'Unknown';
  const methodMatches = [
    ...before.matchAll(
      /(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?(?:override\s+)?(?:virtual\s+)?[\w.<>\[\],\s]+?\s+(\w+)\s*\([^)]*\)\s*\{/g
    ),
  ];
  if (methodMatches.length > 0) {
    const lastMethod = methodMatches[methodMatches.length - 1][1];
    if (!['if', 'while', 'for', 'switch', 'catch', 'using'].includes(lastMethod)) {
      methodName = lastMethod;
    }
  }

  return { className, methodName };
}

/**
 * Get the line number for a given character offset in the source.
 */
function getLineNumber(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Parse .NET Stored Procedure References ===\n');

  if (!(await fileExists(DOTNET_REPO))) {
    console.warn('Warning: dotnet-backend repo not found. Run "npm run sync-repos" first.');
    return;
  }

  // Find DataAccess.* and Business.* directories
  const repoEntries = await fs.readdir(DOTNET_REPO, { withFileTypes: true });
  const dirsToScan: string[] = [];

  for (const entry of repoEntries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const name = entry.name;

    if (
      name.startsWith('DataAccess.') ||
      name.startsWith('Business.') ||
      name.startsWith('Data.') ||
      name.toLowerCase().includes('dal') ||
      name.toLowerCase().includes('repository')
    ) {
      dirsToScan.push(path.join(DOTNET_REPO, name));
    }

    // Also check one level deeper
    try {
      const subEntries = await fs.readdir(path.join(DOTNET_REPO, name), { withFileTypes: true });
      for (const sub of subEntries) {
        if (!sub.isDirectory()) continue;
        if (
          sub.name.startsWith('DataAccess.') ||
          sub.name.startsWith('Business.') ||
          sub.name.startsWith('Data.')
        ) {
          dirsToScan.push(path.join(DOTNET_REPO, name, sub.name));
        }
      }
    } catch {
      // Skip
    }
  }

  console.log(`Scanning ${dirsToScan.length} project directories for stored procedure references\n`);

  const allReferences: SprocReference[] = [];
  const projectCounts: Record<string, number> = {};

  for (const dir of dirsToScan) {
    const projectName = path.relative(DOTNET_REPO, dir);
    console.log(`  Scanning: ${projectName}`);

    const csFiles = await collectCsFiles(dir);
    let projectRefCount = 0;

    for (const csFile of csFiles) {
      try {
        const source = await fs.readFile(csFile, 'utf-8');
        const relativePath = path.relative(DOTNET_REPO, csFile);

        for (const pattern of SPROC_PATTERNS) {
          // Reset regex lastIndex for each file
          pattern.regex.lastIndex = 0;

          let match: RegExpExecArray | null;
          while ((match = pattern.regex.exec(source)) !== null) {
            const procedureName = pattern.extractName(match);

            // Skip system stored procedures
            if (SYSTEM_SPROCS.has(procedureName.toLowerCase())) continue;
            // Skip very short names (likely false positives)
            if (procedureName.length < 3) continue;

            const { className, methodName } = findEnclosingContext(source, match.index);
            const lineNumber = getLineNumber(source, match.index);

            allReferences.push({
              procedureName,
              callingClass: className,
              callingMethod: methodName,
              matchPattern: pattern.name,
              filePath: relativePath,
              projectName,
              lineNumber,
            });

            projectRefCount++;
          }
        }
      } catch (err) {
        console.warn(`    Warning: Failed to parse ${csFile}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (projectRefCount > 0) {
      projectCounts[projectName] = projectRefCount;
      console.log(`    Found ${projectRefCount} references`);
    }
  }

  // Aggregate by procedure name
  const procMap = new Map<string, SprocSummary>();
  for (const ref of allReferences) {
    let summary = procMap.get(ref.procedureName);
    if (!summary) {
      summary = {
        procedureName: ref.procedureName,
        callCount: 0,
        calledBy: [],
      };
      procMap.set(ref.procedureName, summary);
    }
    summary.callCount++;

    // Avoid duplicate calledBy entries
    const existingCaller = summary.calledBy.find(
      (c) => c.className === ref.callingClass && c.methodName === ref.callingMethod
    );
    if (!existingCaller) {
      summary.calledBy.push({
        className: ref.callingClass,
        methodName: ref.callingMethod,
        filePath: ref.filePath,
      });
    }
  }

  // Count by prefix
  const byPrefix: Record<string, number> = {};
  for (const [name] of procMap) {
    const prefix = name.match(/^((?:dbo\.)?(?:sp_|usp_|fn_)?)/i)?.[1] || 'other';
    byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
  }

  // Sort procedures by call count (descending)
  const procedures = Array.from(procMap.values()).sort((a, b) => b.callCount - a.callCount);

  const catalog: SprocCatalog = {
    parsedAt: new Date().toISOString(),
    totalUniqueProcedures: procedures.length,
    totalReferences: allReferences.length,
    byProject: projectCounts,
    byPrefix,
    procedures,
    allReferences,
  };

  // Write output
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, 'stored-procedures.json');
  await fs.writeFile(outputPath, JSON.stringify(catalog, null, 2), 'utf-8');

  console.log(`\nResults:`);
  console.log(`  Unique stored procedures: ${procedures.length}`);
  console.log(`  Total references: ${allReferences.length}`);
  console.log(`  Top 10 most referenced:`);
  for (const proc of procedures.slice(0, 10)) {
    console.log(`    ${proc.procedureName} (${proc.callCount} references)`);
  }
  console.log(`  Output: ${outputPath}`);

  console.log('\n=== Stored procedure parsing complete ===');
}

main().catch((err) => {
  console.error('Fatal error parsing stored procedures:', err);
  process.exit(1);
});
