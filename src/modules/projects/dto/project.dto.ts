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
  @ApiProperty({ description: 'User ID to add as member' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ enum: ['admin', 'developer', 'viewer'], example: 'developer' })
  @IsString()
  @IsIn(['admin', 'developer', 'viewer'])
  role: 'admin' | 'developer' | 'viewer';
}
