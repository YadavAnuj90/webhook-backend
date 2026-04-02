import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards, Request, Ip, Headers, Res } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiExcludeEndpoint,
  ApiResponse, ApiParam, ApiQuery, ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { SkipEmailVerification } from '../../common/guards/email-verified.guard';
import { Throttle, SkipThrottle } from '@nestjs/throttler';

@ApiTags('Auth')
@Controller('auth')
@SkipEmailVerification()   // Auth routes must be accessible before email verification
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Register a new account' })
  @ApiBody({ schema: { required: ['email', 'password', 'firstName', 'lastName'], properties: { email: { type: 'string', example: 'user@example.com' }, password: { type: 'string', example: 'Password123!' }, firstName: { type: 'string', example: 'John' }, lastName: { type: 'string', example: 'Doe' } } } })
  @ApiResponse({ status: 201, description: 'Account created, verification email sent' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  register(@Body() dto: RegisterDto, @Ip() ip: string) {
    return this.authService.register(dto, ip);
  }

  @Post('login')
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiBody({ schema: { required: ['email', 'password'], properties: { email: { type: 'string', example: 'user@example.com' }, password: { type: 'string', example: 'Password123!' } } } })
  @ApiResponse({ status: 200, description: 'Returns accessToken, refreshToken, and user object' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body() dto: LoginDto, @Ip() ip: string, @Headers('user-agent') ua: string) {
    return this.authService.login(dto.email, dto.password, ip, ua || 'Web');
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Logout current session' })
  @ApiBody({ schema: { required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Session revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  logout(@Request() req: any, @Body() dto: RefreshDto, @Ip() ip: string) {
    return this.authService.logout(req.user.id, dto.refreshToken, ip);
  }

  @Post('logout-all')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Logout all devices' })
  @ApiResponse({ status: 200, description: 'All sessions revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  logoutAll(@Request() req: any, @Ip() ip: string) {
    return this.authService.logoutAll(req.user.id, ip);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using a valid refresh token' })
  @ApiBody({ schema: { required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Returns new accessToken and refreshToken' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  refresh(@Body() dto: RefreshDto, @Ip() ip: string) {
    return this.authService.refresh(dto.refreshToken, ip);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Current user object' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMe(@Request() req: any) {
    return this.authService.getMe(req.user.id);
  }

  @Get('sessions')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all active sessions for the current user' })
  @ApiResponse({ status: 200, description: 'Array of active sessions with device/IP info' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getSessions(@Request() req: any) {
    return this.authService.getSessions(req.user.id);
  }

  @Post('forgot-password')
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiBody({ schema: { required: ['email'], properties: { email: { type: 'string', example: 'user@example.com' } } } })
  @ApiResponse({ status: 200, description: 'Reset email sent if account exists' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password using token from email link' })
  @ApiBody({ schema: { required: ['token', 'password'], properties: { token: { type: 'string', description: 'Token from reset email' }, password: { type: 'string', example: 'NewPassword123!' } } } })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  resetPassword(@Body() dto: ResetPasswordDto, @Ip() ip: string) {
    return this.authService.resetPassword(dto.token, dto.password, ip);
  }

  @Post('change-password')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Change password for authenticated user' })
  @ApiBody({ schema: { required: ['oldPassword', 'newPassword'], properties: { oldPassword: { type: 'string' }, newPassword: { type: 'string', example: 'NewPassword123!' } } } })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 400, description: 'Old password is incorrect' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  changePassword(@Request() req: any, @Body() dto: ChangePasswordDto, @Ip() ip: string) {
    return this.authService.changePassword(req.user.id, dto.oldPassword, dto.newPassword, ip);
  }

  @Post('api-keys')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create a new API key for the current user' })
  @ApiBody({ schema: { required: ['name'], properties: { name: { type: 'string', example: 'CI/CD Key' }, scopes: { type: 'array', items: { type: 'string' }, example: ['webhooks:read', 'webhooks:write'] }, expiresAt: { type: 'string', format: 'date-time' } } } })
  @ApiResponse({ status: 201, description: 'API key created — plaintext key returned once only' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  createApiKey(@Request() req: any, @Body() dto: CreateApiKeyDto, @Ip() ip: string) {
    return this.authService.createApiKey(req.user.id, dto.name, dto.scopes || [], dto.expiresAt, ip);
  }

  @Get('api-keys')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List all API keys for the current user (masked)' })
  @ApiResponse({ status: 200, description: 'Array of API keys with metadata (key value is masked)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  listApiKeys(@Request() req: any) {
    return this.authService.listApiKeys(req.user.id);
  }

  @Delete('api-keys/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Revoke (delete) an API key' })
  @ApiParam({ name: 'id', description: 'API key ID', type: String })
  @ApiResponse({ status: 200, description: 'API key revoked' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  revokeApiKey(@Param('id') id: string, @Request() req: any, @Ip() ip: string) {
    return this.authService.revokeApiKey(id, req.user.id, ip);
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email address with token from verification email' })
  @ApiQuery({ name: 'token', description: 'Email verification token', required: true, type: String })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('resend-verification')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Resend email verification link to current user' })
  @ApiResponse({ status: 200, description: 'Verification email resent' })
  @ApiResponse({ status: 400, description: 'Email already verified' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  resendVerification(@Request() req: any) {
    return this.authService.resendVerification(req.user.id || req.user.userId);
  }

  // ── Google OAuth ─────────────────────────────────────────────────────────

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Redirect to Google OAuth consent screen. Browser must follow this URL.' })
  @ApiResponse({ status: 302, description: 'Redirect to Google OAuth consent page' })
  googleLogin() {
    // Passport redirects automatically — no body needed
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiExcludeEndpoint()   // internal — Google calls this, not the frontend
  async googleCallback(@Request() req: any, @Ip() ip: string, @Res() res: Response) {
    const { accessToken, refreshToken, isNew } = await this.authService.loginWithGoogle(req.user, ip);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    // Redirect to frontend with tokens in query params (frontend reads once and stores in memory)
    res.redirect(
      `${frontendUrl}/auth/google/callback?accessToken=${accessToken}&refreshToken=${refreshToken}&isNew=${isNew}`,
    );
  }
}
