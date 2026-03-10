import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PortalToken, PortalTokenDocument, PortalTokenSchema } from './schemas/portal.schema';
import { Controller, Get, Post, Delete, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/strategies/jwt.strategy';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import * as crypto from 'crypto';

@Injectable()
export class PortalService {
  constructor(@InjectModel(PortalToken.name) private model: Model<PortalTokenDocument>) {}

  async createToken(userId: string, dto: { projectId: string; customerName: string; customerEmail?: string; expiresAt?: string; logoUrl?: string; brandColor?: string }) {
    const token = 'pt_' + crypto.randomBytes(24).toString('hex');
    return this.model.create({
      userId: new Types.ObjectId(userId),
      projectId: new Types.ObjectId(dto.projectId),
      token, customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      logoUrl: dto.logoUrl, brandColor: dto.brandColor,
    });
  }

  async listTokens(userId: string) {
    return this.model.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 });
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

  async getPortalData(token: string) {
    const pt = await this.validatePortalToken(token);
    // Return branding + projectId for frontend to use
    return {
      projectId: pt.projectId,
      customerName: pt.customerName,
      logoUrl: pt.logoUrl,
      brandColor: pt.brandColor || '#6366f1',
      valid: true,
    };
  }
}

@ApiTags('Portal')
@Controller('portal')
export class PortalController {
  constructor(private svc: PortalService) {}

  // Authenticated: manage portal tokens
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @Post('tokens')
  @ApiOperation({ summary: 'Create a portal token for customer access' })
  createToken(@Request() req: any, @Body() dto: any) { return this.svc.createToken(req.user.id, dto); }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @Get('tokens')
  @ApiOperation({ summary: 'List portal tokens' })
  listTokens(@Request() req: any) { return this.svc.listTokens(req.user.id); }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @Patch('tokens/:id/revoke')
  @ApiOperation({ summary: 'Revoke a portal token' })
  revokeToken(@Param('id') id: string, @Request() req: any) { return this.svc.revokeToken(req.user.id, id); }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @Delete('tokens/:id')
  @ApiOperation({ summary: 'Delete a portal token' })
  deleteToken(@Param('id') id: string, @Request() req: any) { return this.svc.deleteToken(req.user.id, id); }

  // Public: customer portal access
  @Get('access/:token')
  @ApiOperation({ summary: 'Public: retrieve portal branding data by token' })
  getPortalData(@Param('token') token: string) { return this.svc.getPortalData(token); }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: PortalToken.name, schema: PortalTokenSchema }])],
  controllers: [PortalController],
  providers: [PortalService],
  exports: [PortalService],
})
export class PortalModule {}
