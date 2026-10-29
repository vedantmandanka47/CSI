import { Module } from '@nestjs/common';
import { CommitteesService } from './committees.service.js';
import { CommitteesController } from './committees.controller.js';
import { PrismaModule } from '../../infra/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [CommitteesController],
  providers: [CommitteesService],
  exports: [CommitteesService],
})
export class CommitteesModule {}
