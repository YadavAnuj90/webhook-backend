import { Controller, Get, Post, Put, Delete, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WorkspacesService } from './workspaces.service';
import { JwtAuthGuard } from '../auth/strategies/jwt.strategy';
import { MemberRole } from './schemas/workspace.schema';

@ApiTags('Workspaces')
@ApiBearerAuth('JWT')
@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private svc: WorkspacesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new workspace' })
  create(@Request() req: any, @Body() dto: any) { return this.svc.create(req.user.id, dto); }

  @Get()
  @ApiOperation({ summary: 'List all workspaces you belong to' })
  findAll(@Request() req: any) { return this.svc.findAllForUser(req.user.id); }

  @Get(':id')
  @ApiOperation({ summary: 'Get workspace details' })
  findOne(@Param('id') id: string, @Request() req: any) { return this.svc.findOne(id, req.user.id); }

  @Put(':id')
  @ApiOperation({ summary: 'Update workspace settings' })
  update(@Param('id') id: string, @Request() req: any, @Body() dto: any) { return this.svc.update(id, req.user.id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete workspace (owner only)' })
  delete(@Param('id') id: string, @Request() req: any) { return this.svc.delete(id, req.user.id); }

  @Post(':id/invite')
  @ApiOperation({ summary: 'Invite a member by email' })
  invite(@Param('id') id: string, @Request() req: any, @Body() dto: { email: string; role: MemberRole }) { return this.svc.invite(id, req.user.id, dto); }

  @Post('invite/:token/accept')
  @ApiOperation({ summary: 'Accept a workspace invite' })
  acceptInvite(@Param('token') token: string, @Request() req: any) { return this.svc.acceptInvite(token, req.user.id); }

  @Get(':id/invites')
  @ApiOperation({ summary: 'List pending invites for workspace' })
  listInvites(@Param('id') id: string, @Request() req: any) { return this.svc.listInvites(id, req.user.id); }

  @Delete(':id/members/:uid')
  @ApiOperation({ summary: 'Remove a member from workspace' })
  removeMember(@Param('id') id: string, @Param('uid') uid: string, @Request() req: any) { return this.svc.removeMember(id, req.user.id, uid); }

  @Patch(':id/members/:uid/role')
  @ApiOperation({ summary: 'Update member role in workspace' })
  updateRole(@Param('id') id: string, @Param('uid') uid: string, @Request() req: any, @Body() dto: { role: MemberRole }) { return this.svc.updateMemberRole(id, req.user.id, uid, dto.role); }
}
