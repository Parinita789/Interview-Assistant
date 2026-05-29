import { UsersRepository } from './users.repository';
import type { PrismaService } from '../../../database/prisma.service';

function makeRepo() {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  } as unknown as PrismaService;
  return { repo: new UsersRepository(prisma), prisma };
}

describe('UsersRepository.findByEmail', () => {
  it('queries by the email predicate AND excludes soft-deleted', async () => {
    const { repo, prisma } = makeRepo();
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'u', email: 'a@b.com' });
    await repo.findByEmail('a@b.com');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: 'a@b.com', deletedAt: null },
    });
  });

  it('returns null when no row matches', async () => {
    const { repo, prisma } = makeRepo();
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(repo.findByEmail('nobody@x.com')).resolves.toBeNull();
  });

  it('does NOT lowercase / trim — service layer is responsible (asymmetric storage would mask a bug)', async () => {
    const { repo, prisma } = makeRepo();
    (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    await repo.findByEmail('  Mixed@Case.com  ');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: '  Mixed@Case.com  ', deletedAt: null },
    });
  });
});

describe('UsersRepository.findById', () => {
  it('queries by primary key AND excludes soft-deleted', async () => {
    const { repo, prisma } = makeRepo();
    (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'uid-1' });
    await repo.findById('uid-1');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'uid-1', deletedAt: null },
    });
  });
});

describe('UsersRepository.findByIdIncludingDeleted', () => {
  it('uses findUnique so soft-deleted rows are returned (admin/recovery)', async () => {
    const { repo, prisma } = makeRepo();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'uid-1',
      deletedAt: new Date(),
    });
    const row = await repo.findByIdIncludingDeleted('uid-1');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'uid-1' } });
    expect(row?.deletedAt).toBeInstanceOf(Date);
  });
});

describe('UsersRepository.softDelete', () => {
  it('writes deletedAt via updateMany (idempotent — already-deleted refresh is fine)', async () => {
    const { repo, prisma } = makeRepo();
    (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    await repo.softDelete('uid-1');
    const call = (prisma.user.updateMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({ id: 'uid-1' });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
  });

  it('silently no-ops when the id is missing (no throw — caller already validated JWT upstream)', async () => {
    const { repo, prisma } = makeRepo();
    (prisma.user.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    await expect(repo.softDelete('missing-uid')).resolves.toBeUndefined();
  });
});

describe('UsersRepository.create', () => {
  it('passes email + passwordHash + displayName to Prisma (no extra fields slip in)', async () => {
    const { repo, prisma } = makeRepo();
    (prisma.user.create as jest.Mock).mockResolvedValue({
      id: 'new',
      email: 'a@b.com',
      passwordHash: '$2b$12$xxx',
      createdAt: new Date(),
    });
    await repo.create({
      email: 'a@b.com',
      passwordHash: '$2b$12$xxx',
      displayName: 'Alice',
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: { email: 'a@b.com', passwordHash: '$2b$12$xxx', displayName: 'Alice' },
    });
  });
});
