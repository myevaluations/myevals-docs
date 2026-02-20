/**
 * generate-maui-docs.ts
 *
 * Generate MAUI mobile app documentation catalog.
 * Walks the xamarin-app repo for ViewModels, Services, and Pages,
 * extracting class names and file paths.
 *
 * Output: generated/dotnet-metadata/maui-catalog.json
 *
 * Usage: tsx scripts/generate-maui-docs.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MAUI_REPO = path.join(PROJECT_ROOT, '.repos', 'myevals-xamarin-app');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'generated', 'dotnet-metadata');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MauiClassInfo {
  name: string;
  namespace: string;
  filePath: string;
  category: 'ViewModel' | 'Service' | 'Page' | 'Model' | 'Helper' | 'Other';
  baseClass: string | null;
  interfaces: string[];
  methods: string[];
}

interface MauiCatalog {
  generatedAt: string;
  repoPath: string;
  totalClasses: number;
  byCategory: Record<string, number>;
  viewModels: MauiClassInfo[];
  services: MauiClassInfo[];
  pages: MauiClassInfo[];
  models: MauiClassInfo[];
  helpers: MauiClassInfo[];
  other: MauiClassInfo[];
  allClasses: MauiClassInfo[];
}

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

const SKIP_DIRS = new Set([
  'bin', 'obj', 'packages', 'node_modules', '.git', '.vs',
  'Platforms', 'Resources', 'Properties',
]);

/**
 * Recursively collect C#/XAML files from a directory.
 */
async function collectFiles(dir: string, extensions: string[]): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        files.push(...(await collectFiles(fullPath, extensions)));
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // Directory may not exist
  }

  return files;
}

/**
 * Classify a class based on its name, path, and inheritance.
 */
function classifyClass(
  name: string,
  filePath: string,
  baseClass: string | null
): MauiClassInfo['category'] {
  const lower = name.toLowerCase();
  const pathLower = filePath.toLowerCase();

  if (lower.endsWith('viewmodel') || lower.endsWith('vm') || pathLower.includes('viewmodel')) {
    return 'ViewModel';
  }
  if (lower.endsWith('service') || lower.endsWith('provider') || pathLower.includes('service')) {
    return 'Service';
  }
  if (
    lower.endsWith('page') ||
    lower.endsWith('view') ||
    pathLower.includes('/pages/') ||
    pathLower.includes('/views/') ||
    baseClass?.includes('ContentPage') ||
    baseClass?.includes('ContentView') ||
    baseClass?.includes('TabbedPage') ||
    baseClass?.includes('NavigationPage')
  ) {
    return 'Page';
  }
  if (
    lower.endsWith('model') ||
    lower.endsWith('dto') ||
    lower.endsWith('entity') ||
    lower.endsWith('info') ||
    pathLower.includes('/models/') ||
    pathLower.includes('/entities/')
  ) {
    return 'Model';
  }
  if (
    lower.endsWith('helper') ||
    lower.endsWith('utility') ||
    lower.endsWith('extension') ||
    lower.endsWith('converter') ||
    pathLower.includes('/helpers/') ||
    pathLower.includes('/utilities/') ||
    pathLower.includes('/converters/')
  ) {
    return 'Helper';
  }

  return 'Other';
}

/**
 * Parse a C# file to extract class information.
 */
