/**
 * generate-file-reference-pages.ts
 *
 * Generates MDX pages for Docusaurus from per-file enrichment JSONs.
 * Each enrichment JSON gets a corresponding MDX page that imports the
 * FileReference component with the enrichment data.
 *
 * Also generates the master file-index.mdx dashboard page.
 *
 * Usage: tsx scripts/generate-file-reference-pages.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENRICHED_BASE = path.join(PROJECT_ROOT, 'generated', 'ai-enriched', 'dotnet', 'per-file');
const DOCS_BASE = path.join(PROJECT_ROOT, 'docs', 'dotnet-backend');

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
  files: FileEnrichment[];
  directoryOverview: string;
  keyWorkflows: string[];
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function slugify(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function generateDirectoryMdx(data: DirectoryEnrichment, docId: string): string {
  const title = data.directory.replace(/^Web\//, '').replace(/\//g, ' > ');
  const label = title || data.directory;

  return `---
title: "${label} Files"
sidebar_label: "${label}"
description: "Per-file reference for ${data.directory} (${data.fileCount} files)"
---

import FileReference from '@site/src/components/FileReference';

# ${label} File Reference

> **${data.fileCount} files** | **${data.files.reduce((s, f) => s + f.lineCount, 0).toLocaleString()} lines** | Generated ${new Date(data.generatedAt).toLocaleDateString()}

<FileReference
  files={${JSON.stringify(data.files, null, 2)}}
  directoryOverview="${(data.directoryOverview || '').replace(/"/g, '\\"')}"
  keyWorkflows={${JSON.stringify(data.keyWorkflows || [])}}
/>
`;
}

function generateFileIndexMdx(
  allData: { layer: string; directory: string; fileCount: number; totalLines: number; slug: string }[],
): string {
  const totalFiles = allData.reduce((s, d) => s + d.fileCount, 0);
  const totalLines = allData.reduce((s, d) => s + d.totalLines, 0);

  const webDirs = allData.filter((d) => d.layer === 'web');
  const schedDirs = allData.filter((d) => d.layer === 'scheduler' || d.layer === 'schedulers');
  const bizDirs = allData.filter((d) => d.layer === 'business');
  const supportDirs = allData.filter((d) => d.layer === 'supporting');

  const layerPaths: Record<string, string> = {
    web: './web/pages',
    schedulers: './schedulers/files',
    business: './business/files',
    supporting: './supporting',
  };

  function dirTable(dirs: typeof allData): string {
    if (dirs.length === 0) return '*No enrichment data yet.*\n';
    return `| Directory | Files | Lines |
|-----------|------:|------:|
${dirs.map((d) => `| [${d.directory}](${layerPaths[d.layer] || './web/pages'}/${d.slug}) | ${d.fileCount} | ${d.totalLines.toLocaleString()} |`).join('\n')}
`;
  }

  return `---
title: "File Reference Index"
sidebar_label: "File Index"
description: "Master index of all ${totalFiles} enriched .NET source files"
---

# .NET Backend File Reference

> **${totalFiles.toLocaleString()} files** documented across **${allData.length} directories** | **${totalLines.toLocaleString()} total lines**

This index provides per-file documentation for every meaningful source file in the .NET backend repository.

## Web Application (${webDirs.reduce((s, d) => s + d.fileCount, 0)} files)

${dirTable(webDirs)}

## Schedulers (${schedDirs.reduce((s, d) => s + d.fileCount, 0)} files)

${dirTable(schedDirs)}

## Business Layer (${bizDirs.reduce((s, d) => s + d.fileCount, 0)} files)

${dirTable(bizDirs)}

## Supporting Projects (${supportDirs.reduce((s, d) => s + d.fileCount, 0)} files)

${dirTable(supportDirs)}
`;
}

async function main(): Promise<void> {
  console.log('=== Generate File Reference MDX Pages ===\n');

  // Create output directories
  const webPagesDir = path.join(DOCS_BASE, 'web', 'pages');
  const schedPagesDir = path.join(DOCS_BASE, 'schedulers', 'files');
  const bizPagesDir = path.join(DOCS_BASE, 'business', 'files');
  const supportPagesDir = path.join(DOCS_BASE, 'supporting');

  await fs.mkdir(webPagesDir, { recursive: true });
  await fs.mkdir(schedPagesDir, { recursive: true });
  await fs.mkdir(bizPagesDir, { recursive: true });
  await fs.mkdir(supportPagesDir, { recursive: true });

  const allDirInfo: { layer: string; directory: string; fileCount: number; totalLines: number; slug: string }[] = [];

  // Process each layer
  for (const [layer, enrichedDir, outputDir, docIdPrefix] of [
    ['web', path.join(ENRICHED_BASE, 'web'), webPagesDir, 'dotnet-backend/web/pages'],
    ['schedulers', path.join(ENRICHED_BASE, 'schedulers'), schedPagesDir, 'dotnet-backend/schedulers/files'],
    ['business', path.join(ENRICHED_BASE, 'business'), bizPagesDir, 'dotnet-backend/business/files'],
    ['supporting', path.join(ENRICHED_BASE, 'supporting'), supportPagesDir, 'dotnet-backend/supporting'],
  ] as const) {
    if (!(await fileExists(enrichedDir))) {
      console.log(`  Skipping ${layer}/ (directory not found)`);
      continue;
    }

    const files = (await fs.readdir(enrichedDir)).filter((f) => f.endsWith('.json'));
    console.log(`Processing ${layer}/ (${files.length} JSON files)...`);

    for (const file of files) {
      try {
        const content = await fs.readFile(path.join(enrichedDir, file), 'utf-8');
        const data: DirectoryEnrichment = JSON.parse(content);

        if (!data.files || data.files.length === 0) {
          console.log(`  Skipping ${file} (no files)`);
          continue;
        }

        const baseName = file.replace('.json', '');
        const slug = slugify(baseName);
        const docId = `${docIdPrefix}/${slug}`;
        const mdxContent = generateDirectoryMdx(data, docId);
        const mdxPath = path.join(outputDir, `${slug}.mdx`);

        await fs.writeFile(mdxPath, mdxContent, 'utf-8');
        console.log(`  ${file} → ${slug}.mdx (${data.fileCount} files)`);

        const totalLines = data.files.reduce((s, f) => s + f.lineCount, 0);
        allDirInfo.push({
          layer,
          directory: data.directory,
          fileCount: data.fileCount,
          totalLines,
          slug,
        });
      } catch (err) {
        console.warn(`  Warning: Failed to process ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Generate master index page
  const indexMdx = generateFileIndexMdx(allDirInfo);
  const indexPath = path.join(DOCS_BASE, 'file-index.mdx');
  await fs.writeFile(indexPath, indexMdx, 'utf-8');
  console.log(`\nGenerated file-index.mdx (${allDirInfo.length} directories, ${allDirInfo.reduce((s, d) => s + d.fileCount, 0)} total files)`);

  console.log('\n=== MDX generation complete ===');
}

main().catch((err) => {
  console.error('Fatal error generating MDX pages:', err);
  process.exit(1);
});
