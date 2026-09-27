import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination.dto';
import { ProviderRefDto } from '../../chat/dto/chat-response.dto';

export class SearchResultDto {
  @ApiProperty({ example: 'Solid-state batteries: 2026 progress report' })
  title: string;

  @ApiProperty({ example: 'https://example.com/solid-state-2026' })
  url: string;

  @ApiProperty({
    example: 'Researchers reported a sulfide electrolyte that...',
  })
  snippet: string;

  @ApiProperty({ type: Number, nullable: true, example: 0.87 })
  score: number | null;
}

export class SearchResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: 'ID of this entry in your search history',
  })
  id: string;

  @ApiProperty({ example: 'latest developments in solid-state batteries' })
  query: string;

  @ApiProperty({ type: SearchResultDto, isArray: true })
  results: SearchResultDto[];

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Recent work focuses on sulfide electrolytes [1] and...',
    description:
      'AI answer citing results as [1], [2]. null if not requested or unavailable.',
  })
  aiSummary: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description:
      'Why the summary is missing, if it was requested but could not be generated',
  })
  summaryError: string | null;

  @ApiProperty({ type: ProviderRefDto, nullable: true })
  provider: ProviderRefDto | null;

  @ApiProperty({ example: false, description: 'Served from the result cache' })
  fromCache: boolean;

  @ApiProperty()
  searchedAt: Date;
}

export class SearchHistoryItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'latest developments in solid-state batteries' })
  query: string;

  @ApiProperty({ example: 5 })
  resultCount: number;

  @ApiProperty({ example: false })
  fromCache: boolean;

  @ApiProperty()
  createdAt: Date;
}

export class SearchHistoryResponseDto {
  @ApiProperty({ type: SearchHistoryItemDto, isArray: true })
  items: SearchHistoryItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}

export class RecentSearchDto {
  @ApiProperty({ example: 'solid-state batteries' })
  query: string;

  @ApiProperty()
  lastSearchedAt: Date;

  @ApiProperty({ example: 3 })
  timesSearched: number;
}

export class SuggestionDto {
  @ApiProperty({ example: 'solid-state batteries' })
  query: string;

  @ApiProperty({
    enum: ['history', 'popular'],
    example: 'history',
    description:
      'history = your own past search; popular = searched by several users',
  })
  source: 'history' | 'popular';
}
