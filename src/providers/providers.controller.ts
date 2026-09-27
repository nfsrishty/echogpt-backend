import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { ApiAuth } from '../common/decorators/api-auth.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { CreateProviderDto } from './dto/create-provider.dto';
import {
  AvailableProviderDto,
  ProviderHealthDto,
  ProviderResponseDto,
} from './dto/provider-response.dto';
import { UpdateProviderStatusDto } from './dto/update-provider-status.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { ProvidersService } from './providers.service';

const AdminOnly = () => Roles(RoleName.ADMIN);

/**
 * Ready-to-use Swagger examples, one per provider. None sets baseUrl: it is
 * only for proxies/gateways, and leaving it out uses the official endpoint.
 */
const CREATE_EXAMPLES = {
  openai: {
    summary: 'OpenAI',
    value: {
      name: 'GPT-4o',
      type: 'OPENAI',
      defaultModel: 'gpt-4o',
      apiKey: 'sk-proj-your-openai-key',
    },
  },
  anthropic: {
    summary: 'Anthropic (Claude)',
    value: {
      name: 'Claude',
      type: 'ANTHROPIC',
      defaultModel: 'claude-sonnet-4-5',
      apiKey: 'sk-ant-your-anthropic-key',
    },
  },
  gemini: {
    summary: 'Google Gemini',
    value: {
      name: 'Gemini',
      type: 'GEMINI',
      defaultModel: 'gemini-2.5-flash',
      apiKey: 'AIza-your-gemini-key',
    },
  },
};

const UPDATE_EXAMPLES = {
  rotateKey: {
    summary: 'Rotate the API key',
    value: { apiKey: 'new-api-key-value' },
  },
  changeModel: {
    summary: 'Change the default model',
    value: { defaultModel: 'gpt-4o-mini' },
  },
};

@ApiTags('AI Providers')
@ApiAuth()
@ApiForbiddenResponse({
  type: ErrorResponseDto,
  description: 'Admin role required (admin routes)',
})
@Controller('providers')
export class ProvidersController {
  constructor(private readonly providersService: ProvidersService) {}

  @Get('available')
  @ApiOperation({
    summary: 'List enabled providers (for the model picker)',
    description: 'Available to every authenticated user. Contains no secrets.',
  })
  @ApiOkResponse({ type: AvailableProviderDto, isArray: true })
  listAvailable(): Promise<AvailableProviderDto[]> {
    return this.providersService.listAvailable();
  }

  @Get('health')
  @AdminOnly()
  @ApiOperation({ summary: '[Admin] Health-check every enabled provider' })
  @ApiOkResponse({ type: ProviderHealthDto, isArray: true })
  checkAllHealth(): Promise<ProviderHealthDto[]> {
    return this.providersService.checkAllHealth();
  }

  @Get()
  @AdminOnly()
  @ApiOperation({ summary: '[Admin] List all providers' })
  @ApiOkResponse({ type: ProviderResponseDto, isArray: true })
  listAll(): Promise<ProviderResponseDto[]> {
    return this.providersService.listAll();
  }

  @Get(':id')
  @AdminOnly()
  @ApiOperation({ summary: '[Admin] Get a provider' })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProviderResponseDto> {
    return this.providersService.findOne(id);
  }

  @Post()
  @AdminOnly()
  @ApiOperation({
    summary: '[Admin] Add a provider',
    description: 'The API key is encrypted with AES-256-GCM before storage.',
  })
  @ApiBody({ type: CreateProviderDto, examples: CREATE_EXAMPLES })
  @ApiCreatedResponse({ type: ProviderResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Validation failed',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Name already in use',
  })
  create(@Body() dto: CreateProviderDto): Promise<ProviderResponseDto> {
    return this.providersService.create(dto);
  }

  @Patch(':id')
  @AdminOnly()
  @ApiBody({ type: UpdateProviderDto, examples: UPDATE_EXAMPLES })
  @ApiOperation({
    summary: '[Admin] Edit a provider',
    description:
      'Send apiKey only to rotate it. Resets health status to UNKNOWN.',
  })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Name already in use',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderDto,
  ): Promise<ProviderResponseDto> {
    return this.providersService.update(id, dto);
  }

  @Delete(':id')
  @AdminOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: '[Admin] Delete a provider' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.providersService.remove(id);
  }

  @Patch(':id/status')
  @AdminOnly()
  @ApiOperation({
    summary: '[Admin] Enable or disable a provider',
    description: 'Disabling the default provider also clears its default flag.',
  })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderStatusDto,
  ): Promise<ProviderResponseDto> {
    return this.providersService.setStatus(id, dto.isEnabled);
  }

  @Patch(':id/default')
  @AdminOnly()
  @ApiOperation({ summary: '[Admin] Make this the default provider' })
  @ApiOkResponse({ type: ProviderResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Provider is disabled',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  setDefault(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProviderResponseDto> {
    return this.providersService.setDefault(id);
  }

  @Post(':id/health-check')
  @AdminOnly()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[Admin] Health-check one provider',
    description:
      'Sends a tiny prompt to the configured model, which validates the API key, the model name and current availability, then stores the result.',
  })
  @ApiOkResponse({ type: ProviderHealthDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  checkHealth(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ProviderHealthDto> {
    return this.providersService.checkHealth(id);
  }
}
