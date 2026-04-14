import {
  IsString, IsNotEmpty, IsOptional, IsArray,
  MaxLength, ArrayMaxSize,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsSafeUrl } from '../../../common/decorators/is-safe-url.validator';

export class CreateOperationalWebhookDto {
  @ApiProperty({ example: 'https://my-server.com/system-events' })
  @IsSafeUrl()
  url: string;

  @ApiProperty({ example: ['delivery.success', 'delivery.failed'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  events: string[];

  @ApiPropertyOptional({ example: 'System Event Webhook' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class UpdateOperationalWebhookDto extends PartialType(CreateOperationalWebhookDto) {}
