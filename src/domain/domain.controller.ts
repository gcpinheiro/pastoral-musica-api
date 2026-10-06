import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
import type { Response } from 'express';
import { CurrentUser, Roles } from '../common/auth.decorators';
import type { SessionUser } from '../common/auth.types';
import { DomainService } from './domain.service';
import {
  ArchiveOccurrencesDto,
  ConfirmationDto,
  GenerateDto,
  MemberDto,
  MinistryDto,
  NewsDto,
  OccurrenceBatchDto,
  OccurrenceDto,
  ParishDto,
  ProfileDto,
  ReplaceMembersDto,
  SetlistDto,
  SetlistLyricsDto,
  SongDto,
} from './domain.dto';
import { memberPhotoDataUrl, memberPhotoFromDataUrl } from './member-photo';

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
  @Get('profile') getProfile(@CurrentUser() u: SessionUser) {
    return this.domain.getOwnProfile(u);
  }
  @Patch('profile') updateProfile(
    @CurrentUser() u: SessionUser,
    @Body() body: ProfileDto,
  ) {
    return this.domain.updateOwnProfile(u, body);
  }
  @Put('profile/photo')
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
  async uploadOwnPhoto(
    @CurrentUser() u: SessionUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Arquivo obrigatório.');
    const photoUrl = memberPhotoDataUrl(file.buffer, file.mimetype);
    if (!photoUrl)
      throw new BadRequestException('O conteúdo do arquivo não corresponde a uma imagem JPG, PNG ou WebP válida.');
    await this.domain.setOwnPhoto(u, photoUrl);
    return { photoUrl };
  }
  @Delete('profile/photo')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOwnPhoto(@CurrentUser() u: SessionUser) {
    await this.domain.setOwnPhoto(u, null);
  }
  @Get('members/:id/photo')
  async getMemberPhoto(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const photo = memberPhotoFromDataUrl(await this.domain.getMemberPhoto(u, id));
    if (!photo) return response.status(HttpStatus.NOT_FOUND).end();
    response.setHeader('Content-Type', photo.mime);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(photo.buffer);
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
  @Get('songs/options') listSongOptions(
    @CurrentUser() u: SessionUser,
    @Query('query') query = '',
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '8',
  ) {
    return this.domain.listSongOptions(u, query, Number(page), Number(pageSize));
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
  @Roles('LEADER') @Post('occurrences/batch') createOccurrenceBatch(
    @CurrentUser() u: SessionUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: OccurrenceBatchDto,
  ) {
    return this.domain.createOccurrenceBatch(u, idempotencyKey ?? '', body);
  }
  @Roles('LEADER')
  @Post('occurrences/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  archiveOccurrences(
    @CurrentUser() u: SessionUser,
    @Body() body: ArchiveOccurrencesDto,
  ) {
    return this.domain.archiveOccurrences(u, body.ids);
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
  @Roles('LEADER')
  @Delete('occurrences/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  archiveOccurrence(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
  ) {
    return this.domain.archiveOccurrence(u, id);
  }
  @Roles('LEADER') @Post('occurrences/:id/publish') publishOccurrence(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
  ) {
    return this.domain.publishOccurrence(u, id);
  }
  @Roles('LEADER') @Put('occurrences/:id/members') replaceMembers(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() b: ReplaceMembersDto,
  ) {
    return this.domain.replaceMembers(u, id, b.members);
  }
  @Roles('LEADER', 'MEMBER')
  @Patch('occurrences/:id/members/:memberId/confirmation')
  updateConfirmation(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() body: ConfirmationDto,
  ) {
    return this.domain.updateConfirmation(u, id, memberId, body.confirmation);
  }
  @Roles('LEADER') @Put('occurrences/:id/setlist') replaceSetlist(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Body() b: SetlistDto,
  ) {
    return this.domain.replaceSetlist(u, id, b);
  }
  @Roles('LEADER')
  @Patch('occurrences/:id/setlist/items/:itemId/lyrics')
  updateSetlistLyrics(
    @CurrentUser() u: SessionUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: SetlistLyricsDto,
  ) {
    return this.domain.updateSetlistLyrics(u, id, itemId, body.content);
  }
}
