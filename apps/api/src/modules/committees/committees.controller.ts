import { Controller, Get, Param } from '@nestjs/common';
import { CommitteesService } from './committees.service.js';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller('committees')
export class CommitteesController {
  constructor(private readonly committeesService: CommitteesService) {}

  @Public()
  @Get()
  async getCommittees() {
    const committees = await this.committeesService.findAll();
    return { data: committees };
  }

  @Public()
  @Get(':code')
  async getCommitteeByCode(@Param('code') code: string) {
    const committee = await this.committeesService.findByCode(code);
    return { data: committee };
  }
}
