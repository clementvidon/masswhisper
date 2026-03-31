import { type HeadlineDto, HeadlineDtoSchema } from '@masswhisper/shared/dtos';

import { formatFloat } from '../../../lib/number/formatFloat';
import type { PersistencePort } from '../../ports/output/PersistencePort';

function mapHeadlineToDto(raw: {
  title: string;
  weight: number;
  itemRef: string;
}): HeadlineDto {
  return HeadlineDtoSchema.parse({
    title: raw.title,
    weight: formatFloat(raw.weight, 0),
    itemRef: raw.itemRef,
  });
}

export async function getTopHeadlines(
  persistence: PersistencePort,
  limit = 10,
): Promise<HeadlineDto[]> {
  const headlines = await persistence.getLatestHeadlines();
  if (!headlines) return [];

  return headlines
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map(mapHeadlineToDto);
}
