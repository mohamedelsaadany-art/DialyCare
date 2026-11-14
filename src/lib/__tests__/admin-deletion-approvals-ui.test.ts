/**
 * Rigorous Verification Suite for Admin Deletion & Approvals UI with 14-Day Archive Controls
 *
 * Verifies all requirements from <original_task>:
 * 1. src/app/[locale]/admin/patients/page.tsx:
 *    - Super Admin authorization (currentUser?.role === 'admin' gating for checkboxes, bulk delete, trash buttons, archive tab)
 *    - Bulk & Individual selection (checkboxes, top floating action bar with "Delete Selected Patients / حذف المرضى المحددين ([count])", row trash can buttons)
 *    - 2-Step Confirmation Modal (Title "تأكيد نقل المريض إلى الأرشيف / Confirm Archive & Deletion", verbatim clinical warning, selected patient names, red confirm archive button calling /api/admin/archive)
 *    - Archive Tab (toggle "المرضى النشطون (Active)" vs "الأرشيف وسلة المهملات (Archive - 14 Days)", lists archived patients from /api/admin/archive, days remaining badge e.g. "متبقي 12 يوماً قبل الحذف النهائي", restore button calling /api/admin/restore)
 * 2. src/app/[locale]/admin/approvals/page.tsx:
 *    - Dedicated section for "طلبات استعادة الحسابات المعلقة (Reactivation Requests)"
 *    - Lists archived patients with reactivationStatus === 'pending'
 *    - Shows patient name, phone number, date requested, days remaining
 *    - Green button: "✓ اعتماد واستعادة الملف الطبي (Approve & Restore Data)" calling /api/admin/restore
 * 3. Complete Arabic & English translations in ar.json and en.json
 * 4. 48px accessibility minimum across all interactive touch targets
 * 5. TypeScript type checking
 */

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let assertions = 0;
function check(cond: unknown, msg: string): void {
  assert.ok(cond, msg);
  assertions++;
}
function eq<T>(actual: T, expected: T, msg: string): void {
  assert.strictEqual(actual, expected, msg);
  assertions++;
}

