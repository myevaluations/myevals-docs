/**
 * parse-dotnet-schedulers.ts
 *
 * Catalogs schedulers and Windows Services from the .NET backend repo.
 * Extracts scheduler metadata including names, descriptions, schedules, and domain categories.
 *
 * Output: generated/dotnet-metadata/schedulers.json
 *
 * Usage: tsx scripts/parse-dotnet-schedulers.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DOTNET_REPO = path.join(PROJECT_ROOT, '.repos', 'myevals-dotnet-backend');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'generated', 'dotnet-metadata');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SchedulerDomain =
  | 'Evaluation'
  | 'Clinical'
  | 'DutyHours'
  | 'Learning'
  | 'License'
  | 'Communication'
  | 'DataIntegration'
  | 'Admin'
  | 'Conference'
  | 'Unknown';

interface SchedulerInfo {
  name: string;
  className: string;
  description: string;
  schedulePattern: string;
  domain: SchedulerDomain;
  filePath: string;
  projectName: string;
  serviceType: 'WindowsService' | 'Scheduler' | 'BackgroundJob' | 'Unknown';
  methods: string[];
}

interface SchedulerCatalog {
  parsedAt: string;
  totalSchedulers: number;
  byDomain: Record<string, number>;
  byServiceType: Record<string, number>;
  schedulers: SchedulerInfo[];
}

// ---------------------------------------------------------------------------
// Domain classification
// ---------------------------------------------------------------------------

const DOMAIN_KEYWORDS: Record<SchedulerDomain, string[]> = {
  Evaluation: ['evaluation', 'eval', 'assessment', 'survey', 'form', 'questionnaire', 'review', 'feedback', 'rating'],
  Clinical: ['clinical', 'rotation', 'schedule', 'patient', 'procedure', 'case', 'log', 'encounter'],
  DutyHours: ['duty', 'hour', 'dutyhour', 'work', 'shift', 'overtime', 'violation', 'acgme'],
  Learning: ['learning', 'curriculum', 'goal', 'milestone', 'competency', 'objective', 'education', 'course'],
  License: ['license', 'certification', 'credential', 'expir', 'renewal', 'compliance', 'training'],
  Communication: ['email', 'notification', 'remind', 'alert', 'message', 'sms', 'mail', 'send', 'digest'],
  DataIntegration: ['import', 'export', 'sync', 'integration', 'data', 'transfer', 'migrate', 'etl', 'feed', 'api'],
  Admin: ['admin', 'user', 'account', 'permission', 'role', 'clean', 'purge', 'maintenance', 'archive', 'backup'],
  Conference: ['conference', 'meeting', 'attendance', 'session', 'lecture', 'grand round', 'presentation'],
  Unknown: [],
};

function classifyDomain(name: string, description: string, filePath: string): SchedulerDomain {
  const searchText = `${name} ${description} ${filePath}`.toLowerCase();

  let bestDomain: SchedulerDomain = 'Unknown';
  let bestScore = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (domain === 'Unknown') continue;
    let score = 0;
    for (const keyword of keywords) {
      if (searchText.includes(keyword)) {
        score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain as SchedulerDomain;
    }
  }

  return bestDomain;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Extract the description from XML comments or Description attributes above or near a class.
 */
function extractDescription(source: string, className: string): string {
  // Look for XML summary comment before the class
  const summaryRegex = new RegExp(
    `///\\s*<summary>\\s*\\n([\\s\\S]*?)///\\s*<\\/summary>[\\s\\S]*?class\\s+${className}`,
    'i'
  );
  const summaryMatch = source.match(summaryRegex);
  if (summaryMatch) {
    return summaryMatch[1]
      .split('\n')
      .map((line) => line.replace(/^\s*\/\/\/\s*/, '').trim())
      .filter(Boolean)
      .join(' ');
  }

  // Look for [Description("...")] attribute
  const descAttrRegex = new RegExp(
    `\\[Description\\("([^"]+)"\\)\\][\\s\\S]*?class\\s+${className}`,
    'i'
  );
  const descMatch = source.match(descAttrRegex);
  if (descMatch) {
    return descMatch[1];
  }

  // Look for [ServiceName("...")] or [DisplayName("...")] attribute
  const nameAttrRegex = new RegExp(
    `\\[(?:ServiceName|DisplayName)\\("([^"]+)"\\)\\][\\s\\S]*?class\\s+${className}`,
    'i'
  );
  const nameMatch = source.match(nameAttrRegex);
  if (nameMatch) {
    return nameMatch[1];
  }

  return '';
}

