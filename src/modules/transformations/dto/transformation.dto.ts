import {
  IsString, IsNotEmpty, IsOptional, IsObject, IsArray,
  IsIn, MaxLength, IsBoolean,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTransformationDto {
  @ApiProperty({ example: 'Remove PII fields' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: ['remove_fields', 'rename_fields', 'filter', 'template', 'jq'], example: 'remove_fields' })
  @IsString()
  @IsIn(['remove_fields', 'rename_fields', 'filter', 'template', 'jq'])
  type: string;

  @ApiPropertyOptional({ example: { fields: ['email', 'phone'] } })
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @ApiPropertyOptional({ example: 'Remove sensitive user data before delivery' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateTransformationDto extends PartialType(CreateTransformationDto) {}

export class PreviewTransformationDto {
  @ApiProperty({ description: 'Transformation rule object (same shape as create body)' })
  @IsObject()
  transformation: Record<string, any>;

  @ApiProperty({ description: 'Sample payload to transform' })
  @IsObject()
  payload: Record<string, any>;

  @ApiPropertyOptional({ description: 'Transformation config override' })
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
