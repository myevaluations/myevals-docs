/**
 * generate-nodejs-docs.ts
 *
 * Generate Node.js backend documentation artifacts.
 * Locates and copies the OpenAPI spec from the NestJS backend repo,
 * and logs what was found/generated.
 *
 * Output: static/openapi/nodejs-api.json
 *
 * Usage: tsx scripts/generate-nodejs-docs.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const NODEJS_REPO = path.join(PROJECT_ROOT, '.repos', 'myevals-nodejs-backend');
const OPENAPI_OUTPUT_DIR = path.join(PROJECT_ROOT, 'static', 'openapi');
const GENERATED_DIR = path.join(PROJECT_ROOT, 'generated', 'nodejs-api');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NodejsDocsResult {
  generatedAt: string;
  openApiSpec: {
    found: boolean;
    sourcePath: string | null;
    outputPath: string | null;
    endpointCount: number;
  };
  modules: ModuleSummary[];
}

interface ModuleSummary {
  name: string;
  path: string;
  hasController: boolean;
  hasService: boolean;
  hasModule: boolean;
  hasEntities: boolean;
  hasDtos: boolean;
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

async function findFile(dir: string, filename: string, maxDepth: number = 5): Promise<string | null> {
  if (maxDepth <= 0) return null;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === filename) {
        return fullPath;
      }
    }

    // Search subdirectories
    for (const entry of entries) {
      if (entry.isDirectory() && !['node_modules', '.git', 'dist', 'coverage'].includes(entry.name)) {
        const found = await findFile(path.join(dir, entry.name), filename, maxDepth - 1);
        if (found) return found;
      }
    }
  } catch {
    // Directory may not exist
  }

  return null;
}

async function findOpenApiSpec(): Promise<string | null> {
  // Common locations for OpenAPI specs in NestJS projects
  const candidates = [
    path.join(NODEJS_REPO, 'openapi.json'),
    path.join(NODEJS_REPO, 'swagger.json'),
    path.join(NODEJS_REPO, 'api-spec.json'),
    path.join(NODEJS_REPO, 'docs', 'openapi.json'),
    path.join(NODEJS_REPO, 'docs', 'swagger.json'),
    path.join(NODEJS_REPO, 'dist', 'openapi.json'),
    path.join(NODEJS_REPO, 'dist', 'swagger.json'),
    path.join(NODEJS_REPO, 'src', 'openapi.json'),
    path.join(NODEJS_REPO, 'static', 'openapi.json'),
    path.join(NODEJS_REPO, 'public', 'openapi.json'),
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  // Broader search
  console.log('  Searching deeper for OpenAPI spec...');
  const found = await findFile(NODEJS_REPO, 'openapi.json');
  if (found) return found;

  return findFile(NODEJS_REPO, 'swagger.json');
}

/**
 * Scan the NestJS src directory for module structure.
 */
async function scanModules(): Promise<ModuleSummary[]> {
  const modules: ModuleSummary[] = [];
  const srcDir = path.join(NODEJS_REPO, 'src');

  if (!(await fileExists(srcDir))) {
    // Try apps/api/src for monorepo layouts
    const altSrcDir = path.join(NODEJS_REPO, 'apps', 'api', 'src');
    if (!(await fileExists(altSrcDir))) {
      console.warn('  Could not find src directory in Node.js repo.');
      return modules;
    }
    return scanModuleDir(altSrcDir);
  }

  return scanModuleDir(srcDir);
}

async function scanModuleDir(srcDir: string): Promise<ModuleSummary[]> {
  const modules: ModuleSummary[] = [];

  try {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const moduleDir = path.join(srcDir, entry.name);
      const moduleName = entry.name;
      const relativePath = path.relative(NODEJS_REPO, moduleDir);

      try {
        const moduleFiles = await fs.readdir(moduleDir);
        const fileNames = moduleFiles.map((f) => f.toLowerCase());

        modules.push({
          name: moduleName,
          path: relativePath,
          hasController: fileNames.some((f) => f.includes('.controller.')),
          hasService: fileNames.some((f) => f.includes('.service.')),
          hasModule: fileNames.some((f) => f.includes('.module.')),
          hasEntities: fileNames.some(
            (f) => f.includes('.entity.') || f.includes('entities')
          ),
          hasDtos: fileNames.some(
            (f) => f.includes('.dto.') || f.includes('dto')
          ),
        });
      } catch {
        // Skip unreadable directories
      }
    }
  } catch {
    // Directory scanning failed
  }

  return modules;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Generate Node.js Backend Documentation ===\n');

  if (!(await fileExists(NODEJS_REPO))) {
    console.warn('Warning: nodejs-backend repo not found. Run "npm run sync-repos" first.');
    return;
  }

  // Ensure output directories exist
  await fs.mkdir(OPENAPI_OUTPUT_DIR, { recursive: true });
  await fs.mkdir(GENERATED_DIR, { recursive: true });

  // 1. Find and copy OpenAPI spec
  console.log('Searching for OpenAPI specification...');
  const specPath = await findOpenApiSpec();

  let endpointCount = 0;

  if (specPath) {
    console.log(`  Found: ${specPath}`);

    try {
      const specContent = await fs.readFile(specPath, 'utf-8');
      const spec = JSON.parse(specContent);

      // Count endpoints
      if (spec.paths) {
        for (const pathMethods of Object.values(spec.paths)) {
          if (typeof pathMethods === 'object' && pathMethods !== null) {
            endpointCount += Object.keys(pathMethods as Record<string, unknown>).filter((m) =>
              ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(m)
            ).length;
          }
        }
      }

      // Copy to static directory
      const outputPath = path.join(OPENAPI_OUTPUT_DIR, 'nodejs-api.json');
      await fs.writeFile(outputPath, JSON.stringify(spec, null, 2), 'utf-8');
      console.log(`  Copied to: ${outputPath}`);
      console.log(`  Endpoints: ${endpointCount}`);
    } catch (err) {
      console.warn(`  Warning: Failed to process OpenAPI spec: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    console.log('  No OpenAPI spec found in the repo.');
    console.log('  The spec may need to be generated by running the NestJS app.');
    console.log('  Typical command: npm run start:dev -- --generate-swagger');
  }

  // 2. Scan module structure
  console.log('\nScanning NestJS module structure...');
  const modules = await scanModules();

  if (modules.length > 0) {
    console.log(`  Found ${modules.length} modules:`);
    for (const mod of modules) {
      const features = [];
      if (mod.hasController) features.push('controller');
      if (mod.hasService) features.push('service');
      if (mod.hasModule) features.push('module');
      if (mod.hasEntities) features.push('entities');
      if (mod.hasDtos) features.push('DTOs');
      console.log(`    ${mod.name}: ${features.join(', ') || 'no standard files'}`);
    }
  } else {
    console.log('  No modules found.');
  }

  // 3. Write summary
  const result: NodejsDocsResult = {
    generatedAt: new Date().toISOString(),
    openApiSpec: {
      found: !!specPath,
      sourcePath: specPath ? path.relative(NODEJS_REPO, specPath) : null,
      outputPath: specPath ? 'static/openapi/nodejs-api.json' : null,
      endpointCount,
    },
    modules,
  };

  const summaryPath = path.join(GENERATED_DIR, 'nodejs-summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\nWrote summary to: ${summaryPath}`);

  console.log('\n=== Node.js docs generation complete ===');
}

main().catch((err) => {
  console.error('Fatal error generating Node.js docs:', err);
  process.exit(1);
});
