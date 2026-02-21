/**
 * inject-dependents-panel.ts
 *
 * Reads generated/reverse-deps/{Module}.json files and injects (or updates)
 * the DependentsPanel component into each business module MDX overview page.
 *
 * The panel is inserted just before the first ## heading that follows the
 * title, or before "## File Reference" — whichever comes first.
 *
 * Re-running this script is idempotent: it replaces existing panel sections.
 *
 * Usage: tsx scripts/inject-dependents-panel.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REV_DEPS_DIR = path.join(PROJECT_ROOT, 'generated', 'reverse-deps');
const BIZ_DOCS_DIR = path.join(PROJECT_ROOT, 'docs', 'dotnet-backend', 'business');

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

/** Map module JSON filename stem → MDX filename */
const MODULE_TO_MDX: Record<string, string> = {
  AdobeSign: 'adobesign',        // check if exists
  CMETracking: 'cme-tracking',
  Common: 'common',
  DutyHours: 'duty-hours',
  ERAS: 'eras',
  EssentialActivities: 'essential-activities',
  Evaluations: 'evaluations',
  HelloSign: 'hellosign',
  ICC: 'icc',
  LearningAssignment: 'learning-assignment',
  Mail: 'mail',
  MailGunService: 'mailgun-service',
  MyHelp: 'myhelp',
  NurseNotifyService: 'nurse-notify',
  PatientLog: 'patient-log',
  Portfolio: 'portfolio',
  Procedures: 'procedures',
  Quiz: 'quiz',
  RightSignature: 'rightsignature', // check if exists
  Security: 'security',
  TimeSheet: 'timesheet',
  Utilities: 'utilities',
};

const IMPORT_LINE = `import DependentsPanel from '@site/src/components/DependentsPanel';`;

const PANEL_START_MARKER = '{/* DEPENDENTS-PANEL:START */}';
const PANEL_END_MARKER = '{/* DEPENDENTS-PANEL:END */}';

function buildPanelMdx(data: ModuleRevDeps): string {
  const webJson = JSON.stringify(data.dependents.web, null, 2);
  const schedJson = JSON.stringify(data.dependents.schedulers, null, 2);
  return `${PANEL_START_MARKER}
<DependentsPanel
  module="${data.module}"
  webDependents={${webJson}}
  schedulerDependents={${schedJson}}
/>
${PANEL_END_MARKER}`;
}

async function processModule(moduleName: string, mdxSlug: string): Promise<boolean> {
  const revDepsPath = path.join(REV_DEPS_DIR, `${moduleName}.json`);
  const mdxPath = path.join(BIZ_DOCS_DIR, `${mdxSlug}.mdx`);

  // Check both files exist
  try {
    await fs.access(revDepsPath);
    await fs.access(mdxPath);
  } catch {
    console.log(`  Skipping ${moduleName} — missing file`);
    return false;
  }

  const rawJson = await fs.readFile(revDepsPath, 'utf-8');
  const data: ModuleRevDeps = JSON.parse(rawJson);

  let mdxContent = await fs.readFile(mdxPath, 'utf-8');

  // Build panel MDX block
  const panelMdx = buildPanelMdx(data);

  // Ensure import is present (after frontmatter)
  const hasFrontmatter = mdxContent.startsWith('---');
  const frontmatterEnd = hasFrontmatter ? mdxContent.indexOf('---', 3) + 3 : 0;

  if (!mdxContent.includes(IMPORT_LINE)) {
    // Insert import after frontmatter
    const afterFrontmatter = mdxContent.slice(frontmatterEnd);
    mdxContent =
      mdxContent.slice(0, frontmatterEnd) +
      '\n' +
      IMPORT_LINE +
      afterFrontmatter;
  }

  // Remove existing panel block if present (idempotent)
  const startIdx = mdxContent.indexOf(PANEL_START_MARKER);
  const endIdx = mdxContent.indexOf(PANEL_END_MARKER);
  if (startIdx !== -1 && endIdx !== -1) {
    const before = mdxContent.slice(0, startIdx).trimEnd();
    const after = mdxContent.slice(endIdx + PANEL_END_MARKER.length);
    mdxContent = before + '\n\n' + after.trimStart();
  }

  // Find insertion point: just before "## File Reference" or before the first ## heading
  // after the title (first # heading)
  const insertBefore = '## File Reference';
  const insertIdx = mdxContent.indexOf(insertBefore);

  if (insertIdx !== -1) {
    // Insert panel before ## File Reference
    const before = mdxContent.slice(0, insertIdx).trimEnd();
    const after = mdxContent.slice(insertIdx);
    mdxContent = before + '\n\n' + panelMdx + '\n\n' + after;
  } else {
    // Fallback: append before end of file
    mdxContent = mdxContent.trimEnd() + '\n\n' + panelMdx + '\n';
  }

  await fs.writeFile(mdxPath, mdxContent, 'utf-8');
  console.log(`  ✓ ${moduleName} → ${mdxSlug}.mdx (${data.totals.web} web, ${data.totals.schedulers} scheduler dependents)`);
  return true;
}

async function main(): Promise<void> {
  console.log('=== Inject DependentsPanel into Business Module Pages ===\n');

  let count = 0;
  for (const [moduleName, mdxSlug] of Object.entries(MODULE_TO_MDX)) {
    const ok = await processModule(moduleName, mdxSlug);
    if (ok) count++;
  }

  console.log(`\n✓ Updated ${count} business module pages`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
