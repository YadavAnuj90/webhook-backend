import {
  IsString, IsNotEmpty, IsObject, IsOptional, IsEnum,
  IsDateString, MaxLength, IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum EventPriority {
  LOW    = 'low',
  NORMAL = 'normal',
  HIGH   = 'high',
}

export class SendEventDto {
  @ApiProperty({ example: 'order.created' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  eventType: string;

  @ApiProperty({ example: { orderId: '123', amount: 99.99 } })
  @IsObject()
  payload: Record<string, any>;

  @ApiPropertyOptional({ example: 'order-123-created' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;

  @ApiPropertyOptional({ enum: EventPriority, default: EventPriority.NORMAL })
  @IsOptional()
  @IsEnum(EventPriority)
  priority?: EventPriority;

  @ApiPropertyOptional({ example: '2025-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class SendEventToEndpointDto extends SendEventDto {
  @ApiPropertyOptional({ example: 'endpoint_abc123' })
  @IsOptional()
  @IsString()
  endpointId?: string;
}
