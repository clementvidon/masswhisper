import type { Report } from '@masswhisper/shared/domain';

import type { PersistencePort } from '../../ports/output/PersistencePort';

export async function getLastReport(
  persistence: PersistencePort,
): Promise<Report | null> {
  return persistence.getLatestReport();
}
