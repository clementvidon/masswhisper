import { ReportSchema } from '@masswhisper/shared/domain';
import { IsoDateStringSchema } from '@masswhisper/shared/primitives';
import { z } from 'zod';

import { roundNumber } from '../../lib/number/roundNumber';
import {
  AggregatedSentimentProfileSchema,
  ItemRelevanceSchema,
  ItemSchema,
  WeightedItemSchema,
  WeightedSentimentProfileSchema,
} from '../entities';

/**
 * Backend-owned persisted snapshot contract.
 *
 * - Represents one pipeline execution snapshot
 * - Defines the persistence storage contract
 * - Enforces internal consistency invariants
 *
 * Not a shared cross-workspace contract.
 */

const equalRounded = (a: number, b: number): boolean =>
  roundNumber(a) === roundNumber(b);

/* Schemas */

export const SnapshotIssueSchema = z
  .object({
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
  })
  .strict();

export const SnapshotDataShape = z
  .object({
    status: z.enum(['ok', 'degraded']),
    issues: z.array(SnapshotIssueSchema),

    fetchedItems: z.array(ItemSchema),
    itemsRelevance: z.array(ItemRelevanceSchema),

    weightedItems: z.array(WeightedItemSchema),
    weightedSentimentProfiles: z.array(WeightedSentimentProfileSchema),

    aggregatedSentimentProfile: AggregatedSentimentProfileSchema,
    report: ReportSchema,
  })
  .strict();

/* Types */

type SnapshotDataShapeValue = z.infer<typeof SnapshotDataShape>;

type PipelineSnapshotShapeValue = SnapshotDataShapeValue & {
  id: string;
  createdAt: z.infer<typeof IsoDateStringSchema>;
};

export type SnapshotData = SnapshotDataShapeValue;
export type PipelineSnapshot = PipelineSnapshotShapeValue;
export type SnapshotIssue = z.infer<typeof SnapshotIssueSchema>;

/* Validation */

function validateSnapshotConsistency(
  snapshot: SnapshotDataShapeValue,
  ctx: z.RefinementCtx,
) {
  const {
    fetchedItems,
    itemsRelevance,
    weightedItems,
    weightedSentimentProfiles,
    aggregatedSentimentProfile,
  } = snapshot;

  /* relevance alignment */

  if (fetchedItems.length !== itemsRelevance.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['itemsRelevance'],
      message: 'fetchedItems and itemsRelevance must have the same length.',
    });
  }

  for (
    let i = 0;
    i < Math.min(fetchedItems.length, itemsRelevance.length);
    i++
  ) {
    if (fetchedItems[i].itemRef !== itemsRelevance[i].itemRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['itemsRelevance', i, 'itemRef'],
        message: 'fetchedItems and itemsRelevance must stay aligned.',
      });
    }
  }

  /* weighted alignment */

  if (weightedItems.length !== weightedSentimentProfiles.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['weightedSentimentProfiles'],
      message:
        'weightedItems and weightedSentimentProfiles must have the same length.',
    });
  }

  for (
    let i = 0;
    i < Math.min(weightedItems.length, weightedSentimentProfiles.length);
    i++
  ) {
    const item = weightedItems[i];
    const profile = weightedSentimentProfiles[i];

    if (item.itemRef !== profile.itemRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['weightedSentimentProfiles', i, 'itemRef'],
        message:
          'weightedItems and weightedSentimentProfiles must stay aligned.',
      });
    }

    if (profile.status === 'fallback' && profile.weight !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['weightedSentimentProfiles', i, 'weight'],
        message: 'Fallback sentiment profiles must have weight 0.',
      });
    }
  }

  /* aggregation integrity */

  if (aggregatedSentimentProfile.count !== weightedSentimentProfiles.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['aggregatedSentimentProfile', 'count'],
      message: 'Aggregated count must match weightedSentimentProfiles.length.',
    });
  }

  const confidenceMass = weightedSentimentProfiles.reduce(
    (sum, profile) => sum + profile.weight,
    0,
  );

  if (
    !equalRounded(aggregatedSentimentProfile.confidenceMass, confidenceMass)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['aggregatedSentimentProfile', 'confidenceMass'],
      message:
        'Aggregated confidenceMass must equal the sum of profile weights.',
    });
  }
}

/* final schemas */

export const SnapshotDataSchema: z.ZodType<SnapshotDataShapeValue> =
  SnapshotDataShape.superRefine(validateSnapshotConsistency);

export const PipelineSnapshotSchema: z.ZodType<PipelineSnapshotShapeValue> =
  SnapshotDataShape.extend({
    id: z.string().uuid(),
    createdAt: IsoDateStringSchema,
  })
    .strict()
    .superRefine(validateSnapshotConsistency);
