import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
}
export class InvitationDto {
  @IsEmail() email!: string;
  @IsIn(['LEADER', 'MEMBER']) role!: 'LEADER' | 'MEMBER';
  @ValidateIf((value: InvitationDto) => value.role === 'LEADER')
  @IsString()
  @MinLength(2)
  name?: string;
  @ValidateIf((value: InvitationDto) => value.role === 'LEADER')
  @IsUUID()
  parishId?: string;
  @ValidateIf((value: InvitationDto) => value.role === 'MEMBER')
  @IsUUID()
  memberId?: string;
}
export class AcceptInvitationDto {
  @IsString() @MinLength(8) password!: string;
  @IsString() @MinLength(8) passwordConfirmation!: string;
  @Matches(/^\+[1-9]\d{7,14}$/) whatsapp!: string;
}
export class LeadershipRequestDto {
  @IsIn(['ADD_LEADER', 'SUSPEND_LEADER', 'REMOVE_LEADER']) type!: string;
  @IsOptional() @IsUUID() targetUserId?: string;
  @IsOptional() @IsString() candidateName?: string;
  @IsOptional() @IsEmail() candidateEmail?: string;
  @IsString() @Length(10, 1000) reason!: string;
}
export class LeadershipDecisionDto {
  @IsIn(['APPROVED', 'REJECTED']) decision!: string;
  @IsString() @Length(3, 1000) reason!: string;
}
