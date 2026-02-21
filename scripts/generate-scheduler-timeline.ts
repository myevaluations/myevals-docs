/**
 * generate-scheduler-timeline.ts
 *
 * Reads Schedulers.json enrichment + scheduler MDX timing tables to produce
 * static/scheduler-data.json for the SchedulerTimeline component.
 *
 * Usage: tsx scripts/generate-scheduler-timeline.ts
 */

import * as fs from 'fs/promises';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCHEDULERS_JSON = path.join(PROJECT_ROOT, 'generated', 'ai-enriched', 'dotnet', 'per-file', 'schedulers', 'Schedulers.json');
const SCHEDULERS_DOCS_DIR = path.join(PROJECT_ROOT, 'docs', 'dotnet-backend', 'schedulers');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'static', 'scheduler-data.json');

// Domain mapping for all 65 scheduler modules
const MODULE_TO_DOMAIN: Record<string, string> = {
  // Evaluations
  'Scheduler - APE (Annual Program Evaluation)': 'evaluations',
  'Scheduler - Auto-File Evaluations': 'evaluations',
  'Scheduler - CME Evaluation Reminder': 'evaluations',
  'Scheduler - Conference Evaluation Emails': 'evaluations',
  'Scheduler - Evaluation Reminder (Core)': 'evaluations',
  'Scheduler - FNP Evaluation Assignments': 'evaluations',
  'Scheduler - FNPDeleteDroppedCourseEvaluation': 'evaluations',
  'Scheduler - ManualAssignments': 'evaluations',
  'Scheduler - MidtermFinalEvaluationReminderFacultyPrecep': 'evaluations',
  'Scheduler - MilestoneScores': 'evaluations',
  'Scheduler - PIPReEvaluation': 'evaluations',
  // Duty Hours
  'Scheduler - Duty Hours Logging Reminder': 'duty-hours',
  'Scheduler - Duty Hours Verification Reminder': 'duty-hours',
  'Scheduler - OnCallAutoAssignment': 'duty-hours',
  // Clinical
  'Scheduler - FNPClinicalLogsReminder': 'clinical',
  'Scheduler - FNPStudentLogReview': 'clinical',
  'Scheduler - ImportPatientPulse': 'clinical',
  'Scheduler - InitiateProcedureMVCApplication': 'clinical',
  'Scheduler - Patient Log Reminder': 'clinical',
  'Scheduler - PatientLog': 'clinical',
  'Scheduler - PatientName': 'clinical',
  'Scheduler - PracticumHours': 'clinical',
  'Scheduler - Procedure Log Reminder': 'clinical',
  'Scheduler - StudentReviewLog': 'clinical',
  // Communication
  'Scheduler - ApplicationEmails': 'communication',
  'Scheduler - ConferenceReminders': 'communication',
  'Scheduler - GenerateCourseInstructorWeeklyNotifications': 'communication',
  'Scheduler - InboxReminder': 'communication',
  'Scheduler - MailDistribution': 'communication',
  'Scheduler - MailgunService': 'communication',
  'Scheduler - MailgunWebhookService': 'communication',
  'Scheduler - NotificationService': 'communication',
  // License
  'Scheduler - BNDD License Reminder': 'license',
  'Scheduler - Certificate Expiration Reminder': 'license',
  'Scheduler - DEA License Reminder': 'license',
  'Scheduler - LiabilityInsReminder': 'license',
  'Scheduler - LicenseReminders': 'license',
  'Scheduler - StateLicenseReminders': 'license',
  // Compliance
  'Scheduler - Accreditation Compliance': 'compliance',
  'Scheduler - Affiliate Agreement Notices': 'compliance',
  'Scheduler - Contract Expiration Notice': 'compliance',
  'Scheduler - RotationRequirements': 'compliance',
  // Learning
  'Scheduler - Curricula Email Notifications': 'learning',
  'Scheduler - FNPImmersionNotification': 'learning',
  'Scheduler - Learning Assignments Reminder': 'learning',
  'Scheduler - OnboardingAssignmentReminder': 'learning',
  'Scheduler - QuizReminders': 'learning',
  // Data Integration
  'Scheduler - AmionScheduleUpdater': 'data-integration',
  'Scheduler - BSN Banner Integration': 'data-integration',
  'Scheduler - DevryArchiving': 'data-integration',
  'Scheduler - ExportBSNLogs': 'data-integration',
  'Scheduler - FNPFIleDownload': 'data-integration',
  'Scheduler - FNPSalesForceIntegration': 'data-integration',
  'Scheduler - ImportBannerLogsScheduler': 'data-integration',
  'Scheduler - ImportFNPBannerLogs': 'data-integration',
  'Scheduler - InCorrectSyncReminderToAdmins': 'data-integration',
  'Scheduler - SalesForceIntegration': 'data-integration',
  'Scheduler - TangierScheduleSync': 'data-integration',
  // Admin
  'Scheduler - Excused Rotation Auto-Populate': 'admin',
  'Scheduler - File to Binary Conversion': 'admin',
  'Scheduler - SSNEncryption': 'admin',
  'Scheduler - SignatureDocuments': 'admin',
  'Scheduler - SystemComments (AI/MyInsights)': 'admin',
  'Scheduler - User Data Encryption': 'admin',
  'Scheduler - UserArchiving': 'admin',
};

