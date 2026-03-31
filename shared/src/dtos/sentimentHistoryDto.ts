import { z } from 'zod';

import { EmotionScoresSchema, TonalityScoresSchema } from '../domain';
import { IsoDateStringSchema } from '../primitives/date';

export const SentimentHistoryPointDtoSchema = z
  .object({
    createdAt: IsoDateStringSchema,
    count: z.number().int().nonnegative(),
    confidenceMass: z.number().nonnegative(),
    emotions: EmotionScoresSchema,
    tonalities: TonalityScoresSchema,
  })
  .brand<'SentimentHistoryPointDto'>();
export type SentimentHistoryPointDto = z.infer<
  typeof SentimentHistoryPointDtoSchema
>;
export type SentimentHistoryDto = SentimentHistoryPointDto[];