/**
 * Extract schedule patterns (cron, Timer intervals, etc.) from class source.
 */
function extractSchedulePattern(source: string): string {
  // Cron expression in attribute or string
  const cronRegex = /["'](\d+\s+\d+\s+[\d*]+\s+[\d*]+\s+[\d*]+(?:\s+[\d*]+)?)["']/;
  const cronMatch = source.match(cronRegex);
  if (cronMatch) return `Cron: ${cronMatch[1]}`;

  // Timer interval in milliseconds
  const timerRegex = /(?:Timer|Interval)\s*(?:=|\.Interval\s*=)\s*(\d+)/i;
  const timerMatch = source.match(timerRegex);
  if (timerMatch) {
    const ms = parseInt(timerMatch[1], 10);
    if (ms >= 86400000) return `Every ${Math.round(ms / 86400000)} day(s)`;
    if (ms >= 3600000) return `Every ${Math.round(ms / 3600000)} hour(s)`;
    if (ms >= 60000) return `Every ${Math.round(ms / 60000)} minute(s)`;
    return `Every ${ms}ms`;
  }

  // TimeSpan
  const timeSpanRegex = /TimeSpan\.From(\w+)\((\d+)\)/;
  const tsMatch = source.match(timeSpanRegex);
  if (tsMatch) return `Every ${tsMatch[2]} ${tsMatch[1].toLowerCase()}`;

  // Schedule string
  const schedRegex = /[Ss]chedule\s*=\s*["']([^"']+)["']/;
  const schedMatch = source.match(schedRegex);
  if (schedMatch) return schedMatch[1];

  return 'Unknown';
}

/**
 * Detect service type from class source and inheritance.
 */
function detectServiceType(source: string): SchedulerInfo['serviceType'] {
  if (/:\s*ServiceBase/.test(source) || /ServiceInstaller/.test(source)) {
    return 'WindowsService';
  }
  if (/:\s*(?:IJob|JobBase|QuartzJob)/.test(source) || /ITrigger|IScheduler/.test(source)) {
    return 'Scheduler';
  }
  if (/BackgroundWorker|BackgroundService|IHostedService/.test(source)) {
    return 'BackgroundJob';
  }
  return 'Unknown';
}

/**
 * Extract method names from a class.
 */
function extractMethods(source: string, className: string): string[] {
  const methods: string[] = [];
  const methodRegex = /(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?(?:override\s+)?[\w.<>\[\],\s]+\s+(\w+)\s*\(/g;

  let match: RegExpExecArray | null;
  while ((match = methodRegex.exec(source)) !== null) {
    const name = match[1];
    if (name !== className && !['if', 'while', 'for', 'switch', 'catch', 'using', 'return'].includes(name)) {
      methods.push(name);
    }
  }

  return [...new Set(methods)];
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively collect .cs files from a directory.
 */
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Parse .NET Schedulers & Windows Services ===\n');

  if (!(await fileExists(DOTNET_REPO))) {
    console.warn('Warning: dotnet-backend repo not found. Run "npm run sync-repos" first.');
    return;
  }

  const schedulers: SchedulerInfo[] = [];

  // Directories likely to contain schedulers / Windows Services
  const searchPatterns = [
    'Scheduler*',
    '*Scheduler*',
    '*Service*',
    '*WindowsService*',
    '*Worker*',
    '*Job*',
    '*Timer*',
  ];

  // Get all top-level directories
  const repoEntries = await fs.readdir(DOTNET_REPO, { withFileTypes: true });
  const dirsToSearch: string[] = [];

  for (const entry of repoEntries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const name = entry.name.toLowerCase();

    // Check if directory name matches scheduler patterns
    const isSchedulerDir =
      name.includes('scheduler') ||
      name.includes('service') ||
      name.includes('worker') ||
      name.includes('job') ||
      name.includes('timer') ||
      name.includes('windows');

    if (isSchedulerDir) {
      dirsToSearch.push(path.join(DOTNET_REPO, entry.name));
    }

    // Also check subdirectories
    try {
      const subEntries = await fs.readdir(path.join(DOTNET_REPO, entry.name), { withFileTypes: true });
      for (const sub of subEntries) {
        if (!sub.isDirectory()) continue;
        const subName = sub.name.toLowerCase();
        if (
          subName.includes('scheduler') ||
          subName.includes('service') ||
          subName.includes('worker') ||
          subName.includes('job')
        ) {
          dirsToSearch.push(path.join(DOTNET_REPO, entry.name, sub.name));
        }
      }
    } catch {
      // Skip
    }
  }

  console.log(`Found ${dirsToSearch.length} scheduler/service directories to scan`);

  for (const dir of dirsToSearch) {
    const projectName = path.relative(DOTNET_REPO, dir);
    console.log(`  Scanning: ${projectName}`);

    const csFiles = await collectCsFiles(dir);

    for (const csFile of csFiles) {
      try {
        const source = await fs.readFile(csFile, 'utf-8');
        const relativePath = path.relative(DOTNET_REPO, csFile);

        // Look for classes that inherit from ServiceBase, implement IJob, etc.
        const classRegex = /(?:public|internal)\s+(?:partial\s+)?class\s+(\w+)(?:\s*:\s*([^\{]+))?/g;
        let classMatch: RegExpExecArray | null;

        while ((classMatch = classRegex.exec(source)) !== null) {
          const className = classMatch[1];
          const inheritance = classMatch[2] || '';

          // Check if this is a scheduler/service class
          const isService =
            inheritance.includes('ServiceBase') ||
            inheritance.includes('IJob') ||
            inheritance.includes('BackgroundService') ||
            inheritance.includes('IHostedService') ||
            className.includes('Scheduler') ||
            className.includes('Service') ||
            className.includes('Worker') ||
            className.includes('Job') ||
            className.includes('Timer');

          if (!isService) continue;

          // Skip common non-scheduler service classes
          if (className === 'ServiceBase' || className === 'ServiceInstaller') continue;

          const description = extractDescription(source, className);
          const schedulePattern = extractSchedulePattern(source);
          const serviceType = detectServiceType(source);
          const domain = classifyDomain(className, description, relativePath);
          const methods = extractMethods(source, className);

          schedulers.push({
            name: className.replace(/Service$|Scheduler$|Worker$/, ''),
            className,
            description,
            schedulePattern,
            domain,
            filePath: relativePath,
            projectName,
            serviceType,
            methods,
          });
        }
      } catch (err) {
        console.warn(`    Warning: Failed to parse ${csFile}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Deduplicate by className
  const seen = new Set<string>();
  const unique = schedulers.filter((s) => {
    if (seen.has(s.className)) return false;
    seen.add(s.className);
    return true;
  });

  // Build catalog
  const byDomain: Record<string, number> = {};
  const byServiceType: Record<string, number> = {};
  for (const s of unique) {
    byDomain[s.domain] = (byDomain[s.domain] || 0) + 1;
    byServiceType[s.serviceType] = (byServiceType[s.serviceType] || 0) + 1;
  }

  const catalog: SchedulerCatalog = {
    parsedAt: new Date().toISOString(),
    totalSchedulers: unique.length,
    byDomain,
    byServiceType,
    schedulers: unique,
  };

  // Write output
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, 'schedulers.json');
  await fs.writeFile(outputPath, JSON.stringify(catalog, null, 2), 'utf-8');

  console.log(`\nResults:`);
  console.log(`  Total schedulers/services found: ${unique.length}`);
  console.log(`  By domain: ${JSON.stringify(byDomain, null, 2)}`);
  console.log(`  By service type: ${JSON.stringify(byServiceType, null, 2)}`);
  console.log(`  Output: ${outputPath}`);

  console.log('\n=== Scheduler parsing complete ===');
}

main().catch((err) => {
  console.error('Fatal error parsing schedulers:', err);
  process.exit(1);
});
