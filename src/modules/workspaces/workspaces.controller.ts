import { Controller, Get, Post, Put, Delete, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiParam, ApiBody,
} from '@nestjs/swagger';
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
  @ApiBody({ schema: { required: ['name'], properties: { name: { type: 'string', example: 'Engineering Team' }, description: { type: 'string' } } } })
  @ApiResponse({ status: 201, description: 'Workspace created' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Request() req: any, @Body() dto: any) { return this.svc.create(req.user.id, dto); }

  @Get()
  @ApiOperation({ summary: 'List all workspaces you belong to (owned and invited)' })
  @ApiResponse({ status: 200, description: 'Array of workspaces with your role in each' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll(@Request() req: any) { return this.svc.findAllForUser(req.user.id); }

  @Get(':id')
  @ApiOperation({ summary: 'Get workspace details including members and pending invites' })
  @ApiParam({ name: 'id', description: 'Workspace ID', type: String })
  @ApiResponse({ status: 200, description: 'Workspace details' })
  @ApiResponse({ status: 404, description: 'Workspace not found or no access' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findOne(@Param('id') id: string, @Request() req: any) { return this.svc.findOne(id, req.user.id); }

  @Put(':id')
  @ApiOperation({ summary: 'Update workspace name or description (owner only)' })
  @ApiParam({ name: 'id', description: 'Workspace ID', type: String })
  @ApiBody({ schema: { properties: { name: { type: 'string' }, description: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Updated workspace' })
  @ApiResponse({ status: 403, description: 'Owner only' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  update(@Param('id') id: string, @Request() req: any, @Body() dto: any) { return this.svc.update(id, req.user.id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a workspace and remove all members (owner only)' })
  @ApiParam({ name: 'id', description: 'Workspace ID', type: String })
  @ApiResponse({ status: 200, description: 'Workspace deleted' })
  @ApiResponse({ status: 403, description: 'Owner only' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  delete(@Param('id') id: string, @Request() req: any) { return this.svc.delete(id, req.user.id); }

  @Post(':id/invite')
  @ApiOperation({ summary: 'Invite a user by email to join the workspace' })
  @ApiParam({ name: 'id', description: 'Workspace ID', type: String })
  @ApiBody({ schema: { required: ['email', 'role'], properties: { email: { type: 'string', format: 'email' }, role: { type: 'string', enum: Object.values(MemberRole) } } } })
  @ApiResponse({ status: 201, description: 'Invite sent — returns invite token' })
  @ApiResponse({ status: 404, description: 'Workspace not found' })
  @ApiResponse({ status: 403, description: 'Owner/admin only' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  invite(@Param('id') id: string, @Request() req: any, @Body() dto: { email: string; role: MemberRole }) { return this.svc.invite(id, req.user.id, dto); }

  @Post('invite/:token/accept')
  @ApiOperation({ summary: 'Accept a workspace invite using the token from the invitation email' })
  @ApiParam({ name: 'token', description: 'Invite token from email', type: String })
  @ApiResponse({ status: 200, description: 'Invite accepted — user added to workspace' })
  @ApiResponse({ status: 400, description: 'Token invalid, expired, or already used' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  acceptInvite(@Param('token') token: string, @Request() req: any) { return this.svc.acceptInvite(token, req.user.id); }

  @Get(':id/invites')
  @ApiOperation({ summary: 'List all pending invites for a workspace' })
  @ApiParam({ name: 'id', description: 'Workspace ID', type: String })
  @ApiResponse({ status: 200, description: 'Array of pending invites with email and expiry' })
  @ApiResponse({ status: 403, description: 'Owner/admin only' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  listInvites(@Param('id') id: string, @Request() req: any) { return this.svc.listInvites(id, req.user.id); }

  @Delete(':id/members/:uid')
  @ApiOperation({ summary: 'Remove a member from the workspace' })
  @ApiParam({ name: 'id', description: 'Workspace ID', type: String })
  @ApiParam({ name: 'uid', description: 'User ID to remove', type: String })
  @ApiResponse({ status: 200, description: 'Member removed' })
  @ApiResponse({ status: 403, description: 'Owner only (cannot remove self if owner)' })
  @ApiResponse({ status: 404, description: 'Workspace or member not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  removeMember(@Param('id') id: string, @Param('uid') uid: string, @Request() req: any) { return this.svc.removeMember(id, req.user.id, uid); }

  @Patch(':id/members/:uid/role')
  @ApiOperation({ summary: 'Update a member\'s role in the workspace' })
  @ApiParam({ name: 'id', description: 'Workspace ID', type: String })
  @ApiParam({ name: 'uid', description: 'User ID', type: String })
  @ApiBody({ schema: { required: ['role'], properties: { role: { type: 'string', enum: Object.values(MemberRole) } } } })
  @ApiResponse({ status: 200, description: 'Member role updated' })
  @ApiResponse({ status: 403, description: 'Owner only' })
  @ApiResponse({ status: 404, description: 'Member not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  updateRole(@Param('id') id: string, @Param('uid') uid: string, @Request() req: any, @Body() dto: { role: MemberRole }) { return this.svc.updateMemberRole(id, req.user.id, uid, dto.role); }
}
