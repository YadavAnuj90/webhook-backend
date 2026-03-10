import { Controller, Get, Put, Patch, Body, Param, Query, UseGuards, Request, Ip } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, UserStatus } from './schemas/user.schema';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Put('me')
  @ApiOperation({ summary: 'Update my profile' })
  updateProfile(@Body() dto: any, @Request() req: any, @Ip() ip: string) {
    return this.usersService.updateProfile(req.user.id, dto, ip);
  }

  @Put('me/preferences')
  @ApiOperation({ summary: 'Update my preferences' })
  updatePreferences(@Body() dto: any, @Request() req: any) {
    return this.usersService.updatePreferences(req.user.id, dto);
  }

  @Get('admin/list')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: list all users' })
  list(@Query('page') page = 1, @Query('limit') limit = 20, @Query('search') search?: string, @Query('role') role?: UserRole, @Query('status') status?: UserStatus) {
    return this.usersService.listAll(+page, +limit, search, role, status);
  }

  @Get('admin/stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: user stats' })
  stats() { return this.usersService.getStats(); }

  @Patch('admin/:id/role')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: change user role' })
  changeRole(@Param('id') id: string, @Body() body: { role: UserRole }, @Request() req: any, @Ip() ip: string) {
    return this.usersService.changeRole(id, body.role, req.user.id, ip);
  }

  @Patch('admin/:id/suspend')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: suspend user' })
  suspend(@Param('id') id: string, @Request() req: any, @Ip() ip: string) {
    return this.usersService.suspendUser(id, req.user.id, ip);
  }

  @Patch('admin/:id/activate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: activate user' })
  activate(@Param('id') id: string) {
    return this.usersService.activateUser(id);
  }
}
