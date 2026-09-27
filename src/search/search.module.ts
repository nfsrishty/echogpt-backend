import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { WebSearchEngine } from './web-search.engine';

@Module({
  imports: [ProvidersModule],
  controllers: [SearchController],
  providers: [SearchService, WebSearchEngine],
})
export class SearchModule {}