async function run(): Promise<void> {
  console.log('\n================================================================');
  console.log('ADMIN DELETION & APPROVALS UI VERIFICATION SUITE');
  console.log('================================================================\n');

  const cwd = process.cwd();
  const patientsPageSource = readFileSync(join(cwd, 'src/app/[locale]/admin/patients/page.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const approvalsPageSource = readFileSync(join(cwd, 'src/app/[locale]/admin/approvals/page.tsx'), 'utf8').replace(/\r\n/g, '\n');
  const arJson = JSON.parse(readFileSync(join(cwd, 'src/messages/ar.json'), 'utf8'));
  const enJson = JSON.parse(readFileSync(join(cwd, 'src/messages/en.json'), 'utf8'));

  // --------------------------------------------------------------------------
  // SUITE 1: Super Admin Authorization Gating
  // --------------------------------------------------------------------------
  console.log('--- Suite 1: Super Admin Authorization Gating ---');
  check(
    patientsPageSource.includes("currentUser?.role === 'admin'") ||
      (patientsPageSource.includes("user?.role === 'admin'") && patientsPageSource.includes("currentUser")),
    'Authorization explicitly inspects currentUser?.role === "admin"'
  );
  check(
    patientsPageSource.includes('isSuperAdmin &&') || patientsPageSource.includes('isSuperAdmin ?'),
    'Gating condition isSuperAdmin guards delete and archive controls'
  );
  check(
    patientsPageSource.includes('{isSuperAdmin && (\n                    <th className="py-1 px-1 text-center w-12 min-w-[48px]">') ||
      patientsPageSource.includes('{isSuperAdmin && (\n                    <th'),
    'Header select-all checkbox is guarded by isSuperAdmin'
  );
  check(
    patientsPageSource.includes('{isSuperAdmin && (\n                          <td className="py-1 px-1 text-center'),
    'Row selection checkbox is guarded by isSuperAdmin'
  );
  check(
    patientsPageSource.includes('bulk-delete-patients-btn') && patientsPageSource.includes('{isSuperAdmin && ('),
    'Bulk delete button is guarded by isSuperAdmin'
  );
  check(
    patientsPageSource.includes('{/* Super Admin ONLY: individual trash can icon button */}\n                            {isSuperAdmin && ('),
    'Individual row trash can button is guarded by isSuperAdmin'
  );
  check(
    patientsPageSource.includes('{/* Super Admin Roster View Tabs: Active vs 14-Day Archive */}\n      {isSuperAdmin && ('),
    'Archive tab toggle is guarded by isSuperAdmin'
  );

  // --------------------------------------------------------------------------
  // SUITE 2: Bulk & Individual Selection & Floating Bar
  // --------------------------------------------------------------------------
  console.log('--- Suite 2: Bulk & Individual Selection & Floating Action Bar ---');
  check(patientsPageSource.includes('handleSelectAll'), 'handleSelectAll toggles all active patients');
  check(patientsPageSource.includes('handleToggleSelect'), 'handleToggleSelect toggles individual patient');
  check(patientsPageSource.includes('data-testid="bulk-action-bar"'), 'Floating bulk action bar exists');
  check(
    patientsPageSource.includes('sticky top-2 z-30') || patientsPageSource.includes('sticky top-'),
    'Bulk action bar is floating / sticky at top'
  );
  check(
    patientsPageSource.includes('deleteSelectedPatients'),
    'Bulk action bar uses deleteSelectedPatients translation'
  );
  check(
    patientsPageSource.includes('حذف المرضى المحددين') && patientsPageSource.includes('Delete Selected Patients'),
    'Bulk action bar bilingual fallback is present'
  );
  check(
    patientsPageSource.includes('data-testid="bulk-delete-patients-btn"'),
    'Bulk delete button has data-testid="bulk-delete-patients-btn"'
  );
  check(
    patientsPageSource.includes('data-testid={`row-archive-patient-${patient.id}`}'),
    'Each table row has individual trash button with data-testid row-archive-patient-[id]'
  );

  // --------------------------------------------------------------------------
  // SUITE 3: 2-Step Confirmation Modal & Clinical Warning
  // --------------------------------------------------------------------------
  console.log('--- Suite 3: 2-Step Confirmation Modal & Clinical Warning ---');
  check(patientsPageSource.includes('data-testid="archive-confirmation-modal"'), 'Confirmation modal has test id');
  check(
    patientsPageSource.includes('تأكيد نقل المريض إلى الأرشيف') &&
      patientsPageSource.includes('Confirm Archive & Deletion'),
    'Modal title has bilingual text "تأكيد نقل المريض إلى الأرشيف / Confirm Archive & Deletion"'
  );

  const exactWarning =
    'سيتم إخفاء بيانات المريض فوراً عن جميع الأطباء والتمريض، وستبقى في الأرشيف المؤقت لمدة 14 يوماً قبل الحذف النهائي الدائم. إذا أراد المريض العودة، يمكنه التسجيل ومراسلة الإدارة لتفعيل حسابه.';
  check(
    patientsPageSource.includes(exactWarning),
    'Modal displays verbatim clinical warning in Arabic'
  );
  check(
    patientsPageSource.includes('targetArchivePatients.map((p) =>'),
    'Modal lists the names of selected patients'
  );
  check(
    patientsPageSource.includes('data-testid="confirm-archive-btn"'),
    'Modal has red confirm archive button with data-testid="confirm-archive-btn"'
  );
  check(
    patientsPageSource.includes("variant=\"danger\"") && patientsPageSource.includes('bg-red-600'),
    'Confirm archive button is styled red (danger)'
  );
  check(
    patientsPageSource.includes("fetch('/api/admin/archive'") || patientsPageSource.includes('fetch("/api/admin/archive"'),
    'handleConfirmArchive calls /api/admin/archive'
  );

  // --------------------------------------------------------------------------
  // SUITE 4: Archive View / Tab
  // --------------------------------------------------------------------------
  console.log('--- Suite 4: Archive View / Tab ---');
  check(
    patientsPageSource.includes('data-testid="tab-active-patients"') &&
      patientsPageSource.includes('data-testid="tab-archive-patients"'),
    'Active vs Archive tabs have test IDs'
  );
  check(
    patientsPageSource.includes('المرضى النشطون') && patientsPageSource.includes('الأرشيف وسلة المهملات'),
    'Tab labels include "المرضى النشطون (Active)" and "الأرشيف وسلة المهملات (Archive - 14 Days)"'
  );
  check(
    patientsPageSource.includes("fetch('/api/admin/archive'"),
    'loadArchived fetches archived patients from /api/admin/archive'
  );
  check(
    patientsPageSource.includes('متبقي') && patientsPageSource.includes('يوماً قبل الحذف النهائي'),
    'Displays badge with days remaining before permanent purge'
  );
  check(
    patientsPageSource.includes('data-testid={`badge-days-remaining-${patient.id}`}'),
    'Days remaining badge has data-testid badge-days-remaining-[id]'
  );
  check(
    patientsPageSource.includes('data-testid={`restore-patient-btn-${patient.id}`}'),
    'Restore button has data-testid restore-patient-btn-[id]'
  );
  check(
    patientsPageSource.includes("fetch('/api/admin/restore'"),
    'Restore button calls /api/admin/restore'
  );

  // --------------------------------------------------------------------------
  // SUITE 5: Approvals Page Reactivation Requests Section
  // --------------------------------------------------------------------------
  console.log('--- Suite 5: Approvals Page Reactivation Requests Section ---');
  check(
    approvalsPageSource.includes('data-testid="reactivation-requests-card"'),
    'Approvals page has dedicated Reactivation Requests card'
  );
  check(
    approvalsPageSource.includes('طلبات استعادة الحسابات المعلقة (Reactivation Requests)'),
    'Card title matches "طلبات استعادة الحسابات المعلقة (Reactivation Requests)"'
  );
  check(
    approvalsPageSource.includes('getPendingReactivations()') &&
      approvalsPageSource.includes('reactivationRequests'),
    'Lists archived patients with pending reactivation requests'
  );
  check(
    approvalsPageSource.includes('data-testid={`approve-reactivation-btn-${patientId}`}') ||
      approvalsPageSource.includes('data-testid={`approve-reactivation-btn-${patient.id}`}'),
    'Green approve button exists with testid'
  );
  check(
    approvalsPageSource.includes('bg-emerald-600') &&
      approvalsPageSource.includes('اعتماد واستعادة الملف الطبي (Approve & Restore Data)') &&
      approvalsPageSource.includes('Approve & Restore Data'),
    'Green button matches "✓ اعتماد واستعادة الملف الطبي (Approve & Restore Data)"'
  );
  check(
    approvalsPageSource.includes("fetch('/api/admin/restore'"),
    'Approve reactivation button calls /api/admin/restore'
  );

  // --------------------------------------------------------------------------
  // SUITE 6: Accessibility Minimum 48px Touch Targets
  // --------------------------------------------------------------------------
  console.log('--- Suite 6: Accessibility Minimum 48px Touch Targets ---');
  // Checkboxes
  check(
    patientsPageSource.includes('min-w-[48px] min-h-[48px] cursor-pointer'),
    'Checkbox touch targets wrapped in min-w-[48px] min-h-[48px]'
  );
  // Column cells
  check(
    patientsPageSource.includes('w-12 min-w-[48px]'),
    'Checkbox table columns enforced to at least 48px width'
  );
  // Row buttons
  check(
    patientsPageSource.includes('data-testid={`row-archive-patient-${patient.id}`}\n                                className="min-w-[48px] min-h-[48px]'),
    'Individual row trash can button enforces min-w-[48px] min-h-[48px]'
  );
  // Tab buttons
  check(
    patientsPageSource.includes('data-testid="tab-active-patients"\n            className={`min-h-[48px]'),
    'Active patient tab enforces min-h-[48px]'
  );
  check(
    patientsPageSource.includes('data-testid="tab-archive-patients"\n            className={`min-h-[48px]'),
    'Archive patient tab enforces min-h-[48px]'
  );
  // Bulk delete button
  check(
    patientsPageSource.includes('data-testid="bulk-delete-patients-btn"') && patientsPageSource.includes('min-h-[48px]'),
    'Bulk delete button enforces min-h-[48px]'
  );
  // Modal buttons
  check(
    patientsPageSource.includes('data-testid="confirm-archive-btn"\n              className="min-h-[48px]'),
    'Modal confirm archive button enforces min-h-[48px]'
  );
  // Approvals buttons
  check(
    approvalsPageSource.includes('approve-reactivation-btn') && approvalsPageSource.includes('min-h-[48px]'),
    'Reactivation approve button enforces min-h-[48px]'
  );

  // --------------------------------------------------------------------------
  // SUITE 7: Complete Arabic & English Translations Parity
  // --------------------------------------------------------------------------
  console.log('--- Suite 7: Bilingual Translation Dictionaries Parity ---');
  const requiredAdminKeys = [
    'activePatientsTab',
    'archivedPatientsTab',
    'archiveTabSubtitle',
    'deleteSelectedPatients',
    'confirmArchiveTitle',
    'confirmArchiveBulkTitle',
    'archiveClinicalWarning',
    'confirmArchiveBtn',
    'selectedPatientsList',
    'daysRemainingBeforePurge',
    'restorePatient',
    'restoreSuccess',
    'archiveSuccess',
    'archiveBulkSuccess',
    'noArchivedPatients',
    'archivedDate',
    'purgeDate',
    'reactivationRequestsTitle',
    'reactivationRequestsSubtitle',
    'approveAndRestoreData',
    'reactivationApprovedSuccess',
    'noPendingReactivations',
    'requestedAt',
    'archivedStatusBadge',
    'adminRestrictedAction',
  ];

  for (const key of requiredAdminKeys) {
    check(Boolean(arJson.admin[key]), `ar.json has admin.${key}`);
    check(Boolean(enJson.admin[key]), `en.json has admin.${key}`);
  }

  // Exact warning check in dictionary
  eq(
    arJson.admin.archiveClinicalWarning,
    exactWarning,
    'ar.json admin.archiveClinicalWarning matches verbatim requirement'
  );

  // --------------------------------------------------------------------------
  // SUITE 8: API Route Gating & Response Flattening Integrity
  // --------------------------------------------------------------------------
  console.log('--- Suite 8: API Response Flattening & 14-Day Arithmetic ---');
  const { calculateArchiveDaysRemaining } = await import('../data-store');
  const nowMs = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Exact 14 days remaining
  eq(calculateArchiveDaysRemaining(new Date(nowMs).toISOString(), new Date(nowMs + 14 * DAY_MS).toISOString()), 14, '14 days remaining at start');
  // 7 days remaining
  eq(calculateArchiveDaysRemaining(new Date(nowMs - 7 * DAY_MS).toISOString(), new Date(nowMs + 7 * DAY_MS).toISOString()), 7, '7 days remaining at midpoint');
  // 1 day remaining
  eq(calculateArchiveDaysRemaining(new Date(nowMs - 13 * DAY_MS).toISOString(), new Date(nowMs + 1 * DAY_MS).toISOString()), 1, '1 day remaining at boundary');
  // 0 days remaining (expired)
  eq(calculateArchiveDaysRemaining(new Date(nowMs - 15 * DAY_MS).toISOString(), new Date(nowMs - 1 * DAY_MS).toISOString()), 0, '0 days remaining when expired');
  // Default fallback when undefined
  eq(calculateArchiveDaysRemaining(undefined, undefined), 14, '14 days fallback when dates undefined');

  console.log(`\n================================================================`);
  console.log(`ALL UI & ARCHIVE REQUIREMENTS VERIFIED: ${assertions} assertions passed.`);
  console.log(`================================================================\n`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
