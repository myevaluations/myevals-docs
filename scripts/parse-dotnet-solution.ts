/**
 * parse-dotnet-solution.ts
 *
 * Parses the .NET solution file (MyEvaluations2009.sln) from the cloned dotnet-backend repo.
 * Extracts project references, builds dependency graphs, and outputs:
 *   - generated/dotnet-metadata/solution-map.json
 *   - generated/dotnet-metadata/dependency-graph.mmd
 *
 * Usage: tsx scripts/parse-dotnet-solution.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DOTNET_REPO = path.join(PROJECT_ROOT, '.repos', 'myevals-dotnet-backend');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'generated', 'dotnet-metadata');

// Known .NET project type GUIDs
const PROJECT_TYPE_MAP: Record<string, string> = {
  '{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}': 'C#',
  '{F184B08F-C81C-45F6-A57F-5ABD9991F28F}': 'VB.NET',
  '{349C5851-65DF-11DA-9384-00065B846F21}': 'Web Application',
  '{E24C65DC-7377-472B-9ABA-BC803B73C61A}': 'Web Site',
  '{603C0E0B-DB56-11DC-BE95-000D561079B0}': 'ASP.NET MVC',
  '{2150E333-8FDC-42A3-9474-1A3956D46DE8}': 'Solution Folder',
  '{A9ACE382-BABC-44E0-9FA0-7B45B5B8B5B8}': 'Windows Service',
};

interface SolutionProject {
  name: string;
  relativePath: string;
  guid: string;
  typeGuid: string;
  typeName: string;
  group: string;
}

interface ProjectDependency {
  from: string;
  to: string;
}

interface SolutionMap {
  solutionFile: string;
  parsedAt: string;
  projectCount: number;
  projects: SolutionProject[];
  groups: Record<string, string[]>;
  dependencies: ProjectDependency[];
}

/**
 * Classify a project into a logical group based on its name/path.
 */
function classifyProject(name: string, relativePath: string): string {
  const lower = name.toLowerCase();
  const pathLower = relativePath.toLowerCase();

  if (lower.startsWith('business.')) return 'Business';
  if (lower.startsWith('dataaccess.') || lower.startsWith('data.')) return 'DataAccess';
  if (lower.startsWith('info.') || lower.startsWith('model')) return 'Models';
  if (pathLower.includes('web') || lower.includes('website') || lower.includes('webapp')) return 'Web';
  if (pathLower.includes('service') || lower.includes('service')) return 'WindowsServices';
  if (pathLower.includes('scheduler') || lower.includes('scheduler')) return 'Schedulers';
  if (lower.includes('test') || lower.includes('spec')) return 'Tests';
  if (lower.includes('common') || lower.includes('utility') || lower.includes('helper')) return 'Common';
  if (lower.includes('api')) return 'API';
  if (lower.includes('migration')) return 'Migrations';
  return 'Other';
}

/**
 * Parse the .sln file and extract all project entries.
 */
async function parseSolutionFile(slnPath: string): Promise<SolutionProject[]> {
  const content = await fs.readFile(slnPath, 'utf-8');
  const projects: SolutionProject[] = [];

  // Pattern: Project("{typeGuid}") = "name", "path", "{guid}"
  const projectRegex = /Project\("(\{[A-F0-9-]+\})"\)\s*=\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"(\{[A-F0-9-]+\})"/gi;

  let match: RegExpExecArray | null;
  while ((match = projectRegex.exec(content)) !== null) {
    const typeGuid = match[1].toUpperCase();
    const name = match[2];
    const relativePath = match[3].replace(/\\/g, '/');
    const guid = match[4].toUpperCase();

    // Skip solution folders
    if (typeGuid === '{2150E333-8FDC-42A3-9474-1A3956D46DE8}') {
      continue;
    }

    const typeName = PROJECT_TYPE_MAP[typeGuid] || 'Unknown';
    const group = classifyProject(name, relativePath);

    projects.push({
      name,
      relativePath,
      guid,
      typeGuid,
      typeName,
      group,
    });
  }

  return projects;
}

/**
 * Parse a .csproj file to extract ProjectReference dependencies.
 */
async function parseCsprojDependencies(
  csprojPath: string,
  projectName: string
): Promise<ProjectDependency[]> {
  const deps: ProjectDependency[] = [];

  try {
    const content = await fs.readFile(csprojPath, 'utf-8');

    // Match <ProjectReference Include="..."> elements
    const refRegex = /<ProjectReference\s+Include="([^"]+)"/gi;
    let match: RegExpExecArray | null;
    while ((match = refRegex.exec(content)) !== null) {
      const refPath = match[1].replace(/\\/g, '/');
      // Extract project name from path (e.g., "..\Business.Security\Business.Security.csproj" -> "Business.Security")
      const refName = path.basename(refPath, path.extname(refPath));
      deps.push({ from: projectName, to: refName });
    }

    // Also match <Reference> with <HintPath> pointing to project outputs
    const hintRegex = /<Reference\s+Include="([^",]+)[^"]*"[\s\S]*?<HintPath>([^<]+)<\/HintPath>/gi;
    while ((match = hintRegex.exec(content)) !== null) {
      const refAssembly = match[1];
      // Only include references that look like internal project references
      if (
        refAssembly.startsWith('Business.') ||
        refAssembly.startsWith('DataAccess.') ||
        refAssembly.startsWith('Info.') ||
        refAssembly.startsWith('Common') ||
        refAssembly.startsWith('Model')
      ) {
        deps.push({ from: projectName, to: refAssembly });
      }
    }
  } catch {
    // File may not exist or be unreadable
  }

  return deps;
}

