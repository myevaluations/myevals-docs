const fs = require('fs');
const path = require('path');

const BASE = '/home/skonudula/projects/myevaluations/myevals-docs';
const GENERATED = path.join(BASE, 'generated');

function getComplexity(lineCount) {
  if (lineCount < 30) return 'trivial';
  if (lineCount <= 100) return 'simple';
  if (lineCount <= 300) return 'moderate';
  if (lineCount <= 1000) return 'complex';
  return 'very-complex';
}

function getFileType(fileName, baseClass) {
  if (fileName.endsWith('.ashx.cs')) return 'handler';
  if (fileName.endsWith('.ascx.cs')) return 'user-control';
  if (fileName.endsWith('.aspx.cs')) return 'code-behind';
  return 'class';
}

function getMigrationRelevance(lineCount, methods, businessModuleRefs) {
  if (lineCount > 500) return 'high';
  if (lineCount > 200) return 'medium';
  if (lineCount > 50) return 'low';
  return 'none';
}

function extractSPs(methods) {
  // stored procedures are typically not visible from code-behinds, they're in business layer
  return [];
}

function extractBusinessManagers(className, methods, businessModuleRefs) {
  const managers = [];
  const methStr = methods.join(',');
  if (methStr.includes('MainPageBusiness') || methStr.includes('objMainPageBusiness')) managers.push('MainPageBusiness');
  if (methStr.includes('DocDetailsBusiness') || methStr.includes('objDocDetails') || methStr.includes('docDetailsBusiness')) managers.push('DocDetailsBusiness');
  if (methStr.includes('UserManager') || methStr.includes('userManager')) managers.push('UserManager');
  if (methStr.includes('FNPInfoBusiness') || methStr.includes('_fnpLogBusiness')) managers.push('FNPInfoBusiness');
  if (methStr.includes('DNPInfoBusiness') || methStr.includes('_dnpLogBusiness')) managers.push('DNPInfoBusiness');
  if (methStr.includes('FNPLogManager') || methStr.includes('_fNPLogManager')) managers.push('FNPLogManager');
  if (methStr.includes('DNPLogManager')) managers.push('DNPLogManager');
  if (methStr.includes('DesignQuizManager')) managers.push('DesignQuizManager');
  if (methStr.includes('PreceptorManager')) managers.push('PreceptorManager');
  if (methStr.includes('ManageQuizAssignmentsBusiness')) managers.push('ManageQuizAssignmentsBusiness');
  if (methStr.includes('LearningAssignmentManager')) managers.push('LearningAssignmentManager');
  if (methStr.includes('AnnualProgramEvaluationBusiness')) managers.push('AnnualProgramEvaluationBusiness');
  if (methStr.includes('AnnualProgramEvaluationManager')) managers.push('AnnualProgramEvaluationManager');
  if (methStr.includes('DepartmentManager')) managers.push('DepartmentManager');
  if (methStr.includes('TemplateInfo')) managers.push('TemplateInfo');
  if (methStr.includes('CourseInfo')) managers.push('CourseInfo');
  if (methStr.includes('PatientLogManager')) managers.push('PatientLogManager');
  if (methStr.includes('ProceduresManager')) managers.push('ProceduresManager');
  if (methStr.includes('FieldsLookupManager')) managers.push('FieldsLookupManager');
  if (methStr.includes('AssignmentUsersManager')) managers.push('AssignmentUsersManager');
  // Also check businessModuleRefs for common patterns
  return [...new Set(managers)];
}

