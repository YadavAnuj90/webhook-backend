import { IsString, IsNotEmpty, Length, IsArray, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyTwoFactorDto {
  @ApiProperty({ example: '123456', description: 'Six-digit TOTP code from authenticator app' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'TOTP code must be exactly 6 digits' })
  code: string;
}

export class DisableTwoFactorDto {
  @ApiProperty({ example: '123456', description: 'Current TOTP code to confirm disable' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;
}

export class TwoFactorLoginDto {
  @ApiProperty({ example: '123456', description: 'TOTP code or recovery code' })
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class VerifyRecoveryCodeDto {
  @ApiProperty({ example: 'a1b2c3d4e5', description: 'One-time recovery code' })
  @IsString()
  @IsNotEmpty()
  code: string;
}
