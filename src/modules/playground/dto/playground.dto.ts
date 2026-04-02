import {
  IsString, IsNotEmpty, IsOptional, IsUrl, IsObject,
  IsNumber, Min, Max, IsIn, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PlaygroundFireDto {
  @ApiProperty({ example: 'https://my-server.com/webhooks' })
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  url: string;

  @ApiProperty({ enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], example: 'POST' })
  @IsString()
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  method: string;

  @ApiPropertyOptional({ example: { 'Content-Type': 'application/json' } })
  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;

  @ApiPropertyOptional({ example: { event: 'order.created', orderId: '123' } })
  @IsOptional()
  @IsObject()
  body?: Record<string, any>;

  @ApiPropertyOptional({ example: 5000, minimum: 1000, maximum: 30000 })
  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(30000)
  timeout?: number;
}

export class ValidateSignatureDto {
  @ApiProperty({ description: 'Raw request payload (max 1 MB)' })
  @IsString()
  @MaxLength(1_048_576)
  payload: string;

  @ApiProperty({ example: 'sha256=abc123...' })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({ example: 'my-webhook-secret' })
  @IsString()
  @IsNotEmpty()
  secret: string;
}
