import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards, Request, Ip, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new account' })
  register(@Body() dto: { email: string; password: string; firstName: string; lastName: string }, @Ip() ip: string) {
    return this.authService.register(dto, ip);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login' })
  login(@Body() dto: { email: string; password: string }, @Ip() ip: string, @Headers('user-agent') ua: string) {
    return this.authService.login(dto.email, dto.password, ip, ua || 'Web');
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Logout current session' })
  logout(@Request() req: any, @Body() body: { refreshToken: string }, @Ip() ip: string) {
    return this.authService.logout(req.user.id, body.refreshToken, ip);
  }

  @Post('logout-all')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Logout all devices' })
  logoutAll(@Request() req: any, @Ip() ip: string) {
    return this.authService.logoutAll(req.user.id, ip);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  refresh(@Body() body: { refreshToken: string }, @Ip() ip: string) {
    return this.authService.refresh(body.refreshToken, ip);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get current user' })
  getMe(@Request() req: any) {
    return this.authService.getMe(req.user.id);
  }

  @Get('sessions')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List active sessions' })
  getSessions(@Request() req: any) {
    return this.authService.getSessions(req.user.id);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset email' })
  forgotPassword(@Body() body: { email: string }) {
    return this.authService.requestPasswordReset(body.email);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with token' })
  resetPassword(@Body() body: { token: string; password: string }, @Ip() ip: string) {
    return this.authService.resetPassword(body.token, body.password, ip);
  }

  @Post('change-password')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Change password' })
  changePassword(@Request() req: any, @Body() body: { oldPassword: string; newPassword: string }, @Ip() ip: string) {
    return this.authService.changePassword(req.user.id, body.oldPassword, body.newPassword, ip);
  }

  @Post('api-keys')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Create API key' })
  createApiKey(@Request() req: any, @Body() body: { name: string; scopes?: string[]; expiresAt?: string }, @Ip() ip: string) {
    return this.authService.createApiKey(req.user.id, body.name, body.scopes || [], body.expiresAt, ip);
  }

  @Get('api-keys')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'List API keys' })
  listApiKeys(@Request() req: any) {
    return this.authService.listApiKeys(req.user.id);
  }

  @Delete('api-keys/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Revoke API key' })
  revokeApiKey(@Param('id') id: string, @Request() req: any, @Ip() ip: string) {
    return this.authService.revokeApiKey(id, req.user.id, ip);
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email address with token from email link' })
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('resend-verification')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Resend email verification link' })
  resendVerification(@Request() req: any) {
    return this.authService.resendVerification(req.user.id || req.user.userId);
  }
}
