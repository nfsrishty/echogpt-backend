import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiProvider, ProviderHealthStatus } from '@prisma/client';
import { CryptoService } from '../common/crypto/crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { createAdapter } from './adapters/adapter.factory';
import { AiProviderAdapter } from './adapters/ai-provider.adapter';
import { CreateProviderDto } from './dto/create-provider.dto';
import {
  AvailableProviderDto,
  ProviderHealthDto,
  ProviderResponseDto,
} from './dto/provider-response.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { describeHealthFailure } from './provider-errors';

export interface ResolvedProvider {
  provider: AiProvider;
  adapter: AiProviderAdapter;
}

@Injectable()
export class ProvidersService {
  private readonly logger = new Logger(ProvidersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: CryptoService,
  ) {}

  // ---------- queries ----------

  async listAvailable(): Promise<AvailableProviderDto[]> {
    const providers = await this.prisma.aiProvider.findMany({
      where: { isEnabled: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    return providers.map((provider) => this.toAvailable(provider));
  }

  async listAll(): Promise<ProviderResponseDto[]> {
    const providers = await this.prisma.aiProvider.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    return providers.map((provider) => this.toResponse(provider));
  }

  async findOne(id: string): Promise<ProviderResponseDto> {
    return this.toResponse(await this.getOrThrow(id));
  }

  // ---------- commands ----------

  async create(dto: CreateProviderDto): Promise<ProviderResponseDto> {
    const isEnabled = dto.isEnabled ?? true;
    const hasDefault =
      (await this.prisma.aiProvider.count({ where: { isDefault: true } })) > 0;
    // First enabled provider becomes the default automatically.
    const isDefault = dto.isDefault ?? (isEnabled && !hasDefault);

    if (isDefault && !isEnabled) {
      throw new BadRequestException(
        'A disabled provider cannot be the default',
      );
    }

    const provider = await this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.aiProvider.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.aiProvider.create({
        data: {
          name: dto.name,
          type: dto.type,
          defaultModel: dto.defaultModel,
          baseUrl: dto.baseUrl,
          isEnabled,
          isDefault,
          ...this.encryptKey(dto.apiKey),
        },
      });
    });

    return this.toResponse(provider);
  }

  async update(
    id: string,
    dto: UpdateProviderDto,
  ): Promise<ProviderResponseDto> {
    await this.getOrThrow(id);

    const provider = await this.prisma.aiProvider.update({
      where: { id },
      data: {
        name: dto.name,
        type: dto.type,
        defaultModel: dto.defaultModel,
        baseUrl: dto.baseUrl,
        ...(dto.apiKey ? this.encryptKey(dto.apiKey) : {}),
        // Config changed: the previous health result no longer applies.
        healthStatus: ProviderHealthStatus.UNKNOWN,
        lastHealthCheck: null,
      },
    });

    return this.toResponse(provider);
  }

  async remove(id: string): Promise<void> {
    await this.getOrThrow(id);
    // Conversations/messages keep their rows with provider_id = NULL.
    await this.prisma.aiProvider.delete({ where: { id } });
  }

  async setStatus(
    id: string,
    isEnabled: boolean,
  ): Promise<ProviderResponseDto> {
    await this.getOrThrow(id);

    const provider = await this.prisma.aiProvider.update({
      where: { id },
      // A disabled provider can't stay the default.
      data: isEnabled ? { isEnabled } : { isEnabled, isDefault: false },
    });

    return this.toResponse(provider);
  }

  async setDefault(id: string): Promise<ProviderResponseDto> {
    const existing = await this.getOrThrow(id);
    if (!existing.isEnabled) {
      throw new BadRequestException(
        'Enable the provider before making it the default',
      );
    }

    // Unset-then-set in one transaction: there is never a moment with two defaults.
    const [, provider] = await this.prisma.$transaction([
      this.prisma.aiProvider.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      }),
      this.prisma.aiProvider.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);

    return this.toResponse(provider);
  }

  // ---------- health ----------

  async checkHealth(id: string): Promise<ProviderHealthDto> {
    return this.runHealthCheck(await this.getOrThrow(id));
  }

