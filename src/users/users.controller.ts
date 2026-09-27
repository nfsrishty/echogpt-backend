import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiAuth } from '../common/decorators/api-auth.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my profile' })
  @ApiOkResponse({ type: UserProfileResponseDto })
  getProfile(
    @CurrentUser('id') userId: string,
  ): Promise<UserProfileResponseDto> {
    return this.usersService.getProfile(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update my profile' })
  @ApiOkResponse({ type: UserProfileResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Validation failed',
  })
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    return this.usersService.updateProfile(userId, dto);
  }

  @Patch('me/password')
  @ApiOperation({
    summary: 'Change my password',
    description:
      'Also logs out all other devices. The current session stays active.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'Current password incorrect, or new password invalid/unchanged',
  })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    const revoked = await this.usersService.changePassword(user, dto);

    return {
      message: `Password changed. Logged out of ${revoked} other session(s).`,
    };
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete my account',
    description:
      'Permanently deletes the account and all its data. Requires the current password.',
  })
  @ApiNoContentResponse({ description: 'Account deleted' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Password incorrect, or this is the last admin',
  })
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    await this.usersService.deleteAccount(user, dto.password);
  }
}