/**
 * Generate a Mermaid dependency diagram.
 */
function generateMermaidDiagram(
  projects: SolutionProject[],
  dependencies: ProjectDependency[]
): string {
  const lines: string[] = [
    'graph TD',
    '  %% MyEvaluations .NET Solution Dependency Graph',
    '  %% Auto-generated by parse-dotnet-solution.ts',
    '',
  ];

  // Group projects by their classification
  const groups = new Map<string, SolutionProject[]>();
  for (const proj of projects) {
    const list = groups.get(proj.group) || [];
    list.push(proj);
    groups.set(proj.group, list);
  }

  // Add subgraphs for each group
  for (const [groupName, groupProjects] of groups) {
    lines.push(`  subgraph ${groupName}`);
    for (const proj of groupProjects) {
      // Sanitize name for Mermaid (replace dots with underscores for node IDs)
      const nodeId = proj.name.replace(/\./g, '_').replace(/\s/g, '_');
      lines.push(`    ${nodeId}["${proj.name}"]`);
    }
    lines.push('  end');
    lines.push('');
  }

  // Add dependency edges (deduplicated)
  const edgeSet = new Set<string>();
  for (const dep of dependencies) {
    const fromId = dep.from.replace(/\./g, '_').replace(/\s/g, '_');
    const toId = dep.to.replace(/\./g, '_').replace(/\s/g, '_');
    const edgeKey = `${fromId}-->${toId}`;
    if (!edgeSet.has(edgeKey)) {
      edgeSet.add(edgeKey);
      lines.push(`  ${fromId} --> ${toId}`);
    }
  }

  return lines.join('\n');
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  console.log('=== Parse .NET Solution File ===\n');

  // Find the solution file
  const slnPath = path.join(DOTNET_REPO, 'MyEvaluations2009.sln');

  if (!(await fileExists(slnPath))) {
    console.warn(`Warning: Solution file not found at ${slnPath}`);
    console.warn('The dotnet-backend repo may not be cloned yet. Run "npm run sync-repos" first.');

    // Try to find any .sln file in the repo
    try {
      const entries = await fs.readdir(DOTNET_REPO);
      const slnFiles = entries.filter((e) => e.endsWith('.sln'));
      if (slnFiles.length > 0) {
        console.log(`Found alternative .sln files: ${slnFiles.join(', ')}`);
      }
    } catch {
      console.warn('Repo directory does not exist. Skipping.');
      return;
    }
    return;
  }

  console.log(`Parsing: ${slnPath}`);

  // Parse solution
  const projects = await parseSolutionFile(slnPath);
  console.log(`Found ${projects.length} projects`);

  // Build dependency graph by parsing .csproj files
  const allDependencies: ProjectDependency[] = [];
  let parsedCsproj = 0;

  for (const proj of projects) {
    // Resolve the .csproj path relative to the solution directory
    const csprojPath = path.join(DOTNET_REPO, proj.relativePath);
    if (await fileExists(csprojPath)) {
      const deps = await parseCsprojDependencies(csprojPath, proj.name);
      allDependencies.push(...deps);
      parsedCsproj++;
    }
  }

  console.log(`Parsed ${parsedCsproj} .csproj files, found ${allDependencies.length} dependency edges`);

  // Group projects
  const groups: Record<string, string[]> = {};
  for (const proj of projects) {
    if (!groups[proj.group]) {
      groups[proj.group] = [];
    }
    groups[proj.group].push(proj.name);
  }

  console.log('\nProject groups:');
  for (const [group, names] of Object.entries(groups)) {
    console.log(`  ${group}: ${names.length} projects`);
  }

  // Build output
  const solutionMap: SolutionMap = {
    solutionFile: 'MyEvaluations2009.sln',
    parsedAt: new Date().toISOString(),
    projectCount: projects.length,
    projects,
    groups,
    dependencies: allDependencies,
  };

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  // Write solution map JSON
  const jsonPath = path.join(OUTPUT_DIR, 'solution-map.json');
  await fs.writeFile(jsonPath, JSON.stringify(solutionMap, null, 2), 'utf-8');
  console.log(`\nWrote solution map to: ${jsonPath}`);

  // Generate and write Mermaid diagram
  const mermaid = generateMermaidDiagram(projects, allDependencies);
  const mermaidPath = path.join(OUTPUT_DIR, 'dependency-graph.mmd');
  await fs.writeFile(mermaidPath, mermaid, 'utf-8');
  console.log(`Wrote dependency graph to: ${mermaidPath}`);

  console.log('\n=== Parse complete ===');
}

main().catch((err) => {
  console.error('Fatal error parsing solution:', err);
  process.exit(1);
});
