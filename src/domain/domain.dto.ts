import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class PageQuery {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}
export class ParishDto {
  @IsString() @MinLength(3) name!: string;
  @IsOptional() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) slug?: string;
  @IsString() city!: string;
  @IsString() @Length(2, 2) state!: string;
  @IsString() timezone!: string;
}
export class AvailabilityDto {
  @IsString() weekday!: string;
  @IsString() startTime!: string;
  @IsString() endTime!: string;
}
export class MemberDto {
  @IsString() @MinLength(3) name!: string;
  @IsEmail() email!: string;
  @IsOptional() @Matches(/^\+[1-9]\d{7,14}$/) phone?: string;
  @IsArray() talentIds!: string[];
  @IsArray() @IsUUID('4', { each: true }) ministryIds!: string[];
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilityDto)
  availability!: AvailabilityDto[];
  @IsOptional() @IsString() notes?: string;
}
export class SeriesDto {
  @IsString() title!: string;
  @IsString() location!: string;
  @IsString() weekday!: string;
  @Matches(/^\d{2}:\d{2}$/) localTime!: string;
  @IsString() timezone!: string;
}
export class MinistryDto {
  @IsString() @MinLength(2) name!: string;
  @IsArray() @IsUUID('4', { each: true }) memberIds!: string[];
  @ValidateNested() @Type(() => SeriesDto) defaultSeries!: SeriesDto;
}
export class OccurrenceDto {
  @IsString() title!: string;
  @IsDateString() startsAt!: string;
  @IsString() timezone!: string;
  @IsString() location!: string;
  @IsUUID() ministryId!: string;
  @IsOptional() @IsString() liturgicalTime?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsInt() @Min(0) version?: number;
}
export class OccurrenceMemberDto {
  @IsUUID() memberId!: string;
  @IsString() role!: string;
  @IsOptional() overrideConflicts = false;
  @IsOptional() @IsString() conflictJustification?: string;
}
export class ReplaceMembersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OccurrenceMemberDto)
  members!: OccurrenceMemberDto[];
}
export class ConfirmationDto {
  @IsIn(['CONFIRMED', 'DECLINED'])
  confirmation!: 'CONFIRMED' | 'DECLINED';
}
export class SetlistItemDto {
  @IsUUID() songId!: string;
  @IsInt() @Min(1) position!: number;
  @IsString() key!: string;
  @IsString() liturgicalMoment!: string;
  @IsOptional() @IsString() notes?: string;
}
export class SetlistDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetlistItemDto)
  items!: SetlistItemDto[];
}
export class SongDto {
  @IsString() title!: string;
  @IsString() author!: string;
  @IsString() defaultKey!: string;
  @IsArray() liturgicalMoments!: string[];
  @IsOptional() @IsIn(['INTERNAL', 'EXTERNAL_EMBED'])
  contentMode?: 'INTERNAL' | 'EXTERNAL_EMBED';
  @ValidateIf((input: SongDto) => input.contentMode !== 'EXTERNAL_EMBED')
  @IsString()
  @MinLength(1)
  lyrics?: string;
  @ValidateIf((input: SongDto) => input.contentMode !== 'EXTERNAL_EMBED')
  @IsString()
  @MinLength(1)
  chords?: string;
  @ValidateIf((input: SongDto) => input.contentMode === 'EXTERNAL_EMBED')
  @IsString()
  @MinLength(1)
  externalUrl?: string;
}
export class NewsDto {
  @IsString() title!: string;
  @IsString() body!: string;
}
export class GenerateDto {
  @IsDateString() throughDate!: string;
}
