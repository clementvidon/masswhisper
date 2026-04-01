import { type Report, ReportSchema } from '@masswhisper/shared/domain';
import { useEffect, useState } from 'react';

import { buildFrontendResourceUrl } from '../../config/runtime';

function parseReportJson(data: unknown): Report {
  const parsed = ReportSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Format de données invalide');
  }
  return parsed.data;
}

export function useReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function loadReport() {
      try {
        const res = await fetch(buildFrontendResourceUrl('report'));
        const data: unknown = res.ok ? await res.json() : null;
        setReport(parseReportJson(data));
      } catch (err: unknown) {
        setError(err instanceof Error ? err : new Error('Erreur inconnue'));
        setReport(null);
      }
    }

    void loadReport();
  }, []);

  return {
    report,
    isLoading: report === null && error === null,
    error,
  };
}
