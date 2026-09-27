import { BadRequestException, Injectable } from '@nestjs/common';
import { Role, RoleName, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TokenService } from '../auth/token.service';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { hashPassword, verifyPassword } from '../common/utils/password.util';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async getProfile(userId: string): Promise<UserProfileResponseDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { role: true },
    });

    return this.toProfile(user);
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserProfileResponseDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { fullName: dto.fullName, avatarUrl: dto.avatarUrl },
      include: { role: true },
    });

    return this.toProfile(user);
  }

  /**
   * Changes the password and logs out every OTHER device. If the password was
   * changed because it leaked, any attacker session dies with it.
   */
  async changePassword(
    authUser: AuthUser,
    dto: ChangePasswordDto,
  ): Promise<number> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: authUser.id },
      select: { passwordHash: true },
    });

    // 400, not 401: a 401 would make most clients think the session expired.
    if (!(await verifyPassword(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    await this.prisma.user.update({
      where: { id: authUser.id },
      data: { passwordHash: await hashPassword(dto.newPassword) },
    });

    return this.tokenService.revokeAllSessions(authUser.id, authUser.sessionId);
  }

  /**
   * Permanently deletes the account. Sessions, subscription, conversations and
   * searches cascade away; usage logs keep their rows with user_id = NULL so
   * admin statistics stay correct.
   */
  async deleteAccount(authUser: AuthUser, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: authUser.id },
      select: { passwordHash: true, role: { select: { name: true } } },
    });

    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new BadRequestException('Password is incorrect');
    }

    if (user.role.name === RoleName.ADMIN) {
      const adminCount = await this.prisma.user.count({
        where: { role: { name: RoleName.ADMIN } },
      });
      if (adminCount <= 1) {
        throw new BadRequestException(
          'Cannot delete the last admin account. Promote another admin first.',
        );
      }
    }

    await this.prisma.user.delete({ where: { id: authUser.id } });
  }

  private toProfile(user: User & { role: Role }): UserProfileResponseDto {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl,
      role: user.role.name,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
