import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Email is stored already-normalized (lowercased + trimmed) by the
  // service layer. Repository queries are case-sensitive and assume
  // the caller has normalized.
  //
  // findByEmail and findById default-exclude soft-deleted users so
  // login / /auth/me / signup-uniqueness behave as if the user no
  // longer exists. Admin/recovery flows that need the soft-deleted
  // row can use findByIdIncludingDeleted explicitly — the verbose
  // name protects against accidents.
  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { email, deletedAt: null } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  findByIdIncludingDeleted(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(
    data: Pick<Prisma.UserCreateInput, 'email' | 'passwordHash' | 'displayName'>,
  ): Promise<User> {
    return this.prisma.user.create({ data });
  }

  // Idempotent: if the user is already soft-deleted, the timestamp is
  // refreshed rather than thrown — DELETE /auth/me can be replayed
  // safely. updateMany silently no-ops on a missing id, which suits
  // the "we already 401'd if the JWT was invalid" guarantee upstream.
  async softDelete(id: string): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
