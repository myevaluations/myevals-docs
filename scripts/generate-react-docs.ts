/**
 * generate-react-docs.ts
 *
 * Generate React frontend component documentation catalog.
 * Walks the react-frontend repo src directory to extract component names
 * and their file paths.
 *
 * Output: generated/nodejs-api/react-components.json
 *
 * Usage: tsx scripts/generate-react-docs.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REACT_REPO = path.join(PROJECT_ROOT, '.repos', 'myevals-react-frontend');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'generated', 'nodejs-api');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComponentInfo {
  name: string;
  filePath: string;
  directory: string;
  fileExtension: string;
  hasDefaultExport: boolean;
  namedExports: string[];
  usesPlasmic: boolean;
  isPage: boolean;
  hasTests: boolean;
}

interface ComponentCatalog {
  generatedAt: string;
  repoPath: string;
  totalComponents: number;
  byDirectory: Record<string, number>;
  byType: {
    pages: number;
    components: number;
    plasmic: number;
    hooks: number;
    utils: number;
  };
  components: ComponentInfo[];
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

const COMPONENT_EXTENSIONS = new Set(['.tsx', '.jsx', '.ts', '.js']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', 'bin', 'obj']);

/**
 * Recursively collect component files from a directory.
 */
async function collectComponentFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        files.push(...(await collectComponentFiles(fullPath)));
      } else if (COMPONENT_EXTENSIONS.has(path.extname(entry.name))) {
        // Skip test files, config files, and type declaration files
        if (
          entry.name.includes('.test.') ||
          entry.name.includes('.spec.') ||
          entry.name.includes('.stories.') ||
          entry.name.includes('.d.ts') ||
          entry.name === 'jest.config.ts' ||
          entry.name === 'next.config.js' ||
          entry.name === 'next.config.mjs'
        ) {
          continue;
        }
        files.push(fullPath);
      }
    }
  } catch {
    // Directory may not exist
  }

  return files;
}

/**
 * Extract component information from a source file.
 */
