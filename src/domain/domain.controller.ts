import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../common/auth.decorators';
import type { SessionUser } from '../common/auth.types';
import { ProblemException } from '../common/problem.exception';
import { DomainService } from './domain.service';
import {
  GenerateDto,
  MemberDto,
  MinistryDto,
  NewsDto,
  OccurrenceDto,
  ParishDto,
  ReplaceMembersDto,
  SetlistDto,
  SongDto,
} from './domain.dto';

@Controller()
export class DomainController {
  constructor(private readonly domain: DomainService) {}
  @Roles('SUPER_ADMIN') @Get('parishes') listParishes() {
    return this.domain.listParishes();
  }
  @Roles('SUPER_ADMIN') @Post('parishes') createParish(
    @Body() body: ParishDto,
  ) {
    return this.domain.createParish(body);
  }
  @Roles('SUPER_ADMIN') @Patch('parishes/:id') updateParish(
    @Param('id') id: string,
    @Body() body: ParishDto,
  ) {
    return this.domain.updateParish(id, body);
  }
  @Roles('SUPER_ADMIN', 'LEADER') @Get('users') listUsers(
    @CurrentUser() user: SessionUser,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('status') status?: string,
    @Query('parishId') parishId?: string,
  ) {
    return this.domain.listUsers(
      user,
      Number(page),
      Number(pageSize),
      status,
      parishId,
    );
  }
  @Roles('LEADER') @Get('members') listMembers(
    @CurrentUser() u: SessionUser,
    @Query('page') p = '1',
    @Query('pageSize') ps = '20',
    @Query('query') q?: string,
    @Query('status') s?: string,
  ) {
    return this.domain.listMembers(u, Number(p), Number(ps), q, s);
  }
  @Roles('LEADER') @Post('members') createMember(
    @CurrentUser() u: SessionUser,
    @Body() b: MemberDto,
  ) {
    return this.domain.createMember(u, b);
  }
  @Roles('LEADER') @Get('members/:id') getMember(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
  ) {
    return this.domain.getMember(u, id);
  }
  @Roles('LEADER') @Patch('members/:id') updateMember(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() b: MemberDto,
  ) {
    return this.domain.updateMember(u, id, b);
  }
  @Roles('LEADER')
  @Post('members/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  archiveMember(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.domain.archiveMember(u, id);
  }
  @Put('members/:id/photo')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, done) =>
        done(
          file.mimetype.match(/^image\/(jpeg|png|webp)$/)
            ? null
            : new BadRequestException('Formato de imagem inválido.'),
          true,
        ),
    }),
  )
  async uploadPhoto(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (u.role !== 'LEADER' && u.memberId !== id)
      throw new ProblemException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Operação não permitida.',
      );
    if (!file) throw new BadRequestException('Arquivo obrigatório.');
    await this.domain.getMember(u, id);
    const directory = join(process.cwd(), 'uploads', 'member-photos');
    await mkdir(directory, { recursive: true });
    const extensions: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };
    const name = `${randomUUID()}${extensions[file.mimetype]}`;
    await writeFile(join(directory, name), file.buffer);
    const photoUrl = `/api/v1/media/member-photos/${name}`;
    await this.domain.setPhoto(u, id, photoUrl);
    return { photoUrl };
  }
  @Delete('members/:id/photo')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePhoto(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    if (u.role !== 'LEADER' && u.memberId !== id)
      throw new ProblemException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        'Operação não permitida.',
      );
    const member = await this.domain.getMember(u, id);
    if (member.photoUrl) {
      const name =
        typeof member.photoUrl === 'string'
          ? member.photoUrl.split('/').pop()
          : undefined;
      if (name)
        await unlink(
          join(process.cwd(), 'uploads', 'member-photos', name),
        ).catch(() => undefined);
    }
    await this.domain.setPhoto(u, id, null);
  }
  @Get('media/member-photos/:name') async sendPhoto(
    @CurrentUser() user: SessionUser,
    @Param('name') name: string,
    @Res() response: Response,
  ) {
    if (name !== name.replace(/[^a-zA-Z0-9._-]/g, ''))
      throw new BadRequestException();
    await this.domain.assertPhotoAccess(user, name);
    return response.sendFile(
      join(process.cwd(), 'uploads', 'member-photos', name),
    );
  }
  @Get('dashboard') dashboard(
    @CurrentUser() u: SessionUser,
    @Query('month') month: string,
  ) {
    return this.domain.dashboard(u, month);
  }
  @Get('songs') listSongs(
    @CurrentUser() u: SessionUser,
    @Query('query') q?: string,
  ) {
    return this.domain.listSongs(u, q);
  }
  @Roles('LEADER') @Post('songs') createSong(
    @CurrentUser() u: SessionUser,
    @Body() b: SongDto,
  ) {
    return this.domain.createSong(u, b);
  }
  @Get('songs/:id') getSong(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
  ) {
    return this.domain.getSong(u, id);
  }
  @Roles('LEADER') @Patch('songs/:id') updateSong(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() b: SongDto,
  ) {
    return this.domain.updateSong(u, id, b);
  }
  @Get('news') listNews(@CurrentUser() u: SessionUser) {
    return this.domain.listNews(u);
  }
  @Roles('LEADER') @Post('news') createNews(
    @CurrentUser() u: SessionUser,
    @Body() b: NewsDto,
  ) {
    return this.domain.createNews(u, b);
  }
  @Roles('LEADER') @Patch('news/:id') updateNews(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() b: NewsDto,
  ) {
    return this.domain.updateNews(u, id, b);
  }
  @Roles('LEADER')
  @Delete('news/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteNews(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.domain.archiveNews(u, id);
  }
  @Roles('LEADER') @Get('ministries') listMinistries(
    @CurrentUser() u: SessionUser,
  ) {
    return this.domain.listMinistries(u);
  }
  @Roles('LEADER') @Post('ministries') createMinistry(
    @CurrentUser() u: SessionUser,
    @Body() b: MinistryDto,
  ) {
    return this.domain.createMinistry(u, b);
  }
  @Roles('LEADER') @Get('ministries/:id') getMinistry(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
  ) {
    return this.domain.getMinistry(u, id);
  }
  @Roles('LEADER') @Patch('ministries/:id') updateMinistry(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() b: MinistryDto,
  ) {
    return this.domain.updateMinistry(u, id, b);
  }
  @Roles('LEADER')
  @Post('ministries/:id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  archiveMinistry(@CurrentUser() u: SessionUser, @Param('id') id: string) {
    return this.domain.archiveMinistry(u, id);
  }
  @Roles('LEADER')
  @Post('celebration-series/:id/occurrences:generate')
  generate(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() b: GenerateDto,
  ) {
    return this.domain.generate(u, id, b);
  }
  @Get('occurrences') listOccurrences(
    @CurrentUser() u: SessionUser,
    @Query()
    q: {
      from?: string;
      to?: string;
      memberId?: string;
      ministryId?: string;
      status?: string;
    },
  ) {
    return this.domain.listOccurrences(u, q);
  }
  @Roles('LEADER') @Post('occurrences') createOccurrence(
    @CurrentUser() u: SessionUser,
    @Body() b: OccurrenceDto,
  ) {
    return this.domain.createOccurrence(u, b);
  }
  @Get('occurrences/:id') getOccurrence(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
  ) {
    return this.domain.getOccurrence(u, id);
  }
  @Roles('LEADER') @Patch('occurrences/:id') updateOccurrence(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() b: OccurrenceDto,
  ) {
    return this.domain.updateOccurrence(u, id, b);
  }
  @Roles('LEADER') @Put('occurrences/:id/members') replaceMembers(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() b: ReplaceMembersDto,
  ) {
    return this.domain.replaceMembers(u, id, b.members);
  }
  @Roles('LEADER') @Put('occurrences/:id/setlist') replaceSetlist(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() b: SetlistDto,
  ) {
    return this.domain.replaceSetlist(u, id, b);
  }
}
