/**
 * Ids of demo rows that older builds seeded into every browser and synced to
 * the cloud. They are purged on read/merge so they never show for real patients.
 */
export const RETIRED_DEMO_LAB_IDS: ReadonlySet<string> = new Set(['demo-lab-1']);

export function isRetiredDemoLab(row: { id?: string } | null | undefined): boolean {
  return Boolean(row && row.id && RETIRED_DEMO_LAB_IDS.has(row.id));
}
