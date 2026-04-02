import { Controller, Get, Put, Patch, Body, Param, Query, UseGuards, Request, Ip } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiParam, ApiQuery, ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, UserStatus } from './schemas/user.schema';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Put('me')
  @ApiOperation({ summary: 'Update authenticated user profile (name, phone, company, timezone, etc.)' })
  @ApiBody({ schema: { properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, phone: { type: 'string' }, company: { type: 'string' }, timezone: { type: 'string', example: 'Asia/Kolkata' }, language: { type: 'string', example: 'en' } } } })
  @ApiResponse({ status: 200, description: 'Updated user profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  updateProfile(@Body() dto: UpdateProfileDto, @Request() req: any, @Ip() ip: string) {
    return this.usersService.updateProfile(req.user.id, dto, ip);
  }

  @Put('me/preferences')
  @ApiOperation({ summary: 'Update user preferences (theme, notification settings, etc.)' })
  @ApiBody({ schema: { properties: { theme: { type: 'string', enum: ['dark', 'light'] }, emailNotifications: { type: 'boolean' }, slackNotifications: { type: 'boolean' } } } })
  @ApiResponse({ status: 200, description: 'Updated preferences' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  updatePreferences(@Body() dto: UpdatePreferencesDto, @Request() req: any) {
    return this.usersService.updatePreferences(req.user.id, dto);
  }

  @Get('admin/list')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: list all users with pagination, search and filters' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Full-text search by name, email, company' })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  @ApiQuery({ name: 'status', required: false, enum: UserStatus })
  @ApiResponse({ status: 200, description: 'Paginated user list' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  list(@Query('page') page = 1, @Query('limit') limit = 20, @Query('search') search?: string, @Query('role') role?: UserRole, @Query('status') status?: UserStatus) {
    return this.usersService.listAll(+page, +limit, search, role, status);
  }

  @Get('admin/stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: get aggregated user statistics' })
  @ApiResponse({ status: 200, description: 'User stats (totals by role, status, registration trend)' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  stats() { return this.usersService.getStats(); }

  @Patch('admin/:id/role')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: change a user\'s role' })
  @ApiParam({ name: 'id', description: 'User ID', type: String })
  @ApiBody({ schema: { required: ['role'], properties: { role: { type: 'string', enum: Object.values(UserRole) } } } })
  @ApiResponse({ status: 200, description: 'User role updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  changeRole(@Param('id') id: string, @Body() body: { role: UserRole }, @Request() req: any, @Ip() ip: string) {
    return this.usersService.changeRole(id, body.role, req.user.id, ip);
  }

  @Patch('admin/:id/suspend')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: suspend a user account' })
  @ApiParam({ name: 'id', description: 'User ID', type: String })
  @ApiResponse({ status: 200, description: 'User suspended — cannot log in' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  suspend(@Param('id') id: string, @Request() req: any, @Ip() ip: string) {
    return this.usersService.suspendUser(id, req.user.id, ip);
  }

  @Patch('admin/:id/activate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: reactivate a suspended user account' })
  @ApiParam({ name: 'id', description: 'User ID', type: String })
  @ApiResponse({ status: 200, description: 'User account reactivated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  activate(@Param('id') id: string) {
    return this.usersService.activateUser(id);
  }
}
