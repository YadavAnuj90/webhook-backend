import {
  IsString, IsNotEmpty, IsOptional, IsObject, IsArray,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsSafeUrl } from '../../../common/decorators/is-safe-url.validator';

export class CreateEventTypeDto {
  @ApiProperty({ example: 'order.created' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Fired when a new order is created' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ description: 'JSON Schema for payload validation' })
  @IsOptional()
  @IsObject()
  schema?: Record<string, any>;

  @ApiPropertyOptional({ example: ['order', 'ecommerce'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class ValidatePayloadDto {
  @ApiProperty({ example: 'order.created', description: 'Event type name to validate against' })
  @IsString()
  @IsNotEmpty()
  eventType: string;

  @ApiProperty({ description: 'Payload to validate against the event type schema' })
  @IsObject()
  payload: Record<string, any>;
}

export class ContractTestDto {
  @ApiProperty({ example: 'https://my-server.com/webhooks' })
  @IsSafeUrl()
  targetUrl: string;

  @ApiPropertyOptional({ description: 'Override payload for the test' })
  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}

export class SimulateEventDto {
  @ApiPropertyOptional({ description: 'Override payload for simulation' })
  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Field overrides to merge into the event type sample payload' })
  @IsOptional()
  @IsObject()
  overrides?: Record<string, any>;
}
