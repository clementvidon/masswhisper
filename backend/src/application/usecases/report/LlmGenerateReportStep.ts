import type { AggregatedSentimentProfile } from '../../../domain/entities';
import type { LlmPort } from '../../ports/output/LlmPort';
import type { LoggerPort } from '../../ports/output/LoggerPort';
import type {
  GenerateReportOptions,
  GenerateReportPort,
} from '../../ports/pipeline/GenerateReportPort';
import { generateReport as generateReportUsecase } from './generateReport';

export class LlmGenerateReportStep implements GenerateReportPort {
  constructor(
    private readonly llm: LlmPort,
    private readonly defaultOptions: Partial<GenerateReportOptions> = {},
  ) {}

  async generateReport(
    logger: LoggerPort,
    aggregatedSentimentProfile: AggregatedSentimentProfile,
    opts?: Partial<GenerateReportOptions>,
  ) {
    return await generateReportUsecase(
      logger.child({ scope: 'report.generate' }),
      aggregatedSentimentProfile,
      this.llm,
      { ...this.defaultOptions, ...opts },
    );
  }
}
