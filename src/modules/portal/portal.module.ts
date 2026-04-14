import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PortalToken, PortalTokenDocument, PortalTokenSchema } from './schemas/portal.schema';
import { Controller, Get, Post, Delete, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiParam, ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import * as crypto from 'crypto';
import { CreatePortalTokenDto, UpdateSubscriptionsDto } from './dto/portal.dto';

@Injectable()
export class PortalService {
  constructor(@InjectModel(PortalToken.name) private model: Model<PortalTokenDocument>) {}

  async createToken(userId: string, dto: {
    projectId: string; customerName: string; customerEmail?: string; expiresAt?: string;

    logoUrl?: string; brandColor?: string;

    companyName?: string; faviconUrl?: string; primaryColor?: string; secondaryColor?: string;
    fontFamily?: string; darkMode?: boolean; customDomain?: string; supportEmail?: string;
    portalTitle?: string; customCss?: string; socialLinks?: Record<string, string>;
  }) {
    const token = 'pt_' + crypto.randomBytes(24).toString('hex');
    return this.model.create({
      userId: new Types.ObjectId(userId),
      projectId: new Types.ObjectId(dto.projectId),
      token, customerName: dto.customerName, customerEmail: dto.customerEmail,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      logoUrl: dto.logoUrl, brandColor: dto.brandColor,
      companyName: dto.companyName, faviconUrl: dto.faviconUrl,
      primaryColor: dto.primaryColor || dto.brandColor || '#6366f1',
      secondaryColor: dto.secondaryColor,
      fontFamily: dto.fontFamily, darkMode: dto.darkMode,
      customDomain: dto.customDomain, supportEmail: dto.supportEmail,
      portalTitle: dto.portalTitle, customCss: dto.customCss,
      socialLinks: dto.socialLinks,
    });
  }

  async listTokens(userId: string) {
    return this.model.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 });
  }

  async updateBranding(userId: string, id: string, dto: Partial<{
    companyName: string; logoUrl: string; faviconUrl: string; primaryColor: string;
    secondaryColor: string; fontFamily: string; darkMode: boolean; customDomain: string;
    supportEmail: string; portalTitle: string; customCss: string; socialLinks: Record<string, string>;
  }>) {
    const t = await this.model.findById(id);
    if (!t) throw new NotFoundException();
    if (t.userId.toString() !== userId) throw new ForbiddenException();
    return this.model.findByIdAndUpdate(id, { $set: dto }, { new: true });
  }

  async revokeToken(userId: string, id: string) {
    const t = await this.model.findById(id);
    if (!t) throw new NotFoundException();
    if (t.userId.toString() !== userId) throw new ForbiddenException();
    return this.model.findByIdAndUpdate(id, { isActive: false }, { new: true });
  }

  async deleteToken(userId: string, id: string) {
    const t = await this.model.findById(id);
    if (!t) throw new NotFoundException();
    if (t.userId.toString() !== userId) throw new ForbiddenException();
    await this.model.findByIdAndDelete(id);
    return { success: true };
  }

  async validatePortalToken(token: string): Promise<PortalTokenDocument> {
    const pt = await this.model.findOne({ token, isActive: true });
    if (!pt) throw new NotFoundException('Invalid or revoked portal token');
    if (pt.expiresAt && new Date() > pt.expiresAt) throw new ForbiddenException('Portal token expired');
    await this.model.findByIdAndUpdate(pt._id, { lastAccessedAt: new Date(), $inc: { accessCount: 1 } });
    return pt;
  }

  private buildPortalResponse(pt: PortalTokenDocument) {
    return {
      projectId: pt.projectId,
      customerName: pt.customerName,

      companyName: pt.companyName || null,
      logoUrl: pt.logoUrl || null,
      faviconUrl: pt.faviconUrl || null,
      primaryColor: pt.primaryColor || pt.brandColor || '#6366f1',
      secondaryColor: pt.secondaryColor || null,
      fontFamily: pt.fontFamily || 'Inter, sans-serif',
      darkMode: pt.darkMode ?? false,
      supportEmail: pt.supportEmail || null,
      portalTitle: pt.portalTitle || 'Webhook Portal',
      customCss: pt.customCss || null,
      socialLinks: pt.socialLinks || {},
      valid: true,
    };
  }

  async getPortalData(token: string) {
    const pt = await this.validatePortalToken(token);
    return this.buildPortalResponse(pt);
  }

  async getPortalDataByDomain(domain: string) {
    const pt = await this.model.findOne({ customDomain: domain, isActive: true });
    if (!pt) throw new NotFoundException('No portal configured for this domain');
    if (pt.expiresAt && new Date() > pt.expiresAt) throw new ForbiddenException('Portal token expired');
    await this.model.findByIdAndUpdate(pt._id, { lastAccessedAt: new Date(), $inc: { accessCount: 1 } });
    return this.buildPortalResponse(pt);
  }
}