async function parseCsFile(filePath: string, repoRoot: string): Promise<MauiClassInfo[]> {
  const classes: MauiClassInfo[] = [];

  try {
    const source = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(repoRoot, filePath);

    // Extract namespace
    const nsMatch = source.match(/namespace\s+([\w.]+)/);
    const namespace = nsMatch ? nsMatch[1] : '';

    // Match class declarations
    const classRegex = /(?:public|internal|private|protected)\s+(?:partial\s+)?(?:abstract\s+)?(?:sealed\s+)?class\s+(\w+)(?:<[^>]+>)?(?:\s*:\s*([^\{]+))?\s*\{/g;

    let classMatch: RegExpExecArray | null;
    while ((classMatch = classRegex.exec(source)) !== null) {
      const className = classMatch[1];
      const inheritance = classMatch[2] || '';

      // Parse base class and interfaces
      let baseClass: string | null = null;
      const interfaces: string[] = [];

      if (inheritance) {
        const parts = inheritance.split(',').map((s) => s.trim().replace(/<[^>]*>/g, ''));
        for (const part of parts) {
          if (!part) continue;
          if (
            part.startsWith('I') &&
            part.length > 1 &&
            part[1] === part[1].toUpperCase()
          ) {
            interfaces.push(part);
          } else if (!baseClass) {
            baseClass = part;
          } else {
            interfaces.push(part);
          }
        }
      }

      // Extract method names
      const methods: string[] = [];
      const methodRegex = /(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?(?:override\s+)?(?:virtual\s+)?[\w.<>\[\],\s]+?\s+(\w+)\s*\(/g;
      let methodMatch: RegExpExecArray | null;

      // Get approximate class body
      const classStartIndex = classMatch.index + classMatch[0].length;
      const classBody = source.substring(classStartIndex, classStartIndex + 10000);

      while ((methodMatch = methodRegex.exec(classBody)) !== null) {
        const name = methodMatch[1];
        if (
          name !== className &&
          !['if', 'while', 'for', 'switch', 'catch', 'using', 'return', 'new', 'throw'].includes(name)
        ) {
          methods.push(name);
        }
      }

      const category = classifyClass(className, relativePath, baseClass);

      classes.push({
        name: className,
        namespace,
        filePath: relativePath,
        category,
        baseClass,
        interfaces,
        methods: [...new Set(methods)],
      });
    }
  } catch (err) {
    console.warn(`  Warning: Failed to parse ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return classes;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Generate MAUI Mobile App Documentation ===\n');

  if (!(await fileExists(MAUI_REPO))) {
    console.warn('Warning: xamarin-app repo not found. Run "npm run sync-repos" first.');
    return;
  }

  console.log(`Scanning: ${MAUI_REPO}\n`);

  // Collect all C# files
  const csFiles = await collectFiles(MAUI_REPO, ['.cs']);
  console.log(`Found ${csFiles.length} C# files`);

  // Parse each file
  const allClasses: MauiClassInfo[] = [];

  for (const file of csFiles) {
    const classes = await parseCsFile(file, MAUI_REPO);
    allClasses.push(...classes);
  }

  console.log(`Extracted ${allClasses.length} classes\n`);

  // Categorize
  const viewModels = allClasses.filter((c) => c.category === 'ViewModel');
  const services = allClasses.filter((c) => c.category === 'Service');
  const pages = allClasses.filter((c) => c.category === 'Page');
  const models = allClasses.filter((c) => c.category === 'Model');
  const helpers = allClasses.filter((c) => c.category === 'Helper');
  const other = allClasses.filter((c) => c.category === 'Other');

  const byCategory: Record<string, number> = {
    ViewModel: viewModels.length,
    Service: services.length,
    Page: pages.length,
    Model: models.length,
    Helper: helpers.length,
    Other: other.length,
  };

  const catalog: MauiCatalog = {
    generatedAt: new Date().toISOString(),
    repoPath: MAUI_REPO,
    totalClasses: allClasses.length,
    byCategory,
    viewModels,
    services,
    pages,
    models,
    helpers,
    other,
    allClasses,
  };

  // Write output
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, 'maui-catalog.json');
  await fs.writeFile(outputPath, JSON.stringify(catalog, null, 2), 'utf-8');

  console.log('Summary:');
  console.log(`  Total classes: ${allClasses.length}`);
  console.log(`  ViewModels: ${viewModels.length}`);
  console.log(`  Services: ${services.length}`);
  console.log(`  Pages: ${pages.length}`);
  console.log(`  Models: ${models.length}`);
  console.log(`  Helpers: ${helpers.length}`);
  console.log(`  Other: ${other.length}`);
  console.log(`\nOutput: ${outputPath}`);

  // List some key ViewModels
  if (viewModels.length > 0) {
    console.log('\nKey ViewModels:');
    for (const vm of viewModels.slice(0, 15)) {
      console.log(`  ${vm.name} (${vm.filePath})`);
    }
    if (viewModels.length > 15) {
      console.log(`  ... and ${viewModels.length - 15} more`);
    }
  }

  console.log('\n=== MAUI docs generation complete ===');
}

main().catch((err) => {
  console.error('Fatal error generating MAUI docs:', err);
  process.exit(1);
});
