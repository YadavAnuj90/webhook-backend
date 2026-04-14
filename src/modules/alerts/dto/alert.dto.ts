import {
  IsString, IsNotEmpty, IsOptional, IsEmail, IsNumber,
  Min, Max, IsIn, MaxLength, IsBoolean,
} from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsSafeUrl } from '../../../common/decorators/is-safe-url.validator';

export class CreateAlertDto {
  @ApiProperty({ example: 'High failure rate alert' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: ['failure_rate', 'latency', 'volume_drop'], example: 'failure_rate' })
  @IsString()
  @IsIn(['failure_rate', 'latency', 'volume_drop'])
  type: string;

  @ApiProperty({ example: 10, minimum: 0 })
  @IsNumber()
  @Min(0)
  threshold: number;

  @ApiPropertyOptional({ example: 'endpoint_abc123' })
  @IsOptional()
  @IsString()
  endpointId?: string;

  @ApiPropertyOptional({ example: 'ops@company.com' })
  @IsOptional()
  @IsEmail()
  notifyEmail?: string;

  @ApiPropertyOptional({ example: 'https://hooks.slack.com/services/...' })
  @IsOptional()
  @IsSafeUrl()
  notifySlack?: string;

  @ApiPropertyOptional({ example: 30, minimum: 1, maximum: 1440 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1440)
  cooldownMinutes?: number;
}

export class UpdateAlertDto extends PartialType(CreateAlertDto) {}
