import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { Role } from '@csi/shared';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Role[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { code: 'asc' },
    });

    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      created_at: r.createdAt.toISOString(),
    }));
  }

  async findByCode(code: string): Promise<Role> {
    const role = await this.prisma.role.findUnique({
      where: { code },
    });

    if (!role) {
      throw new NotFoundException(`Role with code '${code}' not found`);
    }

    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      created_at: role.createdAt.toISOString(),
    };
  }
}

