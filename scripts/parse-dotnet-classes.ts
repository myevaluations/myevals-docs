/**
 * parse-dotnet-classes.ts
 *
 * Parses C# files from Business.* projects to extract class metadata.
 * Uses tree-sitter with tree-sitter-c-sharp when available, falls back to
 * regex-based parsing otherwise.
 *
 * Outputs per-project JSON to: generated/dotnet-metadata/classes/{project-name}.json
 *
 * Usage: tsx scripts/parse-dotnet-classes.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DOTNET_REPO = path.join(PROJECT_ROOT, '.repos', 'myevals-dotnet-backend');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'generated', 'dotnet-metadata', 'classes');

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

interface PropertyInfo {
  name: string;
  type: string;
  visibility: string;
  hasGetter: boolean;
  hasSetter: boolean;
}

interface ClassInfo {
  name: string;
  namespace: string;
  baseClass: string | null;
  interfaces: string[];
  isAbstract: boolean;
  isStatic: boolean;
  methods: MethodInfo[];
  properties: PropertyInfo[];
  storedProcedureCalls: string[];
  filePath: string;
}

interface ProjectClassData {
  projectName: string;
  parsedAt: string;
  parserUsed: 'tree-sitter' | 'regex';
  classCount: number;
  classes: ClassInfo[];
  managerClasses: string[];
  infoCounterparts: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Tree-sitter parser (preferred)
// ---------------------------------------------------------------------------

let treeSitterAvailable = false;
let Parser: any = null;
let CSharpLanguage: any = null;

async function tryLoadTreeSitter(): Promise<boolean> {
  try {
    const treeSitterModule = await import('tree-sitter');
    const csharpModule = await import('tree-sitter-c-sharp');
    Parser = treeSitterModule.default || treeSitterModule;
    CSharpLanguage = csharpModule.default || csharpModule;
    treeSitterAvailable = true;
    console.log('  tree-sitter loaded successfully.');
    return true;
  } catch (err) {
    console.warn('  tree-sitter not available, falling back to regex parser.');
    console.warn(`  Reason: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

function parseWithTreeSitter(source: string, filePath: string): ClassInfo[] {
  const parser = new Parser();
  parser.setLanguage(CSharpLanguage);
  const tree = parser.parse(source);
  const classes: ClassInfo[] = [];

  function findNamespace(node: any): string {
    if (!node) return '';
    if (
      node.type === 'namespace_declaration' ||
      node.type === 'file_scoped_namespace_declaration'
    ) {
      const nameNode = node.childForFieldName('name');
      return nameNode ? nameNode.text : '';
    }
    return findNamespace(node.parent);
  }

  function walkTree(node: any): void {
    if (node.type === 'class_declaration') {
      const nameNode = node.childForFieldName('name');
      if (!nameNode) return;

      const className = nameNode.text;
      const namespace = findNamespace(node);

      // Base class and interfaces
      let baseClass: string | null = null;
      const interfaces: string[] = [];
      const baseList = node.children.find((c: any) => c.type === 'base_list');
      if (baseList) {
        for (const child of baseList.namedChildren) {
          const typeName = child.text;
          if (typeName.startsWith('I') && typeName.length > 1 && typeName[1] === typeName[1].toUpperCase()) {
            interfaces.push(typeName);
          } else if (!baseClass) {
            baseClass = typeName;
          } else {
            interfaces.push(typeName);
          }
        }
      }

      // Modifiers
      const modifiers = node.children
        .filter((c: any) => c.type === 'modifier')
        .map((c: any) => c.text);

      const classInfo: ClassInfo = {
        name: className,
        namespace,
        baseClass,
        interfaces,
        isAbstract: modifiers.includes('abstract'),
        isStatic: modifiers.includes('static'),
        methods: [],
        properties: [],
        storedProcedureCalls: [],
        filePath: filePath,
      };

      // Parse methods
      for (const child of node.namedChildren) {
        if (child.type === 'method_declaration') {
          const methodName = child.childForFieldName('name')?.text || 'unknown';
          const returnType = child.childForFieldName('type')?.text || 'void';
          const mods = child.children
            .filter((c: any) => c.type === 'modifier')
            .map((c: any) => c.text);

          const params: string[] = [];
          const paramList = child.childForFieldName('parameters');
          if (paramList) {
            for (const p of paramList.namedChildren) {
              if (p.type === 'parameter') {
                params.push(p.text);
              }
            }
          }

          classInfo.methods.push({
            name: methodName,
            returnType,
            visibility: mods.find((m: string) =>
              ['public', 'private', 'protected', 'internal'].includes(m)
            ) || 'private',
            parameters: params,
            isStatic: mods.includes('static'),
            isAsync: mods.includes('async'),
          });
        }

        if (child.type === 'property_declaration') {
          const propName = child.childForFieldName('name')?.text || 'unknown';
          const propType = child.childForFieldName('type')?.text || 'unknown';
          const propMods = child.children
            .filter((c: any) => c.type === 'modifier')
            .map((c: any) => c.text);

          classInfo.properties.push({
            name: propName,
            type: propType,
            visibility: propMods.find((m: string) =>
              ['public', 'private', 'protected', 'internal'].includes(m)
            ) || 'private',
            hasGetter: child.text.includes('get'),
            hasSetter: child.text.includes('set'),
          });
        }
      }

      // Detect stored procedure calls in the entire class text
      classInfo.storedProcedureCalls = extractStoredProcedures(node.text);

      classes.push(classInfo);
    }

    for (const child of node.namedChildren) {
      walkTree(child);
    }
  }

  walkTree(tree.rootNode);
  return classes;
}

// ---------------------------------------------------------------------------
// Regex-based fallback parser
// ---------------------------------------------------------------------------

function parseWithRegex(source: string, filePath: string): ClassInfo[] {
  const classes: ClassInfo[] = [];

  // Extract namespace
  const nsMatch = source.match(/namespace\s+([\w.]+)/);
  const namespace = nsMatch ? nsMatch[1] : '';

  // Match class declarations
  const classRegex = /(?:(public|private|protected|internal)\s+)?(?:(abstract|static|sealed|partial)\s+)*class\s+(\w+)(?:<[^>]+>)?(?:\s*:\s*([^\{]+))?\s*\{/g;

  let classMatch: RegExpExecArray | null;
  while ((classMatch = classRegex.exec(source)) !== null) {
    const visibility = classMatch[1] || 'internal';
    const modifiers = classMatch[2] || '';
    const className = classMatch[3];
    const inheritance = classMatch[4] || '';

    // Parse base class and interfaces from inheritance clause
    let baseClass: string | null = null;
    const interfaces: string[] = [];
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

    // Find the class body (simple brace matching)
    const classStart = classMatch.index + classMatch[0].length - 1;
    const classBody = extractBraceBlock(source, classStart);

    // Extract methods from class body
    const methods: MethodInfo[] = [];
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

      // Skip constructor-like matches and common false positives
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

    // Extract properties
    const properties: PropertyInfo[] = [];
    const propRegex = /(?:(public|private|protected|internal)\s+)?(?:(static|virtual|override|abstract)\s+)?([\w.<>\[\]?,]+)\s+(\w+)\s*\{\s*(get)?[^}]*(set)?/g;

    let propMatch: RegExpExecArray | null;
    while ((propMatch = propRegex.exec(classBody)) !== null) {
      const propName = propMatch[4];
      if (['if', 'while', 'for', 'switch', 'catch', 'class'].includes(propName)) continue;

      properties.push({
        name: propName,
        type: propMatch[3] || 'unknown',
        visibility: propMatch[1] || 'private',
        hasGetter: !!propMatch[5],
        hasSetter: !!propMatch[6],
      });
    }

    // Detect stored procedure calls
    const storedProcedureCalls = extractStoredProcedures(classBody);

    classes.push({
      name: className,
      namespace,
      baseClass,
      interfaces,
      isAbstract: modifiers.includes('abstract'),
      isStatic: modifiers.includes('static'),
      methods,
      properties,
      storedProcedureCalls,
      filePath,
    });
  }

  return classes;
}

/**
 * Extract a brace-delimited block starting at the opening brace position.
 */
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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Extract stored procedure names from a code block.
 */
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

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively collect all .cs files under a directory.
 */
