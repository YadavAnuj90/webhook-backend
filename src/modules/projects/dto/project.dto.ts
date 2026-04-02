import {
  IsString, IsNotEmpty, IsOptional, IsEmail, MaxLength, IsIn,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProjectDto {
  @ApiProperty({ example: 'My Project' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Production webhook project' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {}

export class AddMemberDto {
  @ApiProperty({ example: 'member@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ enum: ['admin', 'member', 'viewer'], example: 'member' })
  @IsString()
  @IsIn(['admin', 'member', 'viewer'])
  role: 'admin' | 'member' | 'viewer';
}
