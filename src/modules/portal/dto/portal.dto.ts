import {
  IsString, IsNotEmpty, IsOptional, IsArray, IsObject,
  MaxLength, IsUrl, IsBoolean, IsHexColor,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePortalTokenDto {
  @ApiProperty({ example: 'project_abc123' })
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @ApiPropertyOptional({ example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @ApiPropertyOptional({ example: 'https://acme.com/logo.png' })
  @IsOptional()
  @IsUrl()
  logoUrl?: string;

  @ApiPropertyOptional({ example: '#4F46E5' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  brandColor?: string;

  @ApiPropertyOptional({ example: 'Acme Webhook Portal' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  portalTitle?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowSubscriptionManagement?: boolean;
}

export class UpdateSubscriptionsDto {
  @ApiProperty({ example: ['order.created', 'order.updated'], type: [String] })
  @IsArray()
  @IsString({ each: true })
  eventTypes: string[];
}
