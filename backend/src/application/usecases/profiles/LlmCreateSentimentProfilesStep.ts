import type { RelevantItem } from '../../../domain/entities';
import type { LlmPort } from '../../ports/output/LlmPort';
import type { LoggerPort } from '../../ports/output/LoggerPort';
import type {
  CreateSentimentProfilesOptions,
  CreateSentimentProfilesPort,
} from '../../ports/pipeline/CreateSentimentProfilesPort';
import { createSentimentProfiles as createSentimentProfilesUsecase } from './createSentimentProfiles';

export class LlmCreateSentimentProfilesStep
  implements CreateSentimentProfilesPort
{
  constructor(
    private readonly llm: LlmPort,
    private readonly defaultOptions: Partial<CreateSentimentProfilesOptions> = {},
  ) {}

  async createSentimentProfiles(
    logger: LoggerPort,
    items: RelevantItem[],
    opts?: Partial<CreateSentimentProfilesOptions>,
  ) {
    return await createSentimentProfilesUsecase(
      logger.child({ scope: 'profiles.create' }),
      items,
      this.llm,
      { ...this.defaultOptions, ...opts },
    );
  }
}