  async checkAllHealth(): Promise<ProviderHealthDto[]> {
    const providers = await this.prisma.aiProvider.findMany({
      where: { isEnabled: true },
      orderBy: { name: 'asc' },
    });

    // In parallel: total time = slowest provider, not the sum.
    return Promise.all(providers.map((p) => this.runHealthCheck(p)));
  }

  private async runHealthCheck(
    provider: AiProvider,
  ): Promise<ProviderHealthDto> {
    const startedAt = Date.now();
    let status: ProviderHealthStatus = ProviderHealthStatus.HEALTHY;
    let error: string | null = null;

    try {
      await this.adapterFor(provider).healthCheck(provider.defaultModel);
    } catch (caught) {
      status = ProviderHealthStatus.UNHEALTHY;
      error = describeHealthFailure(caught, provider.defaultModel);
      this.logger.warn(
        `Health check failed for "${provider.name}": ${(caught as Error).message}`,
      );
    }

    const checkedAt = new Date();
    await this.prisma.aiProvider.update({
      where: { id: provider.id },
      data: { healthStatus: status, lastHealthCheck: checkedAt },
    });

    return {
      providerId: provider.id,
      name: provider.name,
      status,
      latencyMs: Date.now() - startedAt,
      checkedAt,
      error,
    };
  }

  // ---------- used by chat ----------

  /**
   * Picks the provider for a chat request, in priority order:
   * 1. the one the user explicitly selected (must be enabled),
   * 2. the one the conversation used last (if still enabled),
   * 3. the admin's default, 4. any enabled provider.
   */
  async resolveForChat(
    requestedId?: string,
    preferredId?: string | null,
  ): Promise<ResolvedProvider> {
    if (requestedId) {
      const requested = await this.prisma.aiProvider.findUnique({
        where: { id: requestedId },
      });
      if (!requested || !requested.isEnabled) {
        throw new BadRequestException(
          'The selected AI provider is not available',
        );
      }
      return { provider: requested, adapter: this.adapterFor(requested) };
    }

    const candidates = await this.prisma.aiProvider.findMany({
      where: { isEnabled: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    const provider =
      candidates.find((candidate) => candidate.id === preferredId) ??
      candidates[0];

    if (!provider) {
      throw new ServiceUnavailableException(
        'No AI provider is configured. An admin must add one.',
      );
    }

    return { provider, adapter: this.adapterFor(provider) };
  }

  // ---------- helpers ----------

  private adapterFor(provider: AiProvider): AiProviderAdapter {
    const apiKey = this.cryptoService.decrypt({
      ciphertext: provider.encryptedApiKey,
      iv: provider.apiKeyIv,
      authTag: provider.apiKeyAuthTag,
    });

    return createAdapter(provider.type, { apiKey, baseUrl: provider.baseUrl });
  }

  private encryptKey(apiKey: string) {
    const { ciphertext, iv, authTag } = this.cryptoService.encrypt(apiKey);

    return {
      encryptedApiKey: ciphertext,
      apiKeyIv: iv,
      apiKeyAuthTag: authTag,
      apiKeyLast4: apiKey.slice(-4),
    };
  }

  private async getOrThrow(id: string): Promise<AiProvider> {
    const provider = await this.prisma.aiProvider.findUnique({ where: { id } });
    if (!provider) {
      throw new NotFoundException('AI provider not found');
    }
    return provider;
  }

  private toAvailable(provider: AiProvider): AvailableProviderDto {
    return {
      id: provider.id,
      name: provider.name,
      type: provider.type,
      defaultModel: provider.defaultModel,
      isDefault: provider.isDefault,
    };
  }

  private toResponse(provider: AiProvider): ProviderResponseDto {
    return {
      ...this.toAvailable(provider),
      baseUrl: provider.baseUrl,
      apiKeyMasked: `••••${provider.apiKeyLast4}`,
      isEnabled: provider.isEnabled,
      healthStatus: provider.healthStatus,
      lastHealthCheck: provider.lastHealthCheck,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }
}
