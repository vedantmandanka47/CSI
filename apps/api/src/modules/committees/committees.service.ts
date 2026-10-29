import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { Committee } from '@csi/shared';

@Injectable()
export class CommitteesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Committee[]> {
    const committees = await this.prisma.committee.findMany({
      orderBy: { code: 'asc' },
    });

    return committees.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      description: c.description,
      created_at: c.createdAt.toISOString(),
    }));
  }

  async findByCode(code: string): Promise<Committee> {
    const committee = await this.prisma.committee.findUnique({
      where: { code },
    });

    if (!committee) {
      throw new NotFoundException(`Committee with code '${code}' not found`);
    }

    return {
      id: committee.id,
      code: committee.code,
      name: committee.name,
      description: committee.description,
      created_at: committee.createdAt.toISOString(),
    };
  }
}
