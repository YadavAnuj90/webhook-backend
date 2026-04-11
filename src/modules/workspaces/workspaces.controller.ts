import {
  Controller, Get, Post, Put, Delete, Patch, Body, Param, UseGuards, Request,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiParam, ApiBody,
} from '@nestjs/swagger';
import { WorkspacesService } from './workspaces.service';
import { JwtAuthGuard } from '../auth/strategies/jwt.strategy';
import { MemberRole } from './schemas/workspace.schema';
import { CreateWorkspaceDto, InviteMemberDto, UpdateMemberRoleDto } from './dto/workspace.dto';

@ApiTags('Workspaces')
@ApiBearerAuth('JWT')
@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private svc: WorkspacesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new workspace (Company/Team container)' })
  @ApiResponse({ status: 201, description: 'Workspace created' })
  create(@Request() req: any, @Body() dto: CreateWorkspaceDto) {
    return this.svc.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all workspaces you belong to (super_admin sees all)' })
  @ApiResponse({ status: 200, description: 'Array of workspaces' })
  findAll(@Request() req: any) {
    return this.svc.findAllForUser(req.user.id, req.user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workspace details including members' })
  @ApiParam({ name: 'id', description: 'Workspace ID', type: String })
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.svc.findOne(id, req.user.id, req.user.role);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update workspace name/description (owner/admin only)' })
  @ApiParam({ name: 'id', description: 'Workspace ID', type: String })
  update(@Param('id') id: string, @Request() req: any, @Body() dto: CreateWorkspaceDto) {
    return this.svc.update(id, req.user.id, dto, req.user.role);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete workspace (owner/super_admin only)' })
  @ApiParam({ name: 'id', description: 'Workspace ID', type: String })
  delete(@Param('id') id: string, @Request() req: any) {
    return this.svc.delete(id, req.user.id, req.user.role);
  }

  // ── INVITE (Enterprise Plan Required) ─────────────────────────────────────

  @Post(':id/invite')
  @ApiOperation({
    summary: 'Invite a member by email (Enterprise plan required)',
    description: 'Returns both an invite URL and a 6-digit OTP. Share the OTP via secondary channel (SMS, chat) for added security.',
  })
  @ApiParam({ name: 'id', description: 'Workspace ID', type: String })
  @ApiBody({ schema: { required: ['email', 'role'], properties: { email: { type: 'string', format: 'email' }, role: { type: 'string', enum: Object.values(MemberRole) } } } })
  @ApiResponse({ status: 201, description: 'Invite created — returns invite URL + OTP' })
  @ApiResponse({ status: 403, description: 'Not Enterprise plan / insufficient permissions' })
  invite(@Param('id') id: string, @Request() req: any, @Body() dto: InviteMemberDto) {
    return this.svc.invite(id, req.user.id, dto, req.user.role);
  }

  // ── ACCEPT INVITE (Token link) ────────────────────────────────────────────

  @Post('invite/:token/accept')
  @ApiOperation({ summary: 'Accept a workspace invite using the token from the invitation link' })
  @ApiParam({ name: 'token', description: 'Invite token from email', type: String })
  @ApiResponse({ status: 200, description: 'Invite accepted — user added to workspace' })
  acceptInvite(@Param('token') token: string, @Request() req: any) {
    return this.svc.acceptInvite(token, req.user.id);
  }

  // ── ACCEPT INVITE (OTP) ───────────────────────────────────────────────────

  @Post(':id/invite/verify-otp')
  @ApiOperation({
    summary: 'Accept a workspace invite using 6-digit OTP',
    description: 'Alternative to token-based acceptance. User provides the OTP shared via secondary channel.',
  })
  @ApiParam({ name: 'id', description: 'Workspace ID', type: String })
  @ApiBody({ schema: { required: ['otp'], properties: { otp: { type: 'string', example: '123456' } } } })
  @ApiResponse({ status: 200, description: 'OTP verified — user added to workspace' })
  @ApiResponse({ status: 404, description: 'Invalid OTP or no pending invite' })
  acceptInviteByOtp(
    @Param('id') id: string,
    @Body('otp') otp: string,
    @Request() req: any,
  ) {
    return this.svc.acceptInviteByOtp(id, otp, req.user.id);
  }

  // ── LIST INVITES ──────────────────────────────────────────────────────────

  @Get(':id/invites')
  @ApiOperation({ summary: 'List pending invites for a workspace' })
  @ApiParam({ name: 'id', description: 'Workspace ID', type: String })
  listInvites(@Param('id') id: string, @Request() req: any) {
    return this.svc.listInvites(id, req.user.id, req.user.role);
  }

  // ── REVOKE INVITE ─────────────────────────────────────────────────────────

  @Delete(':id/invites/:inviteId')
  @ApiOperation({ summary: 'Revoke a pending invite' })
  @ApiParam({ name: 'id', description: 'Workspace ID', type: String })
  @ApiParam({ name: 'inviteId', description: 'Invite ID to revoke', type: String })
  revokeInvite(
    @Param('id') id: string,
    @Param('inviteId') inviteId: string,
    @Request() req: any,
  ) {
    return this.svc.revokeInvite(id, inviteId, req.user.id, req.user.role);
  }

  // ── MEMBER MANAGEMENT ─────────────────────────────────────────────────────

  @Delete(':id/members/:uid')
  @ApiOperation({ summary: 'Remove a member from the workspace' })
  @ApiParam({ name: 'id', description: 'Workspace ID', type: String })
  @ApiParam({ name: 'uid', description: 'User ID to remove', type: String })
  removeMember(@Param('id') id: string, @Param('uid') uid: string, @Request() req: any) {
    return this.svc.removeMember(id, req.user.id, uid, req.user.role);
  }

  @Patch(':id/members/:uid/role')
  @ApiOperation({ summary: 'Update a member\'s role in the workspace' })
  @ApiParam({ name: 'id', description: 'Workspace ID', type: String })
  @ApiParam({ name: 'uid', description: 'User ID', type: String })
  @ApiBody({ schema: { required: ['role'], properties: { role: { type: 'string', enum: Object.values(MemberRole) } } } })
  updateRole(@Param('id') id: string, @Param('uid') uid: string, @Request() req: any, @Body() dto: UpdateMemberRoleDto) {
    return this.svc.updateMemberRole(id, req.user.id, uid, dto.role, req.user.role);
  }
}