@ApiTags('Portal')
@Controller('portal')
export class PortalController {
  constructor(private svc: PortalService) {}

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @Post('tokens')
  @ApiOperation({ summary: 'Create a portal token with full branding configuration' })
  @ApiBody({ schema: { required: ['projectId', 'customerName'], properties: { projectId: { type: 'string' }, customerName: { type: 'string', example: 'Acme Corp' }, customerEmail: { type: 'string', format: 'email' }, expiresAt: { type: 'string', format: 'date-time' }, companyName: { type: 'string' }, logoUrl: { type: 'string', format: 'uri' }, faviconUrl: { type: 'string', format: 'uri' }, primaryColor: { type: 'string', example: '#6366f1' }, secondaryColor: { type: 'string' }, fontFamily: { type: 'string', example: 'Inter, sans-serif' }, darkMode: { type: 'boolean', default: false }, customDomain: { type: 'string', description: 'CNAME domain for white-labelling' }, supportEmail: { type: 'string', format: 'email' }, portalTitle: { type: 'string', example: 'Webhook Dashboard' }, customCss: { type: 'string' }, socialLinks: { type: 'object' } } } })
  @ApiResponse({ status: 201, description: 'Portal token created — share the token with your customer' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  createToken(@Request() req: any, @Body() dto: CreatePortalTokenDto) { return this.svc.createToken(req.user.id, dto); }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @Get('tokens')
  @ApiOperation({ summary: 'List all portal tokens created by the current user' })
  @ApiResponse({ status: 200, description: 'Array of portal tokens with branding config and usage stats' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  listTokens(@Request() req: any) { return this.svc.listTokens(req.user.id); }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @Patch('tokens/:id/branding')
  @ApiOperation({ summary: 'Update branding settings (logo, colors, font, domain, CSS) for a portal token' })
  @ApiParam({ name: 'id', description: 'Portal token ID', type: String })
  @ApiResponse({ status: 200, description: 'Updated portal token' })
  @ApiResponse({ status: 404, description: 'Token not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  updateBranding(@Param('id') id: string, @Request() req: any, @Body() dto: CreatePortalTokenDto) { return this.svc.updateBranding(req.user.id, id, dto); }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @Patch('tokens/:id/subscriptions')
  @ApiOperation({ summary: 'Update which event types a customer can subscribe to through the portal' })
  @ApiParam({ name: 'id', description: 'Portal token ID', type: String })
  @ApiBody({ schema: { required: ['subscribedEventTypes'], properties: { subscribedEventTypes: { type: 'array', items: { type: 'string' }, example: ['payment.success', 'order.shipped'] } } } })
  @ApiResponse({ status: 200, description: 'Subscribed event types updated' })
  @ApiResponse({ status: 404, description: 'Token not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  updateSubscriptions(
    @Param('id') id: string,
    @Request() req: any,
    @Body() dto: UpdateSubscriptionsDto,
  ) {
    return this.svc.updateBranding(req.user.id, id, {
      subscribedEventTypes: dto.subscribedEventTypes,
    } as any);
  }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @Patch('tokens/:id/revoke')
  @ApiOperation({ summary: 'Revoke a portal token (customer loses access immediately)' })
  @ApiParam({ name: 'id', description: 'Portal token ID', type: String })
  @ApiResponse({ status: 200, description: 'Token revoked — isActive set to false' })
  @ApiResponse({ status: 404, description: 'Token not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  revokeToken(@Param('id') id: string, @Request() req: any) { return this.svc.revokeToken(req.user.id, id); }

  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @Delete('tokens/:id')
  @ApiOperation({ summary: 'Delete a portal token permanently' })
  @ApiParam({ name: 'id', description: 'Portal token ID', type: String })
  @ApiResponse({ status: 200, description: '{ success: true }' })
  @ApiResponse({ status: 404, description: 'Token not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  deleteToken(@Param('id') id: string, @Request() req: any) { return this.svc.deleteToken(req.user.id, id); }

  @Get('access/:token')
  @ApiOperation({ summary: 'Public: get portal branding and configuration by token (no auth required)' })
  @ApiParam({ name: 'token', description: 'Portal access token (starts with pt_)', type: String })
  @ApiResponse({ status: 200, description: 'Portal branding config, projectId, and customer info' })
  @ApiResponse({ status: 404, description: 'Token invalid or revoked' })
  @ApiResponse({ status: 403, description: 'Token expired' })
  getPortalData(@Param('token') token: string) { return this.svc.getPortalData(token); }

  @Get('domain/:domain')
  @ApiOperation({ summary: 'Public: get portal configuration by custom domain (for CNAME white-labelling)' })
  @ApiParam({ name: 'domain', description: 'Custom domain configured in portal token (e.g. webhooks.yourbrand.com)', type: String })
  @ApiResponse({ status: 200, description: 'Portal branding config for the given domain' })
  @ApiResponse({ status: 404, description: 'No portal configured for this domain' })
  @ApiResponse({ status: 403, description: 'Token expired' })
  getPortalByDomain(@Param('domain') domain: string) { return this.svc.getPortalDataByDomain(domain); }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: PortalToken.name, schema: PortalTokenSchema }])],
  controllers: [PortalController],
  providers: [PortalService],
  exports: [PortalService],
})
export class PortalModule {}