// =============== MyPortfolio Enrichment ===============
function enrichMyPortfolio() {
  const meta = require(path.join(GENERATED, 'dotnet-metadata/web-files/MyPortfolio.json'));

  const descriptions = {
    'AccredComplianceEmailsAdmin.aspx.cs': { summary: 'Admin page for managing accreditation compliance email notification recipients. Allows adding/removing administrators from the notification list for accreditation compliance alerts.', businessPurpose: 'Configures which administrators receive accreditation compliance email notifications by department', migrationRelevance: 'medium', migrationNote: 'Email notification configuration should move to a settings API endpoint' },
    'AccreditationComplianceEmailNotice.aspx.cs': { summary: 'Minimal code-behind that initializes the accreditation compliance email notice view. Delegates to DocDetailsBusiness for rendering.', businessPurpose: 'Displays accreditation compliance email notice content', migrationRelevance: 'low', migrationNote: 'Simple view initialization, low complexity' },
    'AccreditationComplianceResults.aspx.cs': { summary: 'Displays accreditation compliance results in a grid with export capability. Supports row-level data binding and selective row export for accreditation documentation.', businessPurpose: 'Presents accreditation compliance audit results for program review with export functionality', migrationRelevance: 'medium', migrationNote: 'Report results page with grid export; migrate to React report component' },
    'AddACGMEDefinations.aspx.cs': { summary: 'Page for adding and managing ACGME (Accreditation Council for Graduate Medical Education) competency definitions. Provides add and create new record functionality with permission checks.', businessPurpose: 'Allows administrators to define ACGME competency definitions for residency program accreditation tracking', migrationRelevance: 'medium', migrationNote: 'ACGME definitions CRUD should move to a portfolio API endpoint' },
    'AddAccreditationDocument.aspx.cs': { summary: 'Complex form for managing accreditation documentation including document upload, citation management, letter of notification editing, and document lifecycle (create/delete/restore). Handles both add and edit modes with encrypted query string parameters.', businessPurpose: 'Central page for creating and editing accreditation documentation records with associated citations and file attachments for GME program compliance', migrationRelevance: 'high', migrationNote: 'Core accreditation document management - high priority for migration with file upload and citation workflows' },
    'AddAffiliateAgreementDocument.aspx.cs': { summary: 'Manages affiliate agreement documents with upload, download, delete capabilities. Includes campus name binding, sponsoring status management, and encrypted query string handling for secure parameter passing.', businessPurpose: 'Creates and edits affiliate/institutional agreement documents for training program partnerships', migrationRelevance: 'medium', migrationNote: 'Affiliate agreement CRUD with file management; migrate to document upload API' },
    'AddCertificates.aspx.cs': { summary: 'Page for adding and managing certification documents in the portfolio. Supports file upload, download, and encrypted parameter handling for document details.', businessPurpose: 'Manages trainee and faculty certification records (licenses, board certifications) in their portfolio', migrationRelevance: 'low', migrationNote: 'Standard document CRUD pattern; relatively simple migration' },
    'AddComplianceCorrespondence.aspx.cs': { summary: 'Add page for compliance correspondence documentation. Handles file upload with validation for compliance-related communications.', businessPurpose: 'Records compliance correspondence documents between programs and accrediting bodies', migrationRelevance: 'low', migrationNote: 'Simple file upload and document creation pattern' },
    'AddDocumentSettings.aspx.cs': { summary: 'Complex administrative page for managing portfolio document settings at the department level. Dynamically creates HTML tables for document subjects with current/deleted views, supports adding new rows, and manages scholarly activity subject mappings.', businessPurpose: 'Configures department-level document settings and scholarly activity subject categories for the portfolio module', migrationRelevance: 'high', migrationNote: 'Complex dynamic grid configuration page with department settings; needs careful migration of dynamic table generation' },
    'AddEmployeHelath.aspx.cs': { summary: 'Page for adding employee health documents to the portfolio. Supports file upload, download, and document management with permission checks.', businessPurpose: 'Tracks employee health records and documentation (immunizations, health screenings) in the portfolio', migrationRelevance: 'low', migrationNote: 'Standard document CRUD pattern with file operations' },
    'AddGeneralDocumentation.aspx.cs': { summary: 'Add page for general documentation records in the portfolio. Supports custom validation, file upload, and encrypted ID handling with multiple document subject categories.', businessPurpose: 'Manages miscellaneous general documentation in a trainee or faculty portfolio', migrationRelevance: 'low', migrationNote: 'Standard portfolio document CRUD' },
    'AddLearningAppraisalandPlan.aspx.cs': { summary: 'Page for adding learning appraisal and plan entries to the portfolio. Supports category-based learning plans with checkbox filtering and document management.', businessPurpose: 'Records learning appraisal plans and goals for trainees as part of their educational portfolio', migrationRelevance: 'medium', migrationNote: 'Learning plan management ties into competency tracking' },
    'AddLearningAssignments.aspx.cs': { summary: 'Manages learning assignment entries in the portfolio including module selection, video content viewing, and quiz assignments. Supports learning module dropdown changes and regex-based content processing.', businessPurpose: 'Assigns and tracks learning modules, videos, and quizzes for trainees in their educational portfolio', migrationRelevance: 'medium', migrationNote: 'Learning assignment management with video/quiz integration; ties into LMS functionality' },
    'AddMoonlightingHistory.aspx.cs': { summary: 'Page for adding moonlighting history records to the portfolio. Includes key code validation and SuperForm mode management for add/edit operations.', businessPurpose: 'Records resident moonlighting (outside employment) activities for compliance tracking', migrationRelevance: 'low', migrationNote: 'Standard CRUD for moonlighting records' },
    'AddNotes.aspx.cs': { summary: 'Simple page for adding notes to the portfolio. Supports creating note entries with document details and encrypted parameter handling.', businessPurpose: 'Allows administrators to add notes and comments to a trainee portfolio', migrationRelevance: 'low', migrationNote: 'Simple notes CRUD' },
    'AddPaperBasedEvaluations.aspx.cs': { summary: 'Page for adding paper-based evaluation records to the portfolio. Includes custom validation and file upload for scanning paper evaluations.', businessPurpose: 'Digitizes and tracks paper-based evaluation forms in the electronic portfolio', migrationRelevance: 'low', migrationNote: 'Legacy paper evaluation scanning; lower priority for migration' },
    'AddPersonalObjectsandGoals.aspx.cs': { summary: 'Page for adding personal objectives and goals to the portfolio. Supports category-based goals with checkbox filtering and document management.', businessPurpose: 'Records personal learning objectives and goals for trainees as part of competency development', migrationRelevance: 'medium', migrationNote: 'Personal goals management ties into competency tracking' },
    'AddPreviousTrainingHistory.aspx.cs': { summary: 'Page for recording previous training history (pre-current-program). Includes PGY level binding and prior institution details.', businessPurpose: 'Documents prior training history for residents and fellows before entering the current program', migrationRelevance: 'low', migrationNote: 'Historical data entry; straightforward migration' },
    'AddProgramHistory.aspx.cs': { summary: 'Complex form for managing program history records in the portfolio. Handles institute/program cascading dropdowns, user manager lookups, and multiple edit modes for tracking training program movements.', businessPurpose: 'Tracks the complete training program history of residents and fellows across institutions and programs', migrationRelevance: 'high', migrationNote: 'Core program history tracking with institution/program relationships; critical for trainee record management' },
    'AddQuizAssignments.aspx.cs': { summary: 'Simple page for adding quiz assignment records to the portfolio. Basic add functionality with permission checks.', businessPurpose: 'Records quiz completion and assignment details in the trainee portfolio', migrationRelevance: 'low', migrationNote: 'Simple CRUD for quiz assignment records' },
    'AddScholarlyActivitiesDocument.aspx.cs': { summary: 'Complex form for managing scholarly activity documents including publications, research, and presentations. Supports file upload, user binding, topic category management (add/edit/delete/restore), and document domain classification with multiple dropdown cascading.', businessPurpose: 'Manages scholarly activity documentation (research, publications, presentations) with topic categorization for academic portfolio tracking', migrationRelevance: 'high', migrationNote: 'Complex scholarly activity CRUD with topic category management; important for academic tracking migration' },
    'AddSpecialMedicalActivity.aspx.cs': { summary: 'Page for adding Temporary Special Medical Activity (TSMA) history records. Similar to moonlighting with key code validation and SuperForm mode management.', businessPurpose: 'Records temporary special medical activities that trainees participate in outside their regular duties', migrationRelevance: 'low', migrationNote: 'Standard CRUD pattern similar to moonlighting' },
    'AddSpouseDependantEmergency.aspx.cs': { summary: 'Page for managing spouse, dependant, and emergency contact information in the portfolio.', businessPurpose: 'Records family and emergency contact details for trainees and faculty', migrationRelevance: 'low', migrationNote: 'Personal data CRUD; straightforward migration' },
    'AddStipendsDocument.aspx.cs': { summary: 'Page for managing stipend records including date calculations, key code validation for currency fields, and stipend level dropdown management with SuperForm mode switching.', businessPurpose: 'Tracks trainee stipend/salary information including amounts, levels, and effective dates', migrationRelevance: 'medium', migrationNote: 'Financial tracking for stipends; sensitive data that needs careful migration' },
    'AddSupplimentalPayment.aspx.cs': { summary: 'Page for adding supplemental payment records to the portfolio. Includes key code validation for currency input fields.', businessPurpose: 'Records supplemental payments beyond base stipend for trainees', migrationRelevance: 'low', migrationNote: 'Simple financial record CRUD' },
    'AddSurveryPerformance.aspx.cs': { summary: 'Complex form for managing survey performance records with concern tracking, survey source and category management (add/edit/delete/restore), and document upload. Supports dynamic dropdown cascading and grid data binding for survey data.', businessPurpose: 'Tracks accreditation survey performance including concerns, survey sources, and categories for program evaluation', migrationRelevance: 'high', migrationNote: 'Complex survey management with nested CRUD for sources/categories; important for accreditation tracking' },
    'AddTrainingCommentsHistory.aspx.cs': { summary: 'Page for adding training comments and history notes to the portfolio. Simple form with permission checks and encrypted parameter handling.', businessPurpose: 'Records training-related comments and annotations for trainees', migrationRelevance: 'low', migrationNote: 'Simple CRUD for training comments' },
    'AddTrainingGapHistory.aspx.cs': { summary: 'Page for recording training gap/leave of absence history. Includes PGY level binding, date validation, and leave type selection.', businessPurpose: 'Documents gaps in training or leaves of absence for residents and fellows', migrationRelevance: 'low', migrationNote: 'Training gap tracking; connects to program history' },
    'AddTransferDocumentation.aspx.cs': { summary: 'Page for adding transfer documentation when trainees move between programs. Supports file upload with custom validation and document management.', businessPurpose: 'Documents trainee transfers between training programs with supporting documentation', migrationRelevance: 'low', migrationNote: 'Transfer document CRUD; connects to program history' },
    'AddUniformsInventory.aspx.cs': { summary: 'Page for managing uniforms and inventory records for trainees. Includes SuperForm mode management for add/edit operations.', businessPurpose: 'Tracks uniform and equipment inventory assigned to trainees', migrationRelevance: 'none', migrationNote: 'Low-priority inventory tracking; may not need migration' },
    'AffiliateAgreementEamilNotice.aspx.cs': { summary: 'Minimal code-behind that initializes the affiliate agreement email notice view. Delegates to DocDetailsBusiness for rendering.', businessPurpose: 'Displays affiliate agreement email notification content', migrationRelevance: 'none', migrationNote: 'Simple email notice initialization' },
    'AffiliateAgreementsComplianceEmailsAdmin.aspx.cs': { summary: 'Admin page for managing affiliate agreements compliance email recipients. Mirror of AccredComplianceEmailsAdmin but for affiliate agreements, allowing add/remove of administrators for notification lists by department.', businessPurpose: 'Configures which administrators receive affiliate agreement compliance email notifications', migrationRelevance: 'medium', migrationNote: 'Email notification configuration for affiliate agreements' },
    'AffiliateAgreementsResults.aspx.cs': { summary: 'Displays affiliate agreement results with multi-level repeaters for sponsor names, sub-sponsors, participants, and rotations. Includes CSV export functionality and grid row data binding with export filtering.', businessPurpose: 'Presents a comprehensive view of affiliate agreement details including sponsoring institutions, participants, and rotation sites', migrationRelevance: 'medium', migrationNote: 'Complex report with nested repeaters and CSV export; needs React component migration' },
    'CEMDDepartmentReport.aspx.cs': { summary: 'Report parameter page for Curricula, Evaluations, and Milestones/Definitions (CEMD) department reporting. Binds subjects, rotations, and date range selection.', businessPurpose: 'Configures parameters for generating department-level curricula and evaluation reports', migrationRelevance: 'medium', migrationNote: 'Report parameter page; migrate with reporting module' },
    'Changephoto.aspx.cs': { summary: 'Photo upload and management page with image cropping, resizing, and format validation. Supports profile photo upload with file type/size validation and image manipulation.', businessPurpose: 'Allows users to upload, crop, and manage their profile photograph in the portfolio', migrationRelevance: 'medium', migrationNote: 'Image upload/crop needs modern React image handling component' },
    'CirriculaDetailsResult.aspx.cs': { summary: 'Displays curricula department report results with loading screen support, nested repeaters for curricula data, and grid row binding for policies and documentation.', businessPurpose: 'Presents curricula compliance results at the department level with detailed breakdown by rotation', migrationRelevance: 'medium', migrationNote: 'Complex report results with loading screen and nested data' },
    'CirriculaVideoDetailsResult.aspx.cs': { summary: 'Displays curricula video report results in a grid format. Simple report output with permission checks and grid row data binding.', businessPurpose: 'Shows curricula video assignment results for department review', migrationRelevance: 'low', migrationNote: 'Simple report results grid' },
    'CirriculaVideoEdit.aspx.cs': { summary: 'Edit page for curricula video content with video upload capability, session management, and email notification for team updates. Handles video file operations and metadata updates.', businessPurpose: 'Manages curricula video content editing, uploading new videos, and notifying the team of updates', migrationRelevance: 'medium', migrationNote: 'Video upload and management; needs modern file handling and email notification migration' },
    'CitationHistoryDetails.aspx.cs': { summary: 'View page for citation history details with permission checks and encrypted parameter handling. Displays historical citation data for accreditation tracking.', businessPurpose: 'Shows detailed history of accreditation citations for audit and tracking purposes', migrationRelevance: 'low', migrationNote: 'Read-only history view' },
    'ComplianceCorrespondenceResults.aspx.cs': { summary: 'Displays compliance correspondence report results in a grid. Simple report with permission checks and row data binding.', businessPurpose: 'Presents compliance correspondence records in a tabular format for review', migrationRelevance: 'low', migrationNote: 'Simple report results grid' },
    'ConcernHistoryDetails.aspx.cs': { summary: 'Minimal view page for concern history details. Only contains permission checks with no additional business logic.', businessPurpose: 'Displays concern history details related to survey performance', migrationRelevance: 'none', migrationNote: 'Minimal view page' },
    'ContractDetails.aspx.cs': { summary: 'View page for contract details with file download capability. Displays contract information with download/view actions and encrypted navigation.', businessPurpose: 'Shows detailed view of trainee contracts with document download functionality', migrationRelevance: 'low', migrationNote: 'Contract detail view with file download' },
    'ContractEmailNotice.aspx.cs': { summary: 'Minimal code-behind that initializes contract email notification view. Delegates to DocDetailsBusiness for rendering.', businessPurpose: 'Displays contract-related email notification content', migrationRelevance: 'none', migrationNote: 'Simple email notice initialization' },
    'CurriculaDocumentDetails.aspx.cs': { summary: 'View page for curricula document details with download and file viewing capability. Shows document content with navigation controls.', businessPurpose: 'Displays detailed view of curricula documents with download options', migrationRelevance: 'low', migrationNote: 'Document detail view with file operations' },
    'CurriculaDocumentEdit.aspx.cs': { summary: 'Edit page for curricula documents with file upload, rotation selection dropdown cascading, and grid data binding for curricula/evaluation measures. Supports document update and deletion.', businessPurpose: 'Edits curricula document records including rotation assignments and evaluation measure associations', migrationRelevance: 'medium', migrationNote: 'Curricula document editing with rotation and evaluation linkage' },
    'CurriculaVideoDetails.aspx.cs': { summary: 'View page for curricula video details with video playback, download, and file viewing capabilities. Includes permission checks and navigation.', businessPurpose: 'Displays curricula video content with playback and download options for educational content', migrationRelevance: 'low', migrationNote: 'Video detail view; needs modern video player component' },
    'DepartmentReport.aspx.cs': { summary: 'Report parameter configuration page for portfolio department reports. Supports date range selection, detailed/summary toggle, section type selection, and ACGME format options.', businessPurpose: 'Configures parameters for generating department-level portfolio reports with multiple format options', migrationRelevance: 'medium', migrationNote: 'Report parameter page; migrate with reporting module' },
    'DepartmentResults.aspx.cs': { summary: 'Minimal code-behind with only Page_Load handler for department results display. All logic likely in ASPX markup or client-side.', businessPurpose: 'Displays department report results', migrationRelevance: 'none', migrationNote: 'Minimal page, likely content in ASPX markup' },
    'DocumentDetails.aspx.cs': { summary: 'General document details view page with edit, download, view, and delete capabilities. Handles file operations with encrypted parameters and permission checks.', businessPurpose: 'Provides a unified document detail view with CRUD operations for portfolio documents', migrationRelevance: 'medium', migrationNote: 'Reusable document detail pattern; good candidate for shared component' },
    'EditCitation.aspx.cs': { summary: 'Edit page for accreditation citations with program requirement and citation type dropdown cascading. Supports update and cancel operations.', businessPurpose: 'Edits individual accreditation citation records with program requirement and type classification', migrationRelevance: 'medium', migrationNote: 'Citation editing; part of accreditation documentation workflow' },
    'EditComplianceCorrespondence.aspx.cs': { summary: 'Edit page for compliance correspondence with file upload, download, and delete operations for correspondence documents. Includes grid data binding for document attachments.', businessPurpose: 'Edits compliance correspondence records with document attachment management', migrationRelevance: 'low', migrationNote: 'Compliance correspondence editing with file management' },
    'EditConcern.aspx.cs': { summary: 'Simple edit page for concern records related to survey performance. Supports update and cancel operations with permission checks.', businessPurpose: 'Edits survey performance concern entries for program improvement tracking', migrationRelevance: 'low', migrationNote: 'Simple concern editing form' },
    'EditDocumentDetails.aspx.cs': { summary: 'Complex edit page for various document types in the portfolio. Handles driving license state binding, multiple file upload scenarios, and school selection with specialized hidden button handlers for dynamic UI updates.', businessPurpose: 'Provides a multi-purpose document editing interface for various portfolio document types including licenses and professional documents', migrationRelevance: 'medium', migrationNote: 'Multi-purpose document editor; needs decomposition into specific document type forms' },
    'EmployeeHealthDemographicsReport.aspx.cs': { summary: 'Complex report page displaying employee health demographics with custom fields, loading screen, and multiple repeater sections for user details, demographics, licenses, degrees, contacts, tax, and military information. Includes dynamic custom field binding via DataView.', businessPurpose: 'Generates comprehensive employee health demographics reports with customizable fields for institutional compliance', migrationRelevance: 'high', migrationNote: 'Complex report with dynamic custom fields; needs careful migration of custom field rendering' },
    'ExaminationScores.aspx.cs': { summary: 'Simple parameter page for examination scores display with permission checks. Minimal code-behind with business logic delegated to MainPageBusiness.', businessPurpose: 'Provides entry point for viewing examination score records in the portfolio', migrationRelevance: 'low', migrationNote: 'Simple parameter page' },
    'ExaminationScoresResult.aspx.cs': { summary: 'Minimal code-behind with only Page_Load for examination score results. All rendering likely in ASPX markup.', businessPurpose: 'Displays examination score results', migrationRelevance: 'none', migrationNote: 'Minimal page, content likely in ASPX' },
    'GenDepartmentReport.aspx.cs': { summary: 'Complex general department report page with dynamic grid formatting based on ACGME format, nested foreach loops for building report structure, loading screen support, and Excel export with custom table row/cell formatting.', businessPurpose: 'Generates comprehensive department reports in various formats including ACGME format with Excel export capability', migrationRelevance: 'high', migrationNote: 'Complex department reporting with ACGME format; important for program evaluation migration' },
    'GeneralDemographicsResults.aspx.cs': { summary: 'Complex demographics report page nearly identical to EmployeeHealthDemographicsReport. Displays general demographics with custom fields, loading screen, and multiple sections for user details, licenses, degrees, contacts, tax, and military.', businessPurpose: 'Generates comprehensive general demographics reports with custom field support for institutional reporting', migrationRelevance: 'high', migrationNote: 'Very similar to EmployeeHealthDemographicsReport; should be consolidated during migration' },
    'GeneralDocumentationResult.aspx.cs': { summary: 'Displays general documentation report results in a grid with row data binding. Simple report output with permission checks.', businessPurpose: 'Presents general documentation records in a tabular report format', migrationRelevance: 'low', migrationNote: 'Simple report results grid' },
    'ImageViewPortfolio.aspx.cs': { summary: 'Minimal page for viewing portfolio profile images. Delegates to DocDetailsBusiness for image rendering.', businessPurpose: 'Renders portfolio profile images for display', migrationRelevance: 'none', migrationNote: 'Simple image rendering page' },
    'LearningAssignmentDetails.aspx.cs': { summary: 'Complex detail page for learning assignments with review workflow (submit/save/close/open), comment threading with CSS styling, quiz result tracking, page state management, and browser detection for form handling.', businessPurpose: 'Provides comprehensive view and review workflow for learning assignments including quiz performance and comment threads', migrationRelevance: 'high', migrationNote: 'Complex learning assignment review workflow with state management; critical for education module migration' },
    'MyPAssign.aspx.cs': { summary: 'Small utility page for portfolio assignment operations. Handles user business logic for portfolio assignment updates.', businessPurpose: 'Manages portfolio assignment for users', migrationRelevance: 'none', migrationNote: 'Small utility page' },
    'MyPortfolioMain.aspx.cs': { summary: 'Massive main portfolio page (9700+ lines) serving as the central hub for all portfolio functionality. Contains dozens of section handlers for demographics, program history, certifications, moonlighting, stipends, contracts, scholarly activities, accreditation, affiliate agreements, learning assignments, quality improvement, and more. Includes custom field management via XML, dynamic grid binding, file operations, and extensive section-level data management.', businessPurpose: 'Central portfolio management page providing comprehensive view and management of all trainee/faculty portfolio sections including demographics, training history, documents, scholarly activities, and accreditation records', migrationRelevance: 'high', migrationNote: 'Highest priority migration target - massive monolithic page that should be decomposed into dozens of smaller React components/pages. Contains critical business logic for the entire portfolio module.' },
    'MyPortfolioSummaryResults.aspx.cs': { summary: 'Complex summary report page displaying comprehensive portfolio summary with custom fields, user image display, and multiple grid sections for learning objectives, assignments, certificates, and medical organization memberships.', businessPurpose: 'Generates a comprehensive portfolio summary report for administrative review and verification', migrationRelevance: 'high', migrationNote: 'Summary report with custom fields and multiple sections; needs React report component' },
    'PersonalDocuments/CurriculaEmailNotice.aspx.cs': { summary: 'Minimal code-behind that initializes curricula email notice view. Delegates to DocDetailsBusiness for rendering.', businessPurpose: 'Displays curricula-related email notification content', migrationRelevance: 'none', migrationNote: 'Simple email notice initialization' },
    'PortfolioAddContracts.aspx.cs': { summary: 'Contract management page with add/edit modes using SuperForm, stipend level dropdown cascading with automatic amount calculation, training agreement document management, and WebMethod for program type code lookup.', businessPurpose: 'Creates and edits trainee contract/employment agreements with stipend level management and training agreement documents', migrationRelevance: 'high', migrationNote: 'Core contract management with stipend calculations; critical for HR/financial data migration' },
    'PortfolioDocumentEditEMN.aspx.cs': { summary: 'Edit page for Education Management News (EMN) portfolio documents with file upload and update capabilities.', businessPurpose: 'Edits education management news documents in the portfolio', migrationRelevance: 'low', migrationNote: 'Standard document edit pattern' },
    'PortfolioDocumentUpload.aspx.cs': { summary: 'General purpose document upload page for portfolio with file type validation, upload handling, and grid data binding for existing documents.', businessPurpose: 'Provides file upload interface for adding documents to portfolio sections', migrationRelevance: 'low', migrationNote: 'Generic file upload; needs modern upload component' },
    'PortfolioDocumentUploadEMN.aspx.cs': { summary: 'Upload page specifically for Education Management News documents with file upload and grid display of existing documents.', businessPurpose: 'Handles EMN document uploads for the portfolio', migrationRelevance: 'low', migrationNote: 'Specialized upload page for EMN documents' },
    'PortfolioMaintenance.aspx.cs': { summary: 'Administrative maintenance page for portfolio data cleanup and management operations. Provides tools for portfolio data integrity maintenance.', businessPurpose: 'Performs portfolio data maintenance operations for administrators', migrationRelevance: 'low', migrationNote: 'Admin maintenance tools; migrate to admin API endpoints' },
    'PrintDocumentResults.aspx.cs': { summary: 'Print-optimized page for portfolio document results. Formats document data for browser printing.', businessPurpose: 'Generates print-friendly views of portfolio document reports', migrationRelevance: 'low', migrationNote: 'Print view; needs CSS print media or PDF generation migration' },
    'PrintQIProjectDepartmentReport.aspx.cs': { summary: 'Print-optimized page for Quality Improvement project department reports. Formats QI project data for printing.', businessPurpose: 'Generates print-friendly Quality Improvement project department reports', migrationRelevance: 'low', migrationNote: 'Print view for QI reports' },
    'PrintQIProjects.aspx.cs': { summary: 'Print-optimized page for Quality Improvement projects. Formats QI project data for browser printing.', businessPurpose: 'Generates print-friendly views of individual Quality Improvement projects', migrationRelevance: 'low', migrationNote: 'Print view for QI projects' },
    'QIProjectDepartmentReport.aspx.cs': { summary: 'Report parameter page for Quality Improvement project department reports. Configures filters and options for QI reporting.', businessPurpose: 'Configures parameters for generating department-level QI project reports', migrationRelevance: 'medium', migrationNote: 'Report parameter page for QI module' },
    'QualityImprovementProjects.aspx.cs': { summary: 'Major management page for Quality Improvement (QI) projects with Annual Program Evaluation integration. Manages project lifecycle, user assignments, academic year selection, and integration with APE (Annual Program Evaluation) groups. Uses multiple business managers and complex state management.', businessPurpose: 'Comprehensive Quality Improvement project management including project creation, assignment, status tracking, and integration with annual program evaluation', migrationRelevance: 'high', migrationNote: 'Complex QI project management with APE integration; important for program evaluation migration' },
    'QualityImprovementProjectsDetails.aspx.cs': { summary: 'Detail view page for individual Quality Improvement projects with action items, status tracking, and project lifecycle management.', businessPurpose: 'Displays detailed view of QI projects including action items and progress tracking', migrationRelevance: 'medium', migrationNote: 'QI project detail view' },
    'QuizDetails.aspx.cs': { summary: 'Detail page for quiz assignment results and performance metrics. Displays quiz scores and completion status.', businessPurpose: 'Shows quiz performance details for learning assignment tracking', migrationRelevance: 'low', migrationNote: 'Quiz results detail view' },
    'RecordRotationResults.aspx.cs': { summary: 'Displays rotation record results in a grid format for training program rotation tracking.', businessPurpose: 'Shows rotation assignment records for trainees across training sites', migrationRelevance: 'medium', migrationNote: 'Rotation tracking results; important for program management migration' },
    'ReviewLearningAppraisalandPlan.aspx.cs': { summary: 'Review page for learning appraisal and plan entries with review workflow actions (approve/reject/comment).', businessPurpose: 'Allows faculty and administrators to review and approve trainee learning appraisal plans', migrationRelevance: 'medium', migrationNote: 'Learning plan review workflow' },
    'ReviewPersonalObjectsandGoals.aspx.cs': { summary: 'Review page for personal objectives and goals with review workflow actions.', businessPurpose: 'Allows faculty and administrators to review and approve trainee personal learning goals', migrationRelevance: 'medium', migrationNote: 'Personal goals review workflow' },
    'ScholarlyActivitiesDocumentDetails.aspx.cs': { summary: 'View page for scholarly activity document details with download and file viewing capabilities.', businessPurpose: 'Displays detailed view of scholarly activity documents (publications, research, presentations)', migrationRelevance: 'low', migrationNote: 'Document detail view for scholarly activities' },
    'ScholarlyActivitiesEditDocumentDetails.aspx.cs': { summary: 'Edit page for scholarly activity document details with file upload and metadata editing capabilities.', businessPurpose: 'Edits scholarly activity document records and metadata', migrationRelevance: 'medium', migrationNote: 'Scholarly activity document editing' },
    'ShowImage.aspx.cs': { summary: 'Utility page for displaying portfolio images with appropriate content-type headers.', businessPurpose: 'Renders portfolio images for inline display', migrationRelevance: 'none', migrationNote: 'Image rendering utility' },
    'SurveyPerformaceHistory.aspx.cs': { summary: 'Displays survey performance history records with timeline tracking.', businessPurpose: 'Shows historical survey performance data for program improvement tracking', migrationRelevance: 'low', migrationNote: 'Survey history view' },
    'SurveyPerformanceDetails.aspx.cs': { summary: 'Detail view page for survey performance records with concern details and action items.', businessPurpose: 'Shows detailed survey performance information including concerns and remediation', migrationRelevance: 'medium', migrationNote: 'Survey performance detail view' },
    'TrainingAgreement.aspx.cs': { summary: 'Page for managing training agreement documents with file upload and template generation.', businessPurpose: 'Creates and manages training agreement documents for trainees', migrationRelevance: 'medium', migrationNote: 'Training agreement document management' },
    'UpdatePermanentEmail.aspx.cs': { summary: 'Simple utility page for updating permanent email addresses for users in the portfolio.', businessPurpose: 'Allows updating of permanent email addresses for trainees and faculty', migrationRelevance: 'none', migrationNote: 'Simple field update utility' },
    'UploadCirricula.aspx.cs': { summary: 'Upload page for curricula documents with file validation and grid display of existing curricula.', businessPurpose: 'Handles curricula document file uploads for the portfolio', migrationRelevance: 'low', migrationNote: 'File upload for curricula documents' },
    'UploadCirriculaVideo.aspx.cs': { summary: 'Upload page for curricula video content with video file validation and processing.', businessPurpose: 'Handles curricula video file uploads for educational content', migrationRelevance: 'low', migrationNote: 'Video upload functionality; needs modern upload component' },
    'VideoPlay.aspx.cs': { summary: 'Video playback page for curricula videos. Renders video content for streaming or download.', businessPurpose: 'Plays curricula video content for educational viewing', migrationRelevance: 'low', migrationNote: 'Video playback; needs modern video player' },
    'ViewACGMEDefinations.aspx.cs': { summary: 'View page for ACGME competency definitions display.', businessPurpose: 'Displays ACGME competency definitions for reference', migrationRelevance: 'low', migrationNote: 'Read-only ACGME definitions view' },
    'ViewCitation.aspx.cs': { summary: 'View page for individual citation details in accreditation documentation.', businessPurpose: 'Displays citation detail information for accreditation review', migrationRelevance: 'low', migrationNote: 'Citation detail view' },
    'ViewConcern.aspx.cs': { summary: 'View page for concern details related to survey performance.', businessPurpose: 'Displays concern detail information from survey performance tracking', migrationRelevance: 'low', migrationNote: 'Concern detail view' },
    'WebADSImportDetails.aspx.cs': { summary: 'Details page for WebADS (ACGME Accreditation Data System) import operations showing import results and mapping details.', businessPurpose: 'Displays results of data imports from ACGME WebADS system for accreditation data synchronization', migrationRelevance: 'medium', migrationNote: 'WebADS integration detail view; important for ACGME compliance' },
    'WebADSScholarlyActivityImporting.aspx.cs': { summary: 'Import page for scholarly activity data from ACGME WebADS system. Handles data mapping and bulk import operations.', businessPurpose: 'Imports scholarly activity data from ACGME WebADS for synchronization with the portfolio module', migrationRelevance: 'medium', migrationNote: 'WebADS scholarly activity import; important for ACGME data integration' },
  };

  const files = meta.files.map(f => {
    const desc = descriptions[f.fileName] || descriptions[f.filePath.replace('Web/MyPortfolio/', '')] || {};
    const methods = (f.methods || []).map(m => m.name).filter((v, i, a) => a.indexOf(v) === i);
    const keyMethods = methods.filter(m => !['typeof', 'foreach', 'ListItem', 'DataTable', 'DataSet', 'DataView', 'StringBuilder', 'ConvertToInt64', 'ConvertToInteger', 'ConvertToBoolean', 'Label', 'Literal', 'TextBox', 'DropDownList', 'Image', 'LinkButton', 'ImageButton', 'HtmlTable', 'Column', 'GridRuntimeTemplate', 'GridTemplate', 'EventHandler', 'Regex', 'XElement', 'XAttribute', 'XmlDocument', 'StringReader', 'CustomValidator', 'RegularExpressionValidator', 'ArrayList', 'TableRow', 'TableCell', 'ID', 'number'].includes(m)).slice(0, 10).map(m => {
      if (m === 'Page_Load') return 'Page_Load - Initializes page and loads data';
      if (m === 'Page_Init') return 'Page_Init - Early page initialization';
      if (m === 'CheckForPermissions') return 'CheckForPermissions - Validates user access rights';
      if (m.includes('_Click')) return `${m} - Handles button click event`;
      if (m.includes('_SelectedIndexChanged')) return `${m} - Handles dropdown selection change`;
      if (m.includes('RowDataBound')) return `${m} - Formats grid row data display`;
      if (m.includes('RowExported')) return `${m} - Handles grid row export`;
      if (m.includes('_ItemDataBound')) return `${m} - Formats repeater item data`;
      if (m.includes('_DataBound') || m.includes('_Bound')) return `${m} - Data binding handler`;
      if (m === 'EncryptString') return 'EncryptString - Encrypts query string parameters';
      if (m === 'DecryptString') return 'DecryptString - Decrypts query string parameters';
      if (m.includes('Bind')) return `${m} - Binds data to UI controls`;
      if (m.includes('Download') || m.includes('download')) return `${m} - Handles file download`;
      if (m.includes('Upload') || m.includes('upload')) return `${m} - Handles file upload`;
      if (m.includes('Delete') || m.includes('delete')) return `${m} - Handles delete operation`;
      if (m.includes('Restore') || m.includes('restore')) return `${m} - Handles restore operation`;
      if (m.includes('Update') || m.includes('update')) return `${m} - Handles update operation`;
      if (m.includes('Save') || m.includes('save')) return `${m} - Handles save operation`;
      if (m.includes('Fill')) return `${m} - Populates data from database`;
      if (m.includes('Get')) return `${m} - Retrieves data`;
      if (m.includes('Set')) return `${m} - Configures settings`;
      if (m.includes('Initialize')) return `${m} - Initializes page section`;
      if (m.includes('Check')) return `${m} - Performs validation`;
      return `${m} - Business logic method`;
    });

    const bm = extractBusinessManagers(f.className, methods, f.businessModuleRefs);
    // Add from businessModuleRefs
    if (f.businessModuleRefs.includes('Portfolio') && !bm.includes('MainPageBusiness') && !bm.includes('DocDetailsBusiness')) {
      if (methods.includes('MainPageBusiness')) bm.push('MainPageBusiness');
      else if (methods.includes('DocDetailsBusiness')) bm.push('DocDetailsBusiness');
    }

    return {
      filePath: f.filePath,
      fileName: f.fileName,
      fileType: getFileType(f.fileName, f.baseClass),
      className: f.className,
      inheritsFrom: f.baseClass,
      module: 'MyPortfolio',
      summary: desc.summary || `Code-behind for ${f.fileName.replace('.aspx.cs', '')} in the MyPortfolio module. ${f.lineCount > 200 ? 'Contains substantial business logic with multiple event handlers.' : 'Contains standard page lifecycle and event handlers.'}`,
      businessPurpose: desc.businessPurpose || `Manages ${f.fileName.replace('.aspx.cs', '').replace(/([A-Z])/g, ' $1').trim().toLowerCase()} functionality in the portfolio module`,
      keyMethods: keyMethods,
      storedProcedures: [],
      businessManagersUsed: bm,
      migrationRelevance: desc.migrationRelevance || getMigrationRelevance(f.lineCount, methods, f.businessModuleRefs),
      migrationNote: desc.migrationNote || `${getComplexity(f.lineCount)} complexity portfolio page`,
      complexity: getComplexity(f.lineCount),
      lineCount: f.lineCount
    };
  });

  const result = {
    directory: 'Web/MyPortfolio',
    layer: 'web',
    generatedAt: new Date().toISOString(),
    fileCount: files.length,
    files: files,
    directoryOverview: 'MyPortfolio is the largest web module (95 files, 32,500+ lines) providing comprehensive trainee and faculty portfolio management. The central hub is MyPortfolioMain.aspx.cs (9,700+ lines) which handles dozens of portfolio sections. Key functional areas include demographics management, program history tracking, accreditation documentation, affiliate agreements, scholarly activities, quality improvement projects, learning assignments, certifications, contracts/stipends, and various document types. Most pages follow a BasePage pattern with permission checks, business manager delegation, encrypted query strings, and Obout grid data binding. The module integrates heavily with the Security, Utilities, and Common business layers.',
    keyWorkflows: [
      'Portfolio section management through MyPortfolioMain with 30+ expandable sections for demographics, training, documents, and accreditation',
      'Accreditation documentation lifecycle including citation management, compliance tracking, and ACGME WebADS import',
      'Scholarly activity document management with topic categorization, user assignments, and department settings',
      'Quality Improvement project lifecycle with Annual Program Evaluation integration and department reporting',
      'Contract and stipend management with automatic stipend level calculations and training agreement generation',
      'Learning assignment review workflow with comment threading, quiz tracking, and approval processes',
      'Department-level reporting with ACGME format support, custom fields, and Excel/CSV export',
      'Photo upload and image management with cropping and resizing',
      'Affiliate agreement tracking with multi-level sponsor/participant/rotation reporting'
    ]
  };

  fs.writeFileSync(
    path.join(GENERATED, 'ai-enriched/dotnet/per-file/web/MyPortfolio-batch2.json'),
    JSON.stringify(result, null, 2)
  );
  console.log(`MyPortfolio: ${files.length} files enriched`);
}

