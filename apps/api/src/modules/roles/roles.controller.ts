import { Controller, Get, Param } from '@nestjs/common';
import { RolesService } from './roles.service.js';
import { Public } from '../../common/decorators/public.decorator.js';

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Public()
  @Get()
  async getRoles() {
    const roles = await this.rolesService.findAll();
    return { data: roles };
  }

  @Public()
  @Get(':code')
  async getRoleByCode(@Param('code') code: string) {
    const role = await this.rolesService.findByCode(code);
    return { data: role };
  }
}