async function collectCsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip bin, obj, packages directories
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

async function main(): Promise<void> {
  console.log('=== Parse .NET Classes (Business.* projects) ===\n');

  if (!(await fileExists(DOTNET_REPO))) {
    console.warn('Warning: dotnet-backend repo not found. Run "npm run sync-repos" first.');
    return;
  }

  // Try loading tree-sitter
  await tryLoadTreeSitter();
  const parserType: 'tree-sitter' | 'regex' = treeSitterAvailable ? 'tree-sitter' : 'regex';
  console.log(`Using parser: ${parserType}\n`);

  // Find Business.* directories
  const repoEntries = await fs.readdir(DOTNET_REPO, { withFileTypes: true });
  const businessDirs = repoEntries
    .filter((e) => e.isDirectory() && e.name.startsWith('Business.'))
    .map((e) => e.name);

  // Also look in subdirectories one level deep for Business.* projects
  for (const entry of repoEntries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      try {
        const subEntries = await fs.readdir(path.join(DOTNET_REPO, entry.name), { withFileTypes: true });
        for (const sub of subEntries) {
          if (sub.isDirectory() && sub.name.startsWith('Business.')) {
            businessDirs.push(path.join(entry.name, sub.name));
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }
  }

  if (businessDirs.length === 0) {
    console.warn('No Business.* directories found in the repo.');
    console.warn('This may indicate a different project structure. Check the repo layout.');
    return;
  }

  console.log(`Found ${businessDirs.length} Business.* project directories\n`);

  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let totalClasses = 0;

  for (const dir of businessDirs) {
    const projectName = path.basename(dir);
    const projectDir = path.join(DOTNET_REPO, dir);
    console.log(`Processing: ${projectName}`);

    const csFiles = await collectCsFiles(projectDir);
    console.log(`  Found ${csFiles.length} .cs files`);

    const allClasses: ClassInfo[] = [];

    for (const csFile of csFiles) {
      try {
        const source = await fs.readFile(csFile, 'utf-8');
        const relativePath = path.relative(DOTNET_REPO, csFile);

        const classes = treeSitterAvailable
          ? parseWithTreeSitter(source, relativePath)
          : parseWithRegex(source, relativePath);

        allClasses.push(...classes);
      } catch (err) {
        console.warn(`  Warning: Failed to parse ${csFile}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Identify Manager classes and their Info counterparts
    const managerClasses = allClasses
      .filter((c) => c.name.endsWith('Manager'))
      .map((c) => c.name);

    const infoCounterparts: Record<string, string> = {};
    for (const mgr of managerClasses) {
      const baseName = mgr.replace(/Manager$/, '');
      const infoName = `${baseName}Info`;
      // Check if the Info class exists in the codebase
      const hasInfo = allClasses.some((c) => c.name === infoName);
      if (hasInfo) {
        infoCounterparts[mgr] = infoName;
      }
    }

    const projectData: ProjectClassData = {
      projectName,
      parsedAt: new Date().toISOString(),
      parserUsed: parserType,
      classCount: allClasses.length,
      classes: allClasses,
      managerClasses,
      infoCounterparts,
    };

    const outputPath = path.join(OUTPUT_DIR, `${projectName}.json`);
    await fs.writeFile(outputPath, JSON.stringify(projectData, null, 2), 'utf-8');
    console.log(`  Wrote ${allClasses.length} classes to ${outputPath}`);

    totalClasses += allClasses.length;
  }

  console.log(`\n=== Parse complete: ${totalClasses} classes across ${businessDirs.length} projects ===`);
}

main().catch((err) => {
  console.error('Fatal error parsing classes:', err);
  process.exit(1);
});
