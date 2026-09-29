import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../common/auth.decorators';
import type { SessionUser } from '../common/auth.types';
import { LeadershipDecisionDto, LeadershipRequestDto } from './auth.dto';
import { LeadershipService } from './leadership.service';
@Controller('leadership-requests')
export class LeadershipController {
  constructor(private readonly service: LeadershipService) {}
  @Roles('SUPER_ADMIN', 'LEADER') @Get() list(
    @CurrentUser() u: SessionUser,
    @Query('page') p = '1',
    @Query('pageSize') ps = '20',
    @Query('status') s?: string,
  ) {
    return this.service.list(u, Number(p), Number(ps), s);
  }
  @Roles('LEADER') @Post() create(
    @CurrentUser() u: SessionUser,
    @Body() b: LeadershipRequestDto,
  ) {
    return this.service.create(u, b);
  }
  @Roles('SUPER_ADMIN') @Patch(':id/decision') decide(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() b: LeadershipDecisionDto,
  ) {
    return this.service.decide(u, id, b);
  }
}