// Domain → doc URL
const DOMAIN_TO_DOC_URL: Record<string, string> = {
  evaluations: '/docs/dotnet-backend/schedulers/evaluation-schedulers',
  'duty-hours': '/docs/dotnet-backend/schedulers/duty-hours-schedulers',
  clinical: '/docs/dotnet-backend/schedulers/clinical-schedulers',
  communication: '/docs/dotnet-backend/schedulers/communication-schedulers',
  license: '/docs/dotnet-backend/schedulers/license-schedulers',
  compliance: '/docs/dotnet-backend/schedulers/admin-schedulers',
  learning: '/docs/dotnet-backend/schedulers/learning-schedulers',
  'data-integration': '/docs/dotnet-backend/schedulers/data-integration-schedulers',
  admin: '/docs/dotnet-backend/schedulers/admin-schedulers',
};

// Manual timing overrides for schedulers whose names don't fuzzy-match MDX entries
// These are sourced directly from the scheduler MDX timing tables
const MANUAL_TIMING: Record<string, TimingInfo> = {
  // Duty Hours
  'Scheduler - Duty Hours Logging Reminder': { frequency: 'daily-am', timeLabel: 'Daily at 10:00 AM', hour: 10, minute: 0 },
  'Scheduler - Duty Hours Verification Reminder': { frequency: 'daily-am', timeLabel: 'Daily at 10:00 AM', hour: 10, minute: 0 },
  // Learning
  'Scheduler - Learning Assignments Reminder': { frequency: 'daily-am', timeLabel: 'Daily at 7:00 AM', hour: 7, minute: 0 },
  'Scheduler - QuizReminders': { frequency: 'daily-am', timeLabel: 'Daily at 6:00 AM', hour: 6, minute: 0 },
  'Scheduler - Curricula Email Notifications': { frequency: 'daily-am', timeLabel: 'Daily at 7:00 AM', hour: 7, minute: 0 },
  // License
  'Scheduler - BNDD License Reminder': { frequency: 'daily-am', timeLabel: 'Daily at 6:00 AM', hour: 6, minute: 0 },
  'Scheduler - DEA License Reminder': { frequency: 'daily-am', timeLabel: 'Daily at 5:00 AM', hour: 5, minute: 0 },
  'Scheduler - LicenseReminders': { frequency: 'daily-am', timeLabel: 'Daily at 6:00 AM', hour: 6, minute: 0 },
  'Scheduler - StateLicenseReminders': { frequency: 'daily-am', timeLabel: 'Daily at 6:00 AM', hour: 6, minute: 0 },
  'Scheduler - Certificate Expiration Reminder': { frequency: 'weekly', timeLabel: 'Weekly (Monday 7:00 AM)', hour: 7, minute: 0 },
  'Scheduler - LiabilityInsReminder': { frequency: 'weekly', timeLabel: 'Weekly (Monday 7:00 AM)', hour: 7, minute: 0 },
  // Data Integration
  'Scheduler - AmionScheduleUpdater': { frequency: 'interval', timeLabel: 'Every 6 hours', hour: 0, minute: 0 },
  'Scheduler - TangierScheduleSync': { frequency: 'daily-am', timeLabel: 'Daily at 1:00 AM', hour: 1, minute: 0 },
  'Scheduler - SalesForceIntegration': { frequency: 'daily-am', timeLabel: 'Daily at 2:00 AM', hour: 2, minute: 0 },
  'Scheduler - FNPSalesForceIntegration': { frequency: 'daily-am', timeLabel: 'Daily at 2:00 AM', hour: 2, minute: 0 },
  'Scheduler - ImportBannerLogsScheduler': { frequency: 'daily-am', timeLabel: 'Daily at 3:00 AM', hour: 3, minute: 0 },
  'Scheduler - ImportFNPBannerLogs': { frequency: 'daily-am', timeLabel: 'Daily at 3:00 AM', hour: 3, minute: 0 },
  // Clinical
  'Scheduler - Procedure Log Reminder': { frequency: 'daily-am', timeLabel: 'Daily at 8:00 AM', hour: 8, minute: 0 },
  'Scheduler - FNPClinicalLogsReminder': { frequency: 'daily-am', timeLabel: 'Daily at 8:00 AM', hour: 8, minute: 0 },
  // Evaluation
  'Scheduler - MilestoneScores': { frequency: 'nightly', timeLabel: 'Nightly at 11:00 PM', hour: 23, minute: 0 },
  'Scheduler - APE (Annual Program Evaluation)': { frequency: 'daily-am', timeLabel: 'Daily at 6:00 AM', hour: 6, minute: 0 },
  'Scheduler - Auto-File Evaluations': { frequency: 'daily-am', timeLabel: 'Daily at 2:00 AM', hour: 2, minute: 0 },
  // Communication
  'Scheduler - MailDistribution': { frequency: 'daily-am', timeLabel: 'Daily at 7:00 AM', hour: 7, minute: 0 },
  'Scheduler - NotificationService': { frequency: 'interval', timeLabel: 'Every 15 minutes', hour: -1, minute: 0 },
  'Scheduler - InboxReminder': { frequency: 'daily-am', timeLabel: 'Daily at 7:00 AM', hour: 7, minute: 0 },
  // Admin
  'Scheduler - UserArchiving': { frequency: 'daily-am', timeLabel: 'Daily at 1:00 AM', hour: 1, minute: 0 },
  'Scheduler - SSNEncryption': { frequency: 'daily-am', timeLabel: 'Daily at 3:00 AM', hour: 3, minute: 0 },
  'Scheduler - User Data Encryption': { frequency: 'daily-am', timeLabel: 'Daily at 3:00 AM', hour: 3, minute: 0 },
};

