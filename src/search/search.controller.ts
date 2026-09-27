import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { ApiAuth } from '../common/decorators/api-auth.decorator';
import { ConsumesQuota } from '../common/decorators/consumes-quota.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import type { AuthenticatedRequest } from '../common/interfaces/auth-user.interface';
import {
  RecentSearchesQueryDto,
  SearchRequestDto,
  SuggestionsQueryDto,
} from './dto/search-request.dto';
import {
  RecentSearchDto,
  SearchHistoryResponseDto,
  SearchResponseDto,
  SuggestionDto,
} from './dto/search-response.dto';
import { SearchService } from './search.service';

@ApiTags('Web Search')
@ApiAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ConsumesQuota()
  @ApiOperation({
    summary: 'Search the web, with an optional AI answer citing the results',
    description:
      'Identical searches are served from a cache for SEARCH_CACHE_TTL_SECONDS. Uses 1 request from the daily quota. If the AI summary fails, results are still returned with summaryError set.',
  })
  @ApiBody({
    type: SearchRequestDto,
    examples: {
      withAiAnswer: {
        summary: 'Search + AI answer (default provider)',
        value: { query: 'latest developments in solid-state batteries' },
      },
      resultsOnly: {
        summary: 'Results only, no AI',
        value: {
          query: 'nestjs prisma tutorial',
          summarize: false,
          maxResults: 8,
        },
      },
    },
  })
  @ApiOkResponse({ type: SearchResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Validation failed or provider unavailable',
  })
  @ApiTooManyRequestsResponse({
    type: ErrorResponseDto,
    description: 'Daily quota exceeded',
  })
  @ApiBadGatewayResponse({
    type: ErrorResponseDto,
    description: 'The search service failed',
  })
  @ApiServiceUnavailableResponse({
    type: ErrorResponseDto,
    description: 'Search service rate-limited',
  })
  search(
    @CurrentUser('id') userId: string,
    @Body() dto: SearchRequestDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<SearchResponseDto> {
    return this.searchService.search(userId, dto, request);
  }

  @Get('history')
  @ApiOperation({ summary: 'My search history (newest first)' })
  @ApiOkResponse({ type: SearchHistoryResponseDto })
  getHistory(
    @CurrentUser('id') userId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<SearchHistoryResponseDto> {
    return this.searchService.getHistory(userId, query);
  }

  @Get('recent')
  @ApiOperation({ summary: 'My recent distinct searches' })
  @ApiOkResponse({ type: RecentSearchDto, isArray: true })
  getRecent(
    @CurrentUser('id') userId: string,
    @Query() query: RecentSearchesQueryDto,
  ): Promise<RecentSearchDto[]> {
    return this.searchService.getRecent(userId, query.limit);
  }

  @Get('suggestions')
  @ApiOperation({
    summary: 'Autocomplete suggestions for a partial query',
    description:
      "Your own past searches first, then queries searched by at least 3 different users in the last 30 days (so nobody's private searches are exposed).",
  })
  @ApiOkResponse({ type: SuggestionDto, isArray: true })
  getSuggestions(
    @CurrentUser('id') userId: string,
    @Query() query: SuggestionsQueryDto,
  ): Promise<SuggestionDto[]> {
    return this.searchService.getSuggestions(userId, query.q);
  }

  @Delete('history/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one entry from my search history' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async deleteHistoryItem(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.searchService.deleteHistoryItem(userId, id);
  }

  @Delete('history')
  @ApiOperation({ summary: 'Clear my whole search history' })
  @ApiOkResponse({ type: MessageResponseDto })
  async clearHistory(
    @CurrentUser('id') userId: string,
  ): Promise<MessageResponseDto> {
    const count = await this.searchService.clearHistory(userId);

    return { message: `Deleted ${count} search(es) from history` };
  }
}