// =============== EssentialActivities Enrichment ===============
function enrichEssentialActivities() {
  const meta = require(path.join(GENERATED, 'dotnet-metadata/web-files/EssentialActivities.json'));

  const descriptions = {
    'AddCourse.aspx.cs': { summary: 'Add/edit page for clinical courses/rotations. Binds academic years, sessions, faculties, and preceptors with database-driven dropdowns and calendar year selection.', businessPurpose: 'Creates and edits clinical course/rotation definitions for the nursing/PA essential activities module', migrationRelevance: 'medium' },
    'AddCourseObjective.aspx.cs': { summary: 'Add page for course learning objectives. Links objectives to specific courses via dropdown selection.', businessPurpose: 'Defines learning objectives for clinical courses', migrationRelevance: 'low' },
    'AddEditManageSessionNames.aspx.cs': { summary: 'Complex management page for clinical sessions with multi-grid binding, academic year filtering, QI project updates, and JSON serialization for grid data. Supports session detail editing with month selection and DataTable operations.', businessPurpose: 'Manages clinical session definitions with detailed configuration including duration, academic year assignment, and quality improvement project linkage', migrationRelevance: 'high' },
    'AddGroupSession.aspx.cs': { summary: 'Minimal code-behind for group session addition. Contains only Page_Load with no custom logic.', businessPurpose: 'Adds group clinical sessions', migrationRelevance: 'none' },
    'AdminLog.aspx.cs': { summary: 'Administrative log viewing page for clinical activity tracking. Displays admin actions and clinical log entries with permission checks.', businessPurpose: 'Provides administrative view of clinical activity logs for program oversight', migrationRelevance: 'low' },
    'AssignCourses.aspx.cs': { summary: 'Course assignment management page for mapping students to clinical courses. Handles bulk assignment operations with grid data binding.', businessPurpose: 'Assigns students to clinical courses/rotations for their training schedule', migrationRelevance: 'medium' },
    'AssignFNPEvaluations.aspx.cs': { summary: 'FNP (Family Nurse Practitioner) evaluation assignment page. Maps evaluations to clinical sessions and student assignments.', businessPurpose: 'Assigns FNP-specific evaluations to students during clinical rotations', migrationRelevance: 'medium' },
    'AssignFNPVoluntaryEvaluations.aspx.cs': { summary: 'Assignment page for voluntary FNP evaluations that students can optionally complete.', businessPurpose: 'Manages optional/voluntary FNP evaluation assignments', migrationRelevance: 'low' },
    'AssignSessionCourses.aspx.cs': { summary: 'Maps clinical sessions to courses with drag-and-drop or selection-based assignment.', businessPurpose: 'Links clinical sessions to specific courses for schedule building', migrationRelevance: 'medium' },
    'ClincalAlternativeLogs.aspx.cs': { summary: 'Alternative clinical log entry form for non-standard clinical activities. Provides alternative logging mechanism.', businessPurpose: 'Records alternative clinical activities that do not fit standard log categories', migrationRelevance: 'low' },
    'ClinicalLogDataExport.aspx.cs': { summary: 'Clinical log data export parameter page. Configures filters for exporting clinical log data.', businessPurpose: 'Sets up parameters for clinical log data export/download', migrationRelevance: 'medium' },
    'ClinicalLogDataExportResults.aspx.cs': { summary: 'Displays and exports clinical log data based on configured parameters. Generates downloadable reports.', businessPurpose: 'Generates clinical log data export files for external analysis', migrationRelevance: 'medium' },
    'ClinicalLogReviews.aspx.cs': { summary: 'Clinical log review page for faculty to review and approve student clinical activity logs.', businessPurpose: 'Enables faculty review and approval of student clinical log entries', migrationRelevance: 'high' },
    'ClinicalPerformanceImprovementPlan.aspx.cs': { summary: 'Clinical Performance Improvement Plan (PIP) management page for tracking student remediation plans.', businessPurpose: 'Manages clinical performance improvement plans for students requiring remediation', migrationRelevance: 'high' },
    'CourseObjectiveReport.aspx.cs': { summary: 'Report parameter page for course objective completion tracking.', businessPurpose: 'Configures parameters for course objective completion reports', migrationRelevance: 'low' },
    'CourseObjectiveReportResults.aspx.cs': { summary: 'Displays course objective completion results in a report format.', businessPurpose: 'Shows course objective completion data for program assessment', migrationRelevance: 'low' },
    'CourseStudentMapping.aspx.cs': { summary: 'Mapping page for associating students with courses using selection grids and batch operations.', businessPurpose: 'Maps students to clinical courses for enrollment tracking', migrationRelevance: 'medium' },
    'DNPLogForm.aspx.cs': { summary: 'DNP (Doctor of Nursing Practice) clinical log entry form with specialized fields for DNP program activities.', businessPurpose: 'Records DNP-specific clinical activities and patient encounters', migrationRelevance: 'medium' },
    'DNPReport.aspx.cs': { summary: 'Report parameter page for DNP clinical activity reports.', businessPurpose: 'Configures DNP clinical activity report parameters', migrationRelevance: 'low' },
    'DNPReportResults.aspx.cs': { summary: 'Displays DNP clinical activity report results with grid data.', businessPurpose: 'Shows DNP clinical activity data in report format', migrationRelevance: 'low' },
    'DevClinicalLogReviews.aspx.cs': { summary: 'Development/testing version of clinical log reviews with additional debugging features.', businessPurpose: 'Development-only clinical log review page for testing', migrationRelevance: 'none' },
    'DevFNPRecords.aspx.cs': { summary: 'Development/testing version of FNP records display with debugging features.', businessPurpose: 'Development-only FNP records page for testing', migrationRelevance: 'none' },
    'DisplayDetails.aspx.cs': { summary: 'Generic detail display page for essential activities records.', businessPurpose: 'Shows detailed view of clinical activity records', migrationRelevance: 'low' },
    'DownloadDocument.aspx.cs': { summary: 'Document download handler for essential activities file attachments.', businessPurpose: 'Handles file downloads for clinical activity documentation', migrationRelevance: 'low' },
    'EditAdmin.aspx.cs': { summary: 'Admin editing page for essential activities configuration and administrative settings.', businessPurpose: 'Provides administrative editing capabilities for essential activities setup', migrationRelevance: 'low' },
    'EssentialActivitiesMain.aspx.cs': { summary: 'Main landing page for the Essential Activities module with navigation menu, FNP/DNP program detection, personal data mode toggle, evaluation menus, and requested report links. Routes to BSN program for specific departments.', businessPurpose: 'Central hub for the Essential Activities (clinical logging) module providing navigation to all clinical tracking features including log entry, reports, evaluations, and administration', migrationRelevance: 'high' },
    'EvaluationsAssignments.aspx.cs': { summary: 'Evaluation assignment management page for linking evaluations to clinical activities.', businessPurpose: 'Manages evaluation assignments for clinical activity tracking', migrationRelevance: 'medium' },
    'ExportFNPSalesForceData.aspx.cs': { summary: 'Export page for FNP data formatted for Salesforce integration.', businessPurpose: 'Exports FNP clinical data in Salesforce-compatible format for CRM integration', migrationRelevance: 'medium' },
    'ExportSalesForceData.aspx.cs': { summary: 'General export page for clinical data formatted for Salesforce integration.', businessPurpose: 'Exports clinical activity data in Salesforce-compatible format', migrationRelevance: 'medium' },
    'FNPClinicalLogForm.aspx.cs': { summary: 'Complex FNP clinical log entry form with patient encounter logging, procedure tracking, dynamic field rendering, and role-based visibility. Integrates with PatientLog and Procedures managers for comprehensive clinical data capture. Includes NewRelic monitoring integration.', businessPurpose: 'Primary data entry form for FNP students to log clinical patient encounters, procedures, and activities during rotations', migrationRelevance: 'high' },
    'FNPRecords.aspx.cs': { summary: 'FNP clinical records viewing and management page displaying logged clinical activities.', businessPurpose: 'Displays FNP student clinical activity records for review', migrationRelevance: 'medium' },
    'FNPReport.aspx.cs': { summary: 'Report parameter page for FNP clinical activity reports with filter options.', businessPurpose: 'Configures FNP clinical activity report parameters', migrationRelevance: 'medium' },
    'FNPReportResults.aspx.cs': { summary: 'Displays FNP clinical activity report results with grid and export options.', businessPurpose: 'Shows FNP clinical activity data in detailed report format', migrationRelevance: 'medium' },
    'FNPReports/PreceptorHoursMarketingReport.aspx.cs': { summary: 'Report parameter page for preceptor hours marketing report for institutional marketing and compliance.', businessPurpose: 'Configures preceptor hours marketing report for institutional partnerships', migrationRelevance: 'low' },
    'FNPReports/PreceptorHoursMarketingReportResults.aspx.cs': { summary: 'Displays preceptor hours marketing report results with institutional data.', businessPurpose: 'Shows preceptor hour data for marketing and partnership reporting', migrationRelevance: 'low' },
    'FNPReports/PreceptorHoursReport.aspx.cs': { summary: 'Report parameter page for preceptor clinical hours tracking.', businessPurpose: 'Configures preceptor hours report for compliance tracking', migrationRelevance: 'medium' },
    'FNPReports/PreceptorHoursReportResult.aspx.cs': { summary: 'Displays preceptor hours report results with hour calculations.', businessPurpose: 'Shows preceptor clinical hours for compliance and scheduling', migrationRelevance: 'medium' },
    'FNPReports/StudentTallyReport.aspx.cs': { summary: 'Report parameter page for student tally/count reporting.', businessPurpose: 'Configures student enrollment and activity tally reports', migrationRelevance: 'low' },
    'FNPReports/StudentTallyReportResults.aspx.cs': { summary: 'Displays student tally report results with enrollment counts.', businessPurpose: 'Shows student enrollment and activity tally data', migrationRelevance: 'low' },
    'FNPStudentLogCombinedReport.aspx.cs': { summary: 'Combined FNP student log report page with comprehensive view across multiple log types.', businessPurpose: 'Generates combined clinical log report across all FNP student activities', migrationRelevance: 'medium' },
    'FNPStudentLogReportResults.aspx.cs': { summary: 'Displays FNP student log report results with detailed clinical data.', businessPurpose: 'Shows detailed FNP student clinical log report data', migrationRelevance: 'medium' },
    'FacultyEvaluationAndPreceptorReport.aspx.cs': { summary: 'Report parameter page combining faculty evaluation and preceptor data.', businessPurpose: 'Configures faculty evaluation and preceptor performance report parameters', migrationRelevance: 'medium' },
    'FacultyEvaluationAndPreceptorReportResult.aspx.cs': { summary: 'Displays combined faculty evaluation and preceptor report results.', businessPurpose: 'Shows faculty evaluation scores alongside preceptor performance data', migrationRelevance: 'medium' },
    'FacultyEvaluationReport.aspx.cs': { summary: 'Report parameter page for faculty evaluation summaries.', businessPurpose: 'Configures faculty evaluation report parameters for program assessment', migrationRelevance: 'medium' },
    'FacultyEvaluationReportResults.aspx.cs': { summary: 'Displays faculty evaluation report results with score summaries.', businessPurpose: 'Shows faculty evaluation scores and performance summaries', migrationRelevance: 'medium' },
    'FacultyLog.aspx.cs': { summary: 'Faculty clinical log entry page for recording faculty teaching activities.', businessPurpose: 'Records faculty teaching and clinical supervision activities', migrationRelevance: 'medium' },
    'FnpManualImport.aspx.cs': { summary: 'Manual data import page for FNP clinical log data from external sources.', businessPurpose: 'Imports FNP clinical data from external files or systems', migrationRelevance: 'low' },
    'GeneratePIPAssignments.aspx.cs': { summary: 'Generation page for Performance Improvement Plan evaluation assignments.', businessPurpose: 'Creates PIP evaluation assignments for students needing remediation', migrationRelevance: 'medium' },
    'ImportBannerData.aspx.cs': { summary: 'Import page for Banner (student information system) data integration.', businessPurpose: 'Imports student enrollment data from Banner SIS for course mapping', migrationRelevance: 'medium' },
    'ImportCaselogData.aspx.cs': { summary: 'Import page for clinical caselog data from external sources.', businessPurpose: 'Imports clinical caselog data for procedure and patient encounter tracking', migrationRelevance: 'medium' },
    'ImportFNPData.aspx.cs': { summary: 'Import page for FNP clinical data from external systems or files.', businessPurpose: 'Imports FNP clinical activity data for bulk data loading', migrationRelevance: 'medium' },
    'ImportFNPStudentFailedData.aspx.cs': { summary: 'Import page for FNP student data that failed initial import validation.', businessPurpose: 'Handles retry/re-import of FNP student data that failed validation', migrationRelevance: 'low' },
    'ImportPreceptorData.aspx.cs': { summary: 'Import page for preceptor data from external systems.', businessPurpose: 'Imports preceptor information for clinical site and preceptor management', migrationRelevance: 'medium' },
    'ImportPreceptorUniqueID.aspx.cs': { summary: 'Import page for preceptor unique identifiers mapping from external systems.', businessPurpose: 'Maps preceptor unique IDs from external systems for data integration', migrationRelevance: 'low' },
    'IsDeleteActivity.aspx.cs': { summary: 'Utility page for checking and confirming activity deletion operations.', businessPurpose: 'Validates whether clinical activities can be safely deleted', migrationRelevance: 'none' },
    'LedgerofEvaluations.aspx.cs': { summary: 'Ledger view parameter page for evaluation tracking across clinical activities.', businessPurpose: 'Configures parameters for the evaluation ledger showing all evaluation assignments', migrationRelevance: 'medium' },
    'LedgerofEvaluationsResult.aspx.cs': { summary: 'Displays evaluation ledger results in a comprehensive grid view.', businessPurpose: 'Shows complete evaluation assignment ledger for program tracking', migrationRelevance: 'medium' },
    'LinkEvaluationtoCourses.aspx.cs': { summary: 'Linking page for associating evaluations with specific clinical courses.', businessPurpose: 'Links evaluation templates to clinical courses for automatic assignment', migrationRelevance: 'medium' },
    'ManageClinicalPerformanceImprovementPlan.aspx.cs': { summary: 'Administration page for managing Clinical Performance Improvement Plans including plan creation, monitoring, and completion tracking.', businessPurpose: 'Administers clinical performance improvement plans for student remediation management', migrationRelevance: 'high' },
    'ManageCourseMappings.aspx.cs': { summary: 'Administration page for managing course-to-course mappings and equivalencies.', businessPurpose: 'Manages course mapping relationships for program equivalency tracking', migrationRelevance: 'medium' },
    'ManageCourseObjectives.aspx.cs': { summary: 'Administration page for managing course learning objectives definitions and assignments.', businessPurpose: 'Administers learning objective definitions for clinical courses', migrationRelevance: 'medium' },
    'ManageCourses.aspx.cs': { summary: 'Administration page for clinical course management including CRUD operations on course definitions.', businessPurpose: 'Central administration for creating and managing clinical course definitions', migrationRelevance: 'high' },
    'ManageCoursesNames.aspx.cs': { summary: 'Administration page for managing course name/display configurations.', businessPurpose: 'Manages course naming conventions and display settings', migrationRelevance: 'low' },
    'ManageDetailedLogActivities.aspx.cs': { summary: 'Administration page for managing detailed clinical log activity type definitions.', businessPurpose: 'Configures the detailed activity types available in clinical log forms', migrationRelevance: 'medium' },
    'ManageEssentialActivities.aspx.cs': { summary: 'Main administration page for essential activity definitions and configurations.', businessPurpose: 'Central administration for essential activity type definitions and settings', migrationRelevance: 'high' },
    'ManageFNPEvaluationAssignments.aspx.cs': { summary: 'Administration page for managing FNP evaluation assignments across students and sessions.', businessPurpose: 'Manages FNP evaluation assignment configurations and student mappings', migrationRelevance: 'medium' },
    'ManageGroupSessions.aspx.cs': { summary: 'Administration page for managing group clinical sessions with attendance tracking.', businessPurpose: 'Manages group session definitions and participant assignments', migrationRelevance: 'medium' },
    'ManageLogActivities.aspx.cs': { summary: 'Administration page for clinical log activity type definitions.', businessPurpose: 'Configures activity types available for clinical logging', migrationRelevance: 'medium' },
    'ManageLogActivitiesandRoster.aspx.cs': { summary: 'Combined administration page for log activities and student roster management.', businessPurpose: 'Manages both activity definitions and student roster for clinical sessions', migrationRelevance: 'medium' },
    'ManagePIPAssignmentUsers.aspx.cs': { summary: 'Administration page for managing PIP evaluation assignment users.', businessPurpose: 'Manages which students are assigned to Performance Improvement Plan evaluations', migrationRelevance: 'medium' },
    'ManagePIPEvaluationAssignments.aspx.cs': { summary: 'Administration page for PIP evaluation assignment configurations.', businessPurpose: 'Configures Performance Improvement Plan evaluation assignments', migrationRelevance: 'medium' },
    'ManagePIPFields.aspx.cs': { summary: 'Administration page for managing Performance Improvement Plan field definitions.', businessPurpose: 'Configures custom fields for Performance Improvement Plan forms', migrationRelevance: 'medium' },
    'ManageSessionCourses.aspx.cs': { summary: 'Administration page for managing session-to-course associations.', businessPurpose: 'Links clinical sessions to courses for schedule management', migrationRelevance: 'medium' },
    'ManageSessionNames.aspx.cs': { summary: 'Administration page for clinical session name definitions.', businessPurpose: 'Manages session naming and configuration settings', migrationRelevance: 'low' },
    'ManageStudentLogDetails.aspx.cs': { summary: 'Administration page for managing detailed student clinical log entries.', businessPurpose: 'Provides admin tools for reviewing and managing student clinical log details', migrationRelevance: 'medium' },
    'PIPReport.aspx.cs': { summary: 'Report parameter page for Performance Improvement Plan reports.', businessPurpose: 'Configures PIP report parameters for remediation tracking', migrationRelevance: 'medium' },
    'PIPReportResults.aspx.cs': { summary: 'Displays Performance Improvement Plan report results.', businessPurpose: 'Shows PIP status and progress data for remediation oversight', migrationRelevance: 'medium' },
    'SchedulePIPAssignments.aspx.cs': { summary: 'Scheduling page for Performance Improvement Plan evaluation assignments.', businessPurpose: 'Schedules PIP evaluations on specific dates for student remediation', migrationRelevance: 'medium' },
    'SchedulerSetup.aspx.cs': { summary: 'Setup page for clinical activity scheduling configurations.', businessPurpose: 'Configures automated scheduling for clinical activities and evaluations', migrationRelevance: 'medium' },
    'SeeCurrentEvaluationLinks.aspx.cs': { summary: 'View page displaying current evaluation-to-course linkage configurations.', businessPurpose: 'Shows which evaluations are currently linked to which courses', migrationRelevance: 'low' },
    'StudentDashboard.aspx.cs': { summary: 'Student-facing dashboard for viewing clinical activities, completion status, and outstanding requirements.', businessPurpose: 'Provides students with a comprehensive view of their clinical activity progress and requirements', migrationRelevance: 'high' },
    'StudentEvaluationReport.aspx.cs': { summary: 'Report parameter page for student evaluation summaries.', businessPurpose: 'Configures student evaluation report parameters', migrationRelevance: 'medium' },
    'StudentEvaluationReportResults.aspx.cs': { summary: 'Displays student evaluation report results with score summaries.', businessPurpose: 'Shows student evaluation scores and performance summaries', migrationRelevance: 'medium' },
    'UserAcknowledgement.aspx.cs': { summary: 'User acknowledgement page for clinical activity policy and requirement acknowledgement.', businessPurpose: 'Records student acknowledgement of clinical policies and requirements', migrationRelevance: 'low' },
    'ViewPerformanceImprovementPlan.aspx.cs': { summary: 'View page for Performance Improvement Plan details with plan progress and action items.', businessPurpose: 'Displays detailed PIP information for review and tracking', migrationRelevance: 'medium' },
  };

  const files = meta.files.map(f => {
    const fn = f.filePath.replace('Web/EssentialActivities/', '');
    const desc = descriptions[fn] || descriptions[f.fileName] || {};
    const methods = (f.methods || []).map(m => m.name).filter((v, i, a) => a.indexOf(v) === i);
    const keyMethods = methods.filter(m => !['typeof', 'foreach', 'ListItem', 'DataTable', 'DataSet', 'DataView', 'StringBuilder', 'ConvertToInt64', 'ConvertToInteger', 'ConvertToBoolean', 'Label', 'Literal', 'TextBox', 'DropDownList', 'Image', 'ArrayList', 'Column', 'DataColumn'].includes(m)).slice(0, 10).map(m => {
      if (m === 'Page_Load') return 'Page_Load - Initializes page and loads data';
      if (m === 'Page_Init') return 'Page_Init - Early page initialization';
      if (m === 'CheckForPermissions') return 'CheckForPermissions - Validates user access rights';
      if (m.includes('_Click')) return `${m} - Handles button click event`;
      if (m.includes('_SelectedIndexChanged') || m.includes('_OnSelectedIndexChanged')) return `${m} - Handles dropdown selection change`;
      if (m.includes('RowDataBound')) return `${m} - Formats grid row data display`;
      if (m.includes('_ItemDataBound') || m.includes('_OnItemDataBound')) return `${m} - Formats repeater item data`;
      if (m.includes('Bind') || m.includes('bind')) return `${m} - Binds data to UI controls`;
      if (m.includes('Initialize') || m.includes('Initilize') || m.includes('InitializePage')) return `${m} - Initializes page components`;
      if (m.includes('Fill')) return `${m} - Populates data from database`;
      if (m.includes('Get')) return `${m} - Retrieves data`;
      if (m.includes('Set')) return `${m} - Configures settings`;
      if (m.includes('Export')) return `${m} - Exports data`;
      if (m.includes('Import')) return `${m} - Imports data`;
      if (m.includes('Save') || m.includes('save')) return `${m} - Handles save operation`;
      if (m.includes('Delete') || m.includes('delete')) return `${m} - Handles delete operation`;
      if (m.includes('Update') || m.includes('update')) return `${m} - Handles update operation`;
      return `${m} - Business logic method`;
    });

    const bm = extractBusinessManagers(f.className, methods, f.businessModuleRefs);

    return {
      filePath: f.filePath,
      fileName: f.fileName,
      fileType: getFileType(f.fileName, f.baseClass),
      className: f.className,
      inheritsFrom: f.baseClass,
      module: 'EssentialActivities',
      summary: desc.summary || `Code-behind for ${f.fileName.replace('.aspx.cs', '')} in the Essential Activities module. ${f.lineCount > 200 ? 'Contains substantial business logic.' : 'Standard page with event handlers.'}`,
      businessPurpose: desc.businessPurpose || `Manages ${f.fileName.replace('.aspx.cs', '').replace(/([A-Z])/g, ' $1').trim().toLowerCase()} in the clinical activities module`,
      keyMethods: keyMethods,
      storedProcedures: [],
      businessManagersUsed: bm,
      migrationRelevance: desc.migrationRelevance || getMigrationRelevance(f.lineCount, methods, f.businessModuleRefs),
      migrationNote: desc.migrationNote || `${getComplexity(f.lineCount)} complexity essential activities page`,
      complexity: getComplexity(f.lineCount),
      lineCount: f.lineCount
    };
  });

  const result = {
    directory: 'Web/EssentialActivities',
    layer: 'web',
    generatedAt: new Date().toISOString(),
    fileCount: files.length,
    files: files,
    directoryOverview: 'EssentialActivities is a major web module (85 files, 40,600+ lines) providing clinical activity logging and management for nursing programs (FNP, DNP, BSN). It includes clinical log forms, course management, session tracking, preceptor management, evaluation assignments, Performance Improvement Plans (PIP), and comprehensive reporting. The module supports data import from external systems (Banner SIS, Salesforce) and provides both student-facing dashboards and administrative management tools. Key integration points include the Evaluations, PatientLog, and Procedures business layers.',
    keyWorkflows: [
      'FNP clinical log entry with patient encounters, procedures, and preceptor supervision tracking',
      'Course and session management with student enrollment mapping and academic year tracking',
      'Clinical Performance Improvement Plan (PIP) lifecycle from creation through evaluation and completion',
      'Faculty and preceptor evaluation assignment and reporting',
      'Clinical log review and approval workflow for faculty oversight',
      'Data import from Banner SIS and export to Salesforce for institutional integration',
      'Student dashboard showing clinical activity progress and outstanding requirements',
      'Comprehensive reporting suite for clinical hours, student tallies, and preceptor performance'
    ]
  };

  fs.writeFileSync(
    path.join(GENERATED, 'ai-enriched/dotnet/per-file/web/EssentialActivities-batch2.json'),
    JSON.stringify(result, null, 2)
  );
  console.log(`EssentialActivities: ${files.length} files enriched`);
}

