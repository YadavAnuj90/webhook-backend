import {
  IsString, IsNotEmpty, IsOptional, IsEmail, IsEnum, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum MemberRole {
  OWNER  = 'owner',
  ADMIN  = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export class CreateWorkspaceDto {
  @ApiProperty({ example: 'My Workspace' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Team workspace for production' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class InviteMemberDto {
  @ApiProperty({ example: 'colleague@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: MemberRole, example: MemberRole.MEMBER })
  @IsEnum(MemberRole)
  role: MemberRole;
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: MemberRole, example: MemberRole.ADMIN })
  @IsEnum(MemberRole)
  role: MemberRole;
}
