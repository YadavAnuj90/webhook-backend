import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Transformation, TransformationDocument, TransformationSchema } from './schemas/transformation.schema';
import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/strategies/jwt.strategy';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Injectable()
export class TransformationsService {
  constructor(@InjectModel(Transformation.name) private model: Model<TransformationDocument>) {}

  async create(userId: string, dto: any) { return this.model.create({ ...dto, userId: new Types.ObjectId(userId) }); }

  async list(userId: string) { return this.model.find({ userId: new Types.ObjectId(userId) }).sort({ order: 1, createdAt: -1 }); }

  async update(userId: string, id: string, dto: any) {
    const t = await this.model.findById(id);
    if (!t) throw new NotFoundException();
    if (t.userId.toString() !== userId) throw new ForbiddenException();
    return this.model.findByIdAndUpdate(id, { $set: dto }, { new: true });
  }

  async delete(userId: string, id: string) {
    const t = await this.model.findById(id);
    if (!t) throw new NotFoundException();
    if (t.userId.toString() !== userId) throw new ForbiddenException();
    await this.model.findByIdAndDelete(id);
    return { success: true };
  }

  applyTransformation(payload: any, transformation: Transformation): any {
    try {
      let data = JSON.parse(JSON.stringify(payload));
      const cfg = transformation.config || {};
      switch (transformation.type) {
        case 'remove_fields':
          if (cfg.fields) for (const f of cfg.fields) delete data[f];
          break;
        case 'rename_keys':
          if (cfg.mappings) for (const [from, to] of Object.entries(cfg.mappings as Record<string, string>)) { if (data[from] !== undefined) { data[to as string] = data[from]; delete data[from]; } }
          break;
        case 'add_fields':
          if (cfg.additions) data = { ...data, ...cfg.additions };
          break;
        case 'filter':
          // simple field=value filter — returns null if no match (skip delivery)
          if (cfg.filterField && cfg.filterValue && data[cfg.filterField] !== cfg.filterValue) return null;
          break;
        case 'custom_js':
          // SAFE: no eval — just template substitution
          if (cfg.template) {
            const tmpl = JSON.stringify(cfg.template);
            const rendered = tmpl.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => JSON.stringify(data[k] ?? ''));
            data = JSON.parse(rendered);
          }
          break;
      }
      return data;
    } catch { return payload; }
  }

  async preview(userId: string, dto: { transformation: any; payload: any }) {
    const t = { ...dto.transformation, userId: new Types.ObjectId(userId) } as Transformation;
    const result = this.applyTransformation(dto.payload, t);
    return { input: dto.payload, output: result, dropped: result === null };
  }

  async getForEndpoint(endpointId: string) {
    return this.model.find({ endpointId: new Types.ObjectId(endpointId), isActive: true }).sort({ order: 1 });
  }
}

@ApiTags('Transformations')
@ApiBearerAuth('JWT')
@Controller('transformations')
@UseGuards(JwtAuthGuard)
export class TransformationsController {
  constructor(private svc: TransformationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a payload transformation rule' })
  create(@Request() req: any, @Body() dto: any) { return this.svc.create(req.user.id, dto); }

  @Get()
  @ApiOperation({ summary: 'List transformation rules' })
  list(@Request() req: any) { return this.svc.list(req.user.id); }

  @Put(':id')
  @ApiOperation({ summary: 'Update a transformation rule' })
  update(@Param('id') id: string, @Request() req: any, @Body() dto: any) { return this.svc.update(req.user.id, id, dto); }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a transformation rule' })
  delete(@Param('id') id: string, @Request() req: any) { return this.svc.delete(req.user.id, id); }

  @Post('preview')
  @ApiOperation({ summary: 'Preview transformation result on a sample payload' })
  preview(@Request() req: any, @Body() dto: any) { return this.svc.preview(req.user.id, dto); }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: Transformation.name, schema: TransformationSchema }])],
  controllers: [TransformationsController],
  providers: [TransformationsService],
  exports: [TransformationsService],
})
export class TransformationsModule {}
