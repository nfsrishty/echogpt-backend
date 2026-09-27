import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateProviderDto } from './create-provider.dto';

/**
 * All editable fields optional. Enable/disable and default selection have
 * their own endpoints, so their side effects stay explicit.
 */
export class UpdateProviderDto extends PartialType(
  OmitType(CreateProviderDto, ['isEnabled', 'isDefault'] as const),
) {}
