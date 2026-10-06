import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser, Public } from '../common/auth.decorators';
import type { SessionUser } from '../common/auth.types';
import { AcceptInvitationDto, InvitationDto, LoginDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Post('auth/login') @HttpCode(HttpStatus.OK) login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.login(input, response);
  }
  @Get('auth/me') me(@CurrentUser() user: SessionUser) {
    return { user };
  }
  @Post('auth/logout') @HttpCode(HttpStatus.NO_CONTENT) logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.logout(
      [
        request.cookies?.mg_session_partitioned as string | undefined,
        request.cookies?.mg_session as string | undefined,
      ],
      response,
    );
  }
  @Post('users/invitations') invite(
    @CurrentUser() user: SessionUser,
    @Body() input: InvitationDto,
  ) {
    return this.auth.invite(user, input);
  }
  @Get('users/invitations') listInvitations(@CurrentUser() user: SessionUser) {
    return this.auth.listInvitations(user);
  }
  @Post('users/invitations/:id/link') refreshInvitationLink(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) invitationId: string,
  ) {
    return this.auth.refreshInvitationLink(user, invitationId);
  }
  @Public()
  @Get('users/invitations/:token/validate')
  @Header('Cache-Control', 'no-store')
  validateInvitation(@Param('token') token: string) {
    return this.auth.validateInvitation(token);
  }
  @Public()
  @Post('users/invitations/:token/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @Param('token') token: string,
    @Body() input: AcceptInvitationDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.accept(token, input, response);
  }
}
