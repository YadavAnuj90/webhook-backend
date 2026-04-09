import {
  IsString, IsNotEmpty, IsOptional, IsArray,
  ArrayMinSize, MaxLength, ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCustomRoleDto {
  @ApiProperty({ example: 'ops-engineer', description: 'Role name (must be unique within project)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiPropertyOptional({ example: 'Can manage endpoints and replay events, but not billing' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    example: ['endpoints:create', 'endpoints:read', 'endpoints:update', 'events:read', 'events:execute', 'dlq:read', 'dlq:execute'],
    description: 'Array of "resource:action" permission strings',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissions: string[];

  @ApiPropertyOptional({ example: '#3B82F6', description: 'Color hex code for UI display' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  color?: string;
}

export class UpdateCustomRoleDto {
  @ApiPropertyOptional({ example: 'senior-ops-engineer' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    example: ['endpoints:create', 'endpoints:read', 'events:read'],
    description: 'Replaces all existing permissions',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional({ example: '#EF4444' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  color?: string;
}
