import type { Item } from '../../../domain/entities';
import type { LlmPort } from '../../ports/output/LlmPort';
import type { LoggerPort } from '../../ports/output/LoggerPort';
import type {
  FilterRelevantItemsOptions,
  FilterRelevantItemsPort,
  FilterRelevantItemsResult,
} from '../../ports/pipeline/FilterRelevantItemsPort';
import { filterRelevantItems as filterRelevantItemsUsecase } from './filterRelevantItems';

export class LlmFilterRelevantItemsStep implements FilterRelevantItemsPort {
  constructor(
    private readonly llm: LlmPort,
    private readonly defaultOptions: Partial<FilterRelevantItemsOptions> = {},
  ) {}

  async filterRelevantItems(
    logger: LoggerPort,
    items: Item[],
    opts?: Partial<FilterRelevantItemsOptions>,
  ): Promise<FilterRelevantItemsResult> {
    return await filterRelevantItemsUsecase(
      logger.child({ scope: 'relevance.filter' }),
      items,
      this.llm,
      { ...this.defaultOptions, ...opts },
    );
  }
}
