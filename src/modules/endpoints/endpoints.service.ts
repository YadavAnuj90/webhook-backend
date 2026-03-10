import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { Endpoint, EndpointStatus } from './schemas/endpoint.schema';

@Injectable()
export class EndpointsService {
  constructor(@InjectModel(Endpoint.name) private endpointModel: Model<Endpoint>) {}

  async create(projectId: string, dto: any) {
    const exists = await this.endpointModel.findOne({ projectId, url: dto.url });
    if (exists) throw new ConflictException('Endpoint with this URL already exists in this project');
    const secret = `whksec_${randomBytes(24).toString('hex')}`;
    return this.endpointModel.create({ ...dto, projectId, secret });
  }

  async findAll(projectId: string, page = 1, limit = 20, status?: EndpointStatus) {
    const filter: any = { projectId };
    if (status) filter.status = status;
    const skip = (page - 1) * limit;
    const [endpoints, total] = await Promise.all([
      this.endpointModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      this.endpointModel.countDocuments(filter),
    ]);
    return { endpoints, total, page, limit };
  }

  async findOne(id: string, projectId: string) {
    const ep = await this.endpointModel.findOne({ _id: id, projectId });
    if (!ep) throw new NotFoundException('Endpoint not found');
    return ep;
  }

  async update(id: string, projectId: string, dto: any) {
    const ep = await this.endpointModel.findOneAndUpdate({ _id: id, projectId }, dto, { new: true });
    if (!ep) throw new NotFoundException('Endpoint not found');
    return ep;
  }

  async delete(id: string, projectId: string) {
    const ep = await this.endpointModel.findOneAndDelete({ _id: id, projectId });
    if (!ep) throw new NotFoundException('Endpoint not found');
    return { message: 'Endpoint deleted' };
  }

  async rotateSecret(id: string, projectId: string) {
    const secret = `whksec_${randomBytes(24).toString('hex')}`;
    const ep = await this.endpointModel.findOneAndUpdate({ _id: id, projectId }, { secret }, { new: true });
    if (!ep) throw new NotFoundException('Endpoint not found');
    return { secret };
  }

  async pause(id: string, projectId: string) {
    return this.endpointModel.findOneAndUpdate({ _id: id, projectId }, { status: EndpointStatus.PAUSED }, { new: true });
  }

  async resume(id: string, projectId: string) {
    return this.endpointModel.findOneAndUpdate({ _id: id, projectId }, { status: EndpointStatus.ACTIVE }, { new: true });
  }
}