// =============== CMETracking Enrichment ===============
function enrichCMETracking() {
  const meta = require(path.join(GENERATED, 'dotnet-metadata/web-files/CMETracking.json'));

  const descriptions = {
    'AnswerTypeSelection.aspx.cs': { summary: 'Complex answer type selection page for CME evaluation template design. Manages answer scales, answer type definitions, free-form items, and page state with extensive data binding for evaluation form building.', businessPurpose: 'Configures answer types and scales for CME evaluation templates as part of evaluation design workflow', migrationRelevance: 'high' },
    'AssignCMEEvaluationInformation.aspx.cs': { summary: 'Assignment information page showing CME evaluation assignment details with HTML table generation from dataset.', businessPurpose: 'Displays CME evaluation assignment details for administrators', migrationRelevance: 'low' },
    'AssignMenu.aspx.cs': { summary: 'Navigation menu page for CME assignment operations with permission-based menu visibility and help icons.', businessPurpose: 'Provides navigation to CME assignment management functions', migrationRelevance: 'low' },
    'CMECourse.aspx.cs': { summary: 'Major course management page for CME events with speaker management, credit type binding, event associations, evaluation linking, quiz assignment, and schedule configuration. Supports complex form state management with page state persistence.', businessPurpose: 'Comprehensive CME course/activity management including speakers, credits, evaluations, and scheduling', migrationRelevance: 'high' },
    'CMEEvaluate.aspx.cs': { summary: 'CME evaluation completion page where participants fill out evaluation forms for CME activities.', businessPurpose: 'Allows CME participants to complete evaluation forms for attended activities', migrationRelevance: 'high' },
    'CMEEvaluationDetailsForAudittrail.aspx.cs': { summary: 'Audit trail detail page showing evaluation completion history and changes for compliance tracking.', businessPurpose: 'Provides audit trail of CME evaluation submissions and modifications for compliance', migrationRelevance: 'medium' },
    'CMEEvaluationInformation.aspx.cs': { summary: 'Information page displaying CME evaluation details and configuration.', businessPurpose: 'Shows detailed information about CME evaluation templates and assignments', migrationRelevance: 'low' },
    'CMEEvaluationReminderEmailScheduler.aspx.cs': { summary: 'Email scheduler page for configuring CME evaluation reminder notifications.', businessPurpose: 'Schedules automated reminder emails for incomplete CME evaluations', migrationRelevance: 'medium' },
    'CMEEventInformation.aspx.cs': { summary: 'CME event detail information page with event registration and activity details.', businessPurpose: 'Displays detailed information about CME events for participant review', migrationRelevance: 'medium' },
    'CMEEventRegister.aspx.cs': { summary: 'Event registration page for CME activities allowing participant sign-up and payment processing.', businessPurpose: 'Handles participant registration for CME events including payment integration', migrationRelevance: 'high' },
    'CMEMain.aspx.cs': { summary: 'Main landing page for the CME Tracking module with role-based navigation, permission checks for conference importing, chatbot integration params, and personal data mode toggle. Extensive role-based access control with user type switching.', businessPurpose: 'Central hub for the CME (Continuing Medical Education) tracking module providing navigation to all CME features', migrationRelevance: 'high' },
    'CMEQuestion.aspx.cs': { summary: 'Question management page for CME evaluation forms. Handles question creation, editing, and ordering within evaluation templates.', businessPurpose: 'Manages evaluation questions for CME activity evaluation forms', migrationRelevance: 'high' },
    'CMETemplateCopy.aspx.cs': { summary: 'Template copy utility for duplicating CME evaluation templates for reuse.', businessPurpose: 'Copies existing CME evaluation templates as starting point for new evaluations', migrationRelevance: 'low' },
    'Certificate.aspx.cs': { summary: 'Certificate generation page for CME completion certificates with dynamic content rendering.', businessPurpose: 'Generates and displays CME completion certificates for participants', migrationRelevance: 'medium' },
    'CreateGuest.aspx.cs': { summary: 'Guest participant creation page for non-registered CME event attendees.', businessPurpose: 'Creates temporary guest accounts for CME event participation', migrationRelevance: 'medium' },
    'CreateGuestLecturer.aspx.cs': { summary: 'Guest lecturer creation page for external speakers at CME events.', businessPurpose: 'Creates guest lecturer records for external CME event speakers', migrationRelevance: 'medium' },
    'DeclineCMEEvaluation.aspx.cs': { summary: 'Page for declining CME evaluation completion with reason tracking.', businessPurpose: 'Records when participants decline to complete CME evaluations with reasons', migrationRelevance: 'low' },
    'DeleteCMEEventInformation.aspx.cs': { summary: 'Confirmation and processing page for CME event deletion.', businessPurpose: 'Handles CME event deletion with confirmation and cleanup', migrationRelevance: 'low' },
    'DeletedCMETemplateInfo.aspx.cs': { summary: 'View page for deleted CME evaluation templates with restore capability.', businessPurpose: 'Displays and allows restoration of deleted CME evaluation templates', migrationRelevance: 'low' },
    'DeletedCmeEvaluationInformation.aspx.cs': { summary: 'View page for deleted CME evaluation information with restore options.', businessPurpose: 'Displays and allows restoration of deleted CME evaluations', migrationRelevance: 'low' },
    'DesignEvaluationStep1.aspx.cs': { summary: 'First step of the multi-step CME evaluation template design wizard. Configures basic evaluation properties.', businessPurpose: 'Step 1 of evaluation design: configures evaluation name, type, and basic settings', migrationRelevance: 'high' },
    'DesignEvaluationStep2.aspx.cs': { summary: 'Second step of the CME evaluation design wizard for question definition and layout.', businessPurpose: 'Step 2 of evaluation design: defines questions and answer types for the evaluation', migrationRelevance: 'high' },
    'DesignEvaluationStep3.aspx.cs': { summary: 'Third step of the CME evaluation design wizard for review and configuration.', businessPurpose: 'Step 3 of evaluation design: reviews and configures evaluation settings before activation', migrationRelevance: 'high' },
    'DesignEvaluationStep4.aspx.cs': { summary: 'Fourth and final step of the CME evaluation design wizard for finalization and activation.', businessPurpose: 'Step 4 of evaluation design: finalizes and activates the evaluation template', migrationRelevance: 'high' },
    'EvaluateCMEEvaluation.aspx.cs': { summary: 'Active evaluation completion page rendering the evaluation form for CME participants.', businessPurpose: 'Renders and processes CME evaluation form completion by participants', migrationRelevance: 'high' },
    'GroupParticipants.aspx.cs': { summary: 'Group participant management page for CME events with bulk attendance tracking.', businessPurpose: 'Manages group participation and attendance for CME events', migrationRelevance: 'medium' },
    'LearningObjectiveSelection.aspx.cs': { summary: 'Learning objective selection page for linking objectives to CME activities.', businessPurpose: 'Associates learning objectives with CME courses/activities', migrationRelevance: 'medium' },
    'ManageCMEAssignmentAddUsers.aspx.cs': { summary: 'User addition page for CME evaluation assignments with search and selection.', businessPurpose: 'Adds users to CME evaluation assignments', migrationRelevance: 'medium' },
    'ManageCMEAssignmentUsers.aspx.cs': { summary: 'User management page for existing CME evaluation assignments.', businessPurpose: 'Manages user lists for CME evaluation assignments', migrationRelevance: 'medium' },
    'ManageCMEAssignmentUsersMainPage.aspx.cs': { summary: 'Main page for CME assignment user management providing overview of all assignment-user mappings.', businessPurpose: 'Central administration for CME evaluation assignment user management', migrationRelevance: 'medium' },
    'ManageCMEAssignments.aspx.cs': { summary: 'Administration page for managing CME evaluation assignments including creation, scheduling, and status management.', businessPurpose: 'Central management of CME evaluation assignments across courses and users', migrationRelevance: 'high' },
    'ManageCMECourse.aspx.cs': { summary: 'Administration page for CME course management with CRUD operations.', businessPurpose: 'Manages CME course definitions and configurations', migrationRelevance: 'high' },
    'ManageCMEDeletedAssignments.aspx.cs': { summary: 'View and restore page for deleted CME evaluation assignments.', businessPurpose: 'Displays deleted CME assignments with restoration capability', migrationRelevance: 'low' },
    'ManageCMEGroupsParticipants.aspx.cs': { summary: 'Group participant management with attendance and participation tracking.', businessPurpose: 'Manages CME group definitions and participant memberships', migrationRelevance: 'medium' },
    'ManageCMELearnerActivities.aspx.cs': { summary: 'Learner activity management for tracking individual CME participation and completion.', businessPurpose: 'Tracks and manages individual learner CME activity records', migrationRelevance: 'medium' },
    'ManageCertificates.aspx.cs': { summary: 'Certificate template management page for CME completion certificate customization.', businessPurpose: 'Manages CME certificate templates and generation settings', migrationRelevance: 'medium' },
    'ManageCmeEvaluations.aspx.cs': { summary: 'Main administration page for CME evaluation template management including CRUD operations.', businessPurpose: 'Central management of CME evaluation templates and their configurations', migrationRelevance: 'high' },
    'ManageQuestions.aspx.cs': { summary: 'Question bank management page for CME evaluation questions.', businessPurpose: 'Manages the question library for CME evaluation template building', migrationRelevance: 'high' },
    'MonthlyPopupCMEInfo.aspx.cs': { summary: 'Popup page displaying monthly CME activity calendar information.', businessPurpose: 'Shows monthly CME event schedule in popup format', migrationRelevance: 'low' },
    'MultipleScheduleAssignment.aspx.cs': { summary: 'Bulk schedule assignment page for creating multiple CME assignments simultaneously.', businessPurpose: 'Enables bulk creation of CME activity schedules and assignments', migrationRelevance: 'medium' },
    'MultipleTopicsSelection.aspx.cs': { summary: 'Multiple topic selection page for associating topics with CME activities.', businessPurpose: 'Associates multiple educational topics with CME courses/events', migrationRelevance: 'low' },
    'NoRecordFoundForAll.aspx.cs': { summary: 'Generic empty state page displayed when no CME records match search criteria.', businessPurpose: 'Displays a no-records-found message for CME searches', migrationRelevance: 'none' },
    'PrintGroupsParticipants.aspx.cs': { summary: 'Print-optimized page for CME group participant lists.', businessPurpose: 'Generates printable CME group participant attendance reports', migrationRelevance: 'low' },
    'Reports/CMECertificatesReport.aspx.cs': { summary: 'Report parameter page for CME certificate generation reports.', businessPurpose: 'Configures CME certificate report parameters for bulk certificate generation', migrationRelevance: 'medium' },
    'Reports/CMECertificatesReportResults.aspx.cs': { summary: 'Displays CME certificate report results with batch certificate generation.', businessPurpose: 'Shows and generates CME certificates in batch for events', migrationRelevance: 'medium' },
    'Reports/CMEFinancialStatement.aspx.cs': { summary: 'Report parameter page for CME financial statement generation.', businessPurpose: 'Configures CME financial statement report parameters for event revenue/expense tracking', migrationRelevance: 'medium' },
    'Reports/CMEFinancialStatementResults.aspx.cs': { summary: 'Displays CME financial statement results with revenue and expense data.', businessPurpose: 'Shows CME event financial data including registration fees and expenses', migrationRelevance: 'medium' },
    'Reports/CertificateReport.aspx.cs': { summary: 'Individual certificate report page for single certificate generation.', businessPurpose: 'Generates individual CME completion certificates', migrationRelevance: 'low' },
    'Reports/DetailedLedgerCreditsReport.aspx.cs': { summary: 'Report parameter page for detailed CME credit ledger.', businessPurpose: 'Configures detailed CME credit tracking report parameters', migrationRelevance: 'medium' },
    'Reports/DetailedLedgerCreditsReportResults.aspx.cs': { summary: 'Displays detailed CME credit ledger results with per-activity credit breakdowns.', businessPurpose: 'Shows detailed CME credit data by activity for compliance reporting', migrationRelevance: 'medium' },
    'Reports/SummaryCMEEvaluationReport.aspx.cs': { summary: 'Report parameter page for CME evaluation summary.', businessPurpose: 'Configures CME evaluation summary report parameters', migrationRelevance: 'medium' },
    'Reports/SummaryCMEEvaluationReportResults.aspx.cs': { summary: 'Displays CME evaluation summary report with aggregate scores.', businessPurpose: 'Shows summary evaluation data for CME activities', migrationRelevance: 'medium' },
    'Reports/SummaryEventReport.aspx.cs': { summary: 'Report parameter page for CME event summary.', businessPurpose: 'Configures CME event summary report parameters', migrationRelevance: 'low' },
    'Reports/SummaryEventReportResults.aspx.cs': { summary: 'Displays CME event summary report results.', businessPurpose: 'Shows summary data for CME events', migrationRelevance: 'low' },
    'Reports/SummaryLedgerCreditsReport.aspx.cs': { summary: 'Report parameter page for summary CME credit ledger.', businessPurpose: 'Configures summary CME credit report parameters', migrationRelevance: 'medium' },
    'Reports/SummaryLedgerCreditsReportBeta.aspx.cs': { summary: 'Beta version of summary ledger credits report with updated features.', businessPurpose: 'Testing new version of summary CME credit report', migrationRelevance: 'low' },
    'Reports/SummaryLedgerCreditsReportResults.aspx.cs': { summary: 'Displays summary CME credit ledger results.', businessPurpose: 'Shows summary CME credit data for compliance reporting', migrationRelevance: 'medium' },
    'Reports/SummaryLedgerCreditsReportResultsBeta.aspx.cs': { summary: 'Beta version of summary ledger credits report results.', businessPurpose: 'Testing new version of summary CME credit report results', migrationRelevance: 'low' },
    'ScheduleAssignment.aspx.cs': { summary: 'Schedule assignment page for individual CME activity scheduling.', businessPurpose: 'Schedules individual CME activities with date/time and location settings', migrationRelevance: 'medium' },
    'Setup/CMEConnectivity.aspx.cs': { summary: 'Setup page for CME system connectivity and integration configuration.', businessPurpose: 'Configures external system connectivity for CME data integration', migrationRelevance: 'medium' },
    'Setup/CMESatellitePrograms.aspx.cs': { summary: 'Setup page for CME satellite program definitions for multi-site CME operations.', businessPurpose: 'Manages satellite program configurations for distributed CME activities', migrationRelevance: 'low' },
    'Setup/CmeSetup.aspx.cs': { summary: 'Main CME module setup page for system-wide configuration settings.', businessPurpose: 'Configures system-wide CME tracking settings and preferences', migrationRelevance: 'medium' },
    'Setup/CreditType.aspx.cs': { summary: 'Setup page for individual CME credit type definition.', businessPurpose: 'Defines CME credit type details (AMA PRA Category 1, etc.)', migrationRelevance: 'medium' },
    'Setup/Event.aspx.cs': { summary: 'Setup page for CME event type definitions.', businessPurpose: 'Configures CME event type definitions and categories', migrationRelevance: 'medium' },
    'Setup/ManageCreditTypes.aspx.cs': { summary: 'Administration page for managing all CME credit type definitions.', businessPurpose: 'Central management of CME credit types for the institution', migrationRelevance: 'medium' },
    'Setup/ManageDefaultCredentialingInfo.aspx.cs': { summary: 'Setup page for default CME credentialing information and accreditation details.', businessPurpose: 'Configures default credentialing and accreditation information for CME certificates', migrationRelevance: 'medium' },
    'Setup/ManageEmailDatabase.aspx.cs': { summary: 'Email database management page for CME notification contact lists.', businessPurpose: 'Manages email contact lists for CME event notifications and reminders', migrationRelevance: 'low' },
    'Setup/ManageEvents.aspx.cs': { summary: 'Administration page for managing all CME event definitions.', businessPurpose: 'Central management of CME event definitions and configurations', migrationRelevance: 'medium' },
    'Setup/ManageMerchantServices.aspx.cs': { summary: 'Setup page for CME payment merchant services integration.', businessPurpose: 'Configures payment processing for CME event registration fees', migrationRelevance: 'medium' },
    'Setup/ManageUploadUser.aspx.cs': { summary: 'User upload/import page for bulk CME participant creation.', businessPurpose: 'Bulk imports CME participants from uploaded files', migrationRelevance: 'low' },
    'Setup/UploadList.aspx.cs': { summary: 'Upload list management page for CME bulk data operations.', businessPurpose: 'Manages uploaded data files for CME bulk operations', migrationRelevance: 'low' },
    'UndoCMEEvaluationInfo.aspx.cs': { summary: 'Undo page for reverting CME evaluation submission to allow re-completion.', businessPurpose: 'Allows administrators to undo CME evaluation submissions for re-evaluation', migrationRelevance: 'low' },
    'VerifyEvaluation.aspx.cs': { summary: 'Evaluation verification page for validating CME evaluation completeness and accuracy.', businessPurpose: 'Verifies CME evaluation submissions for completeness before final processing', migrationRelevance: 'medium' },
    'VerifyEvaluationAttendance.aspx.cs': { summary: 'Attendance verification page for CME events with participant check-in tracking.', businessPurpose: 'Verifies participant attendance at CME events for credit eligibility', migrationRelevance: 'medium' },
  };

  const files = meta.files.map(f => {
    const fn = f.filePath.replace('Web/CMETracking/', '');
    const desc = descriptions[fn] || descriptions[f.fileName] || {};
    const methods = (f.methods || []).map(m => m.name).filter((v, i, a) => a.indexOf(v) === i);
    const keyMethods = methods.filter(m => !['typeof', 'foreach', 'ListItem', 'DataTable', 'DataSet', 'DataView', 'StringBuilder', 'ConvertToInt64', 'ConvertToInteger', 'ConvertToBoolean', 'Label', 'Literal', 'TextBox', 'DropDownList', 'Image', 'ArrayList', 'Column'].includes(m)).slice(0, 10).map(m => {
      if (m === 'Page_Load') return 'Page_Load - Initializes page and loads data';
      if (m === 'Page_Init') return 'Page_Init - Early page initialization';
      if (m === 'CheckForPermissions' || m === 'CheckPermissions') return `${m} - Validates user access rights`;
      if (m === 'Logout') return 'Logout - Handles user logout';
      if (m.includes('_Click')) return `${m} - Handles button click event`;
      if (m.includes('_SelectedIndexChanged')) return `${m} - Handles dropdown selection change`;
      if (m.includes('RowDataBound')) return `${m} - Formats grid row data display`;
      if (m.includes('_ItemDataBound')) return `${m} - Formats repeater item data`;
      if (m.includes('Bind') || m.includes('bind')) return `${m} - Binds data to UI controls`;
      if (m.includes('Initialize') || m.includes('InitializePage')) return `${m} - Initializes page components`;
      if (m.includes('Fill') || m.includes('fill')) return `${m} - Populates data from database`;
      if (m.includes('Get') || m.includes('get')) return `${m} - Retrieves data`;
      if (m.includes('Set') || m.includes('set')) return `${m} - Configures settings`;
      if (m.includes('Save') || m.includes('save')) return `${m} - Handles save operation`;
      if (m.includes('Delete') || m.includes('delete')) return `${m} - Handles delete operation`;
      if (m.includes('Update') || m.includes('update')) return `${m} - Handles update operation`;
      if (m.includes('Store')) return `${m} - Stores page state`;
      if (m.includes('draw') || m.includes('Draw')) return `${m} - Renders UI elements`;
      if (m.includes('refresh') || m.includes('Refresh')) return `${m} - Refreshes data display`;
      return `${m} - Business logic method`;
    });

    const bm = extractBusinessManagers(f.className, methods, f.businessModuleRefs);

    return {
      filePath: f.filePath,
      fileName: f.fileName,
      fileType: getFileType(f.fileName, f.baseClass),
      className: f.className,
      inheritsFrom: f.baseClass,
      module: 'CMETracking',
      summary: desc.summary || `Code-behind for ${f.fileName.replace('.aspx.cs', '')} in the CME Tracking module. ${f.lineCount > 200 ? 'Contains substantial CME business logic.' : 'Standard page with event handlers.'}`,
      businessPurpose: desc.businessPurpose || `Manages ${f.fileName.replace('.aspx.cs', '').replace(/([A-Z])/g, ' $1').trim().toLowerCase()} in the CME tracking module`,
      keyMethods: keyMethods,
      storedProcedures: [],
      businessManagersUsed: bm,
      migrationRelevance: desc.migrationRelevance || getMigrationRelevance(f.lineCount, methods, f.businessModuleRefs),
      migrationNote: desc.migrationNote || `${getComplexity(f.lineCount)} complexity CME tracking page`,
      complexity: getComplexity(f.lineCount),
      lineCount: f.lineCount
    };
  });

  const result = {
    directory: 'Web/CMETracking',
    layer: 'web',
    generatedAt: new Date().toISOString(),
    fileCount: files.length,
    files: files,
    directoryOverview: 'CMETracking is a comprehensive web module (74 files, 40,700+ lines) for Continuing Medical Education tracking and management. It provides a complete CME lifecycle from event creation and course management through evaluation design (4-step wizard), participant registration, attendance verification, evaluation completion, certificate generation, and credit tracking. The module includes financial statement reporting, merchant services integration for payment processing, and comprehensive reporting suite for credit ledgers, evaluation summaries, and event analytics. Satellite program support enables multi-site CME operations. The setup subdirectory contains institutional configuration pages for credit types, events, and credentialing information.',
    keyWorkflows: [
      'CME evaluation template design through 4-step wizard (DesignEvaluationStep1-4) with answer type selection and question management',
      'CME course management with speaker assignments, credit types, evaluation linking, and schedule configuration',
      'Participant registration and event attendance verification for credit eligibility tracking',
      'CME evaluation completion workflow with decline option, undo capability, and audit trail',
      'Certificate generation for CME completion with customizable templates and batch generation',
      'Credit tracking and ledger reporting (detailed and summary) for compliance with accreditation requirements',
      'Financial statement reporting for CME event revenue and expense tracking',
      'Guest participant and lecturer creation for external CME event attendees',
      'Email notification scheduling for evaluation reminders and event communications'
    ]
  };

  fs.writeFileSync(
    path.join(GENERATED, 'ai-enriched/dotnet/per-file/web/CMETracking-batch2.json'),
    JSON.stringify(result, null, 2)
  );
  console.log(`CMETracking: ${files.length} files enriched`);
}

// Run all three
enrichMyPortfolio();
enrichEssentialActivities();
enrichCMETracking();
console.log('All batch2 files generated successfully.');
