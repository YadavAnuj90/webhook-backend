import {
  IsString, IsNotEmpty, IsOptional, IsBoolean,
  IsNumber, Min, Max, IsArray, IsObject, IsEnum, MaxLength, IsIn, ValidateIf,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsSafeUrl } from '../../../common/decorators/is-safe-url.validator';

export enum EndpointAuthType {
  NONE        = 'none',
  HMAC_SHA256 = 'hmac_sha256',
  BEARER      = 'bearer',
  BASIC       = 'basic',
  OAUTH2      = 'oauth2',
}

export enum RetryStrategy {
  EXPONENTIAL = 'exponential',
  LINEAR      = 'linear',
  FIXED       = 'fixed',
}

export class CreateEndpointDto {
  @ApiProperty({ example: 'https://your-server.com/webhooks' })
  @IsSafeUrl()
  url: string;

  @ApiProperty({ example: 'Production Endpoint' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Main production webhook receiver' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: { 'X-Custom-Header': 'value' } })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiPropertyOptional({ example: ['order.created', 'order.updated'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eventTypes?: string[];

  @ApiPropertyOptional({ example: 30000, minimum: 1000, maximum: 120000 })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(120000)
  timeoutMs?: number;

  @ApiPropertyOptional({ example: 3, minimum: 0, maximum: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  @ApiPropertyOptional({ enum: RetryStrategy })
  @IsOptional()
  @IsEnum(RetryStrategy)
  retryStrategy?: RetryStrategy;

  @ApiPropertyOptional({ enum: EndpointAuthType })
  @IsOptional()
  @IsEnum(EndpointAuthType)
  authType?: EndpointAuthType;

  @ApiPropertyOptional({ example: 'my-hmac-secret' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  authSecret?: string;

  @ApiPropertyOptional({ example: ['email', 'creditCard'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  piiFields?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  batchingEnabled?: boolean;

  @ApiPropertyOptional({ example: 10, minimum: 1, maximum: 500 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  batchSize?: number;
}

export class UpdateEndpointDto extends PartialType(CreateEndpointDto) {}
