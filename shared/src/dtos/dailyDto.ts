import { z } from 'zod';

import { ReportSchema } from '../domain';
import { IsoDateStringSchema } from '../primitives/date';
import { HeadlineDtoSchema } from './headlineDto';
import { SentimentHistoryPointDtoSchema } from './sentimentHistoryDto';

export const DailyDtoSchema = z
  .object({
    generatedAt: IsoDateStringSchema,
    snapshotCreatedAt: IsoDateStringSchema,
    report: ReportSchema,
    headlines: HeadlineDtoSchema.array(),
    sentimentHistory: SentimentHistoryPointDtoSchema.array(),
  })
  .strict();

export type DailyDto = z.infer<typeof DailyDtoSchema>;
