import {
  IsString, IsNotEmpty, IsOptional, IsUrl, IsArray,
  MaxLength, ArrayMaxSize,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOperationalWebhookDto {
  @ApiProperty({ example: 'https://my-server.com/system-events' })
  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
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