interface TimingInfo {
  frequency: string;
  timeLabel: string;
  hour: number;
  minute: number;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '') // remove parentheticals
    .replace(/[-\s_]+/g, '');      // remove spaces/hyphens/underscores
}

function parseTimingFromLabel(timeLabel: string): { frequency: string; hour: number; minute: number } {
  const label = timeLabel.toLowerCase();

  let hour = -1;
  let minute = 0;
  let frequency = 'unknown';

  // Extract time (e.g., "6:00 AM", "11:00 PM", "midnight")
  const timeMatch = label.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (timeMatch) {
    hour = parseInt(timeMatch[1]);
    minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    if (timeMatch[3] === 'pm' && hour !== 12) hour += 12;
    if (timeMatch[3] === 'am' && hour === 12) hour = 0;
  } else if (label.includes('midnight')) {
    hour = 0; minute = 0;
  }

  // Determine frequency category
  if (label.includes('every 15') || label.includes('every 30') || label.includes('every 2 hour') || label.includes('every 4 hour') || label.includes('every 6 hour')) {
    frequency = 'interval';
  } else if (label.includes('nightly')) {
    frequency = 'nightly';
  } else if (label.includes('daily')) {
    frequency = hour < 12 ? 'daily-am' : 'daily-pm';
  } else if (label.includes('weekly')) {
    frequency = 'weekly';
  } else if (label.includes('monthly')) {
    frequency = 'monthly';
  }

  return { frequency, hour, minute };
}

async function extractTimingFromMdx(): Promise<Map<string, TimingInfo>> {
  const timingMap = new Map<string, TimingInfo>();

  const mdxFiles = (await fs.readdir(SCHEDULERS_DOCS_DIR))
    .filter((f) => f.endsWith('.mdx') && f !== 'index.mdx');

  for (const mdxFile of mdxFiles) {
    const content = await fs.readFile(path.join(SCHEDULERS_DOCS_DIR, mdxFile), 'utf-8');

    // Match table rows: | SchedulerName | TimeLabel | Purpose |
    // Pattern: | [Name](#anchor) | Frequency | Purpose |
    const rowPattern = /\|\s*\[([^\]]+)\](?:\([^)]+\))?\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/g;
    let match;
    while ((match = rowPattern.exec(content)) !== null) {
      const rawName = match[1].trim();
      const timeLabel = match[2].trim();

      // Skip header rows
      if (rawName.toLowerCase() === 'scheduler' || timeLabel.toLowerCase() === 'frequency') continue;
      // Skip separator rows
      if (timeLabel.includes('---')) continue;

      const { frequency, hour, minute } = parseTimingFromLabel(timeLabel);
      if (frequency !== 'unknown') {
        timingMap.set(normalize(rawName), { frequency, timeLabel, hour, minute });
      }
    }

    // Also match **Frequency:** lines (detail sections)
    const freqPattern = /\*\*Frequency:\*\*\s*(.+)/g;
    while ((match = freqPattern.exec(content)) !== null) {
      // Find nearest preceding heading
      const headingBefore = content.slice(0, match.index).match(/###\s+(.+)$/m);
      if (headingBefore) {
        const name = normalize(headingBefore[1].trim());
        const timeLabel = match[1].trim();
        const { frequency, hour, minute } = parseTimingFromLabel(timeLabel);
        if (frequency !== 'unknown' && !timingMap.has(name)) {
          timingMap.set(name, { frequency, timeLabel, hour, minute });
        }
      }
    }
  }

  return timingMap;
}

