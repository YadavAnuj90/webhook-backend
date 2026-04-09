import {
  IsString, IsNotEmpty, IsOptional, IsObject, IsDateString,
  IsEnum, MaxLength, ValidateIf, IsNumber, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ScheduleType {
  ONCE    = 'once',      // deliver at a specific time
  CRON    = 'cron',      // recurring delivery on a cron schedule
}

export class ScheduleEventDto {
  @ApiProperty({ example: 'order.reminder', description: 'Event type' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  eventType: string;

  @ApiProperty({ description: 'Webhook payload' })
  @IsObject()
  @IsNotEmpty()
  payload: Record<string, any>;

  @ApiProperty({ example: '60a7...', description: 'Target endpoint ID' })
  @IsString()
  @IsNotEmpty()
  endpointId: string;

  @ApiProperty({
    example: '2026-04-10T09:00:00.000Z',
    description: 'ISO 8601 timestamp for when to deliver the event. Must be in the future.',
  })
  @IsDateString()
  @IsNotEmpty()
  scheduledFor: string;

  @ApiPropertyOptional({ example: 'p2', description: 'Priority: p0 (highest) to p3 (lowest)' })
  @IsOptional()
  @IsString()
  @IsEnum(['p0', 'p1', 'p2', 'p3'])
  priority?: string;

  @ApiPropertyOptional({ example: 'monthly-reminder-abc', description: 'Idempotency key for deduplication' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}

export class UpdateScheduledEventDto {
  @ApiPropertyOptional({ description: 'New payload (replaces existing)' })
  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;

  @ApiPropertyOptional({
    example: '2026-04-11T09:00:00.000Z',
    description: 'Reschedule to a new time',
  })
  @IsOptional()
  @IsDateString()
  scheduledFor?: string;

  @ApiPropertyOptional({ description: 'Priority override' })
  @IsOptional()
  @IsString()
  @IsEnum(['p0', 'p1', 'p2', 'p3'])
  priority?: string;
}

export class CancelScheduledEventDto {
  @ApiPropertyOptional({ example: 'No longer needed' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