async function extractComponentInfo(filePath: string, repoRoot: string): Promise<ComponentInfo | null> {
  try {
    const source = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(repoRoot, filePath);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const directory = path.dirname(relativePath);

    // Determine if this is a component file (contains JSX/React component patterns)
    const isComponent =
      ext === '.tsx' ||
      ext === '.jsx' ||
      source.includes('React') ||
      source.includes('jsx') ||
      /export\s+(default\s+)?function\s+\w+/.test(source) ||
      /export\s+(default\s+)?class\s+\w+/.test(source) ||
      /export\s+const\s+\w+\s*[:=]\s*(?:React\.)?(?:FC|FunctionComponent|memo)/.test(source);

    if (!isComponent && ext !== '.tsx' && ext !== '.jsx') {
      return null;
    }

    // Extract component name
    let name = baseName;

    // Try to find default export name
    const defaultExportMatch = source.match(
      /export\s+default\s+(?:function|class)\s+(\w+)/
    );
    if (defaultExportMatch) {
      name = defaultExportMatch[1];
    }

    // Check for default export of a variable
    const defaultVarMatch = source.match(/export\s+default\s+(\w+)/);
    if (!defaultExportMatch && defaultVarMatch) {
      name = defaultVarMatch[1];
    }

    // Has default export?
    const hasDefaultExport = /export\s+default\s/.test(source);

    // Named exports
    const namedExports: string[] = [];
    const namedExportRegex = /export\s+(?:const|function|class|type|interface|enum)\s+(\w+)/g;
    let namedMatch: RegExpExecArray | null;
    while ((namedMatch = namedExportRegex.exec(source)) !== null) {
      namedExports.push(namedMatch[1]);
    }

    // Also capture export { ... } patterns
    const reExportRegex = /export\s*\{([^}]+)\}/g;
    while ((namedMatch = reExportRegex.exec(source)) !== null) {
      const exports = namedMatch[1].split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim());
      namedExports.push(...exports.filter(Boolean));
    }

    // Detect Plasmic usage
    const usesPlasmic =
      source.includes('plasmic') ||
      source.includes('Plasmic') ||
      source.includes('@plasmicapp') ||
      source.includes('PlasmicComponent');

    // Determine if it is a page component
    const isPage =
      directory.includes('pages') ||
      directory.includes('app') ||
      filePath.includes('/pages/') ||
      filePath.includes('/app/');

    // Check for associated test file
    const testCandidates = [
      filePath.replace(ext, `.test${ext}`),
      filePath.replace(ext, `.spec${ext}`),
      path.join(path.dirname(filePath), '__tests__', `${baseName}${ext}`),
    ];
    let hasTests = false;
    for (const testPath of testCandidates) {
      if (await fileExists(testPath)) {
        hasTests = true;
        break;
      }
    }

    return {
      name,
      filePath: relativePath,
      directory,
      fileExtension: ext,
      hasDefaultExport,
      namedExports,
      usesPlasmic,
      isPage,
      hasTests,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Generate React Frontend Component Catalog ===\n');

  if (!(await fileExists(REACT_REPO))) {
    console.warn('Warning: react-frontend repo not found. Run "npm run sync-repos" first.');
    return;
  }

  // Find the src directory
  let srcDir = path.join(REACT_REPO, 'src');
  if (!(await fileExists(srcDir))) {
    // Try common alternatives
    const alternatives = [
      path.join(REACT_REPO, 'app'),
      path.join(REACT_REPO, 'pages'),
      path.join(REACT_REPO, 'components'),
    ];
    let found = false;
    for (const alt of alternatives) {
      if (await fileExists(alt)) {
        srcDir = alt;
        found = true;
        break;
      }
    }
    if (!found) {
      // Fall back to repo root
      console.log('  No standard src directory found, scanning from repo root.');
      srcDir = REACT_REPO;
    }
  }

  console.log(`Scanning: ${srcDir}\n`);

  const allFiles = await collectComponentFiles(srcDir);
  console.log(`Found ${allFiles.length} potential component files`);

  const components: ComponentInfo[] = [];

  for (const file of allFiles) {
    const info = await extractComponentInfo(file, REACT_REPO);
    if (info) {
      components.push(info);
    }
  }

  console.log(`Extracted ${components.length} components\n`);

  // Build statistics
  const byDirectory: Record<string, number> = {};
  let pages = 0;
  let plasmicCount = 0;
  let hooks = 0;
  let utils = 0;

  for (const comp of components) {
    const dir = comp.directory || '(root)';
    byDirectory[dir] = (byDirectory[dir] || 0) + 1;

    if (comp.isPage) pages++;
    if (comp.usesPlasmic) plasmicCount++;
    if (comp.name.startsWith('use') || comp.filePath.includes('hook')) hooks++;
    if (
      comp.filePath.includes('util') ||
      comp.filePath.includes('helper') ||
      comp.filePath.includes('lib/')
    ) {
      utils++;
    }
  }

  const regularComponents = components.length - pages - hooks - utils;

  const catalog: ComponentCatalog = {
    generatedAt: new Date().toISOString(),
    repoPath: REACT_REPO,
    totalComponents: components.length,
    byDirectory,
    byType: {
      pages,
      components: regularComponents > 0 ? regularComponents : 0,
      plasmic: plasmicCount,
      hooks,
      utils,
    },
    components,
  };

  // Write output
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, 'react-components.json');
  await fs.writeFile(outputPath, JSON.stringify(catalog, null, 2), 'utf-8');

  console.log('Summary:');
  console.log(`  Total components: ${components.length}`);
  console.log(`  Pages: ${pages}`);
  console.log(`  Plasmic components: ${plasmicCount}`);
  console.log(`  Hooks: ${hooks}`);
  console.log(`  Utils: ${utils}`);
  console.log(`  Regular components: ${regularComponents > 0 ? regularComponents : 0}`);
  console.log(`\nOutput: ${outputPath}`);

  console.log('\n=== React docs generation complete ===');
}

main().catch((err) => {
  console.error('Fatal error generating React docs:', err);
  process.exit(1);
});