function deriveName(module: string): string {
  // Strip "Scheduler - " prefix
  return module.replace(/^Scheduler\s*-\s*/, '').trim();
}

async function main() {
  // Step 1: Read Schedulers.json and group by module
  const raw = await fs.readFile(SCHEDULERS_JSON, 'utf-8');
  const schedulersData: {
    files: Array<{
      filePath: string;
      fileName: string;
      fileType: string;
      module: string;
      summary: string;
      businessPurpose: string;
      complexity: string;
      migrationRelevance: string;
      lineCount: number;
    }>;
  } = JSON.parse(raw);

  // Group by module
  const moduleMap = new Map<string, typeof schedulersData.files>();
  for (const file of schedulersData.files) {
    const existing = moduleMap.get(file.module) || [];
    existing.push(file);
    moduleMap.set(file.module, existing);
  }

  // Step 2: Extract timing from MDX files
  const timingMap = await extractTimingFromMdx();
  console.log(`Extracted ${timingMap.size} timing entries from MDX files`);

  // Step 3: Build scheduler records
  const schedulers = [];

  for (const [module, files] of moduleMap) {
    const name = deriveName(module);
    const domain = MODULE_TO_DOMAIN[module] || 'admin';
    const docUrl = DOMAIN_TO_DOC_URL[domain] || '/docs/dotnet-backend/schedulers/index';

    // Pick primary file: prefer entry-point or service, else first
    const primary = files.find((f) => f.fileType === 'entry-point' || f.fileType === 'service') || files[0];

    const fileCount = files.length;
    const lineCount = files.reduce((s, f) => s + (f.lineCount || 0), 0);
    const complexity = primary.complexity;
    const migrationRelevance = primary.migrationRelevance;
    const purpose = primary.businessPurpose || primary.summary || '';

    // Check manual timing override first
    let timing: TimingInfo | undefined = MANUAL_TIMING[module];

    // Fuzzy match against MDX timing
    if (!timing) {
      const normalizedName = normalize(name);
      timing = timingMap.get(normalizedName);

      // Try partial matching if direct match fails
      if (!timing) {
        for (const [key, val] of timingMap) {
          if (key.includes(normalizedName) || normalizedName.includes(key)) {
            timing = val;
            break;
          }
        }
      }
    }

    // Fallback: scan summary text for time patterns
    if (!timing) {
      const summaryLower = (primary.summary + ' ' + primary.businessPurpose).toLowerCase();
      const timeMatch = summaryLower.match(/(\d{1,2}(?::\d{2})?(?:\s*[ap]m)?)\s*(daily|nightly|weekly|monthly|every)/);
      if (timeMatch) {
        const { frequency, hour, minute } = parseTimingFromLabel(timeMatch[0]);
        if (frequency !== 'unknown') {
          timing = { frequency, timeLabel: timeMatch[0], hour, minute };
        }
      }
    }

    schedulers.push({
      name,
      module,
      domain,
      frequency: timing?.frequency || 'unknown',
      hour: timing?.hour ?? -1,
      minute: timing?.minute ?? 0,
      timeLabel: timing?.timeLabel || 'Unknown schedule',
      purpose,
      complexity,
      migrationRelevance,
      fileCount,
      lineCount,
      docUrl,
      timingSource: timing ? 'mdx-table' : 'unknown',
    });
  }

  // Sort: known timing first, then by hour, then alpha
  schedulers.sort((a, b) => {
    if (a.hour >= 0 && b.hour < 0) return -1;
    if (a.hour < 0 && b.hour >= 0) return 1;
    if (a.hour !== b.hour) return a.hour - b.hour;
    return a.name.localeCompare(b.name);
  });

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(schedulers, null, 2));

  const withTiming = schedulers.filter((s) => s.hour >= 0).length;
  console.log(`✅ Wrote ${schedulers.length} schedulers to static/scheduler-data.json`);
  console.log(`   ${withTiming} with known timing, ${schedulers.length - withTiming} unknown`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
