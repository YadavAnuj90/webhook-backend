import { Injectable, NotFoundException, ConflictException, ForbiddenException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { Endpoint, EndpointStatus, SignatureScheme } from './schemas/endpoint.schema';
import { SignatureUtil } from '../../utils/signature.util';
import { Subscription, SubscriptionStatus } from '../billing/schemas/subscription.schema';
import { RedisCache } from '../../common/cache/redis-cache.service';

@Injectable()
export class EndpointsService {
  constructor(
    @InjectModel(Endpoint.name)      private endpointModel: Model<Endpoint>,
    @InjectModel(Subscription.name)  private subModel:      Model<Subscription>,
    @Optional() private cache?: RedisCache,
  ) {}

  private async invalidateEndpointCache(id: string) {
    if (this.cache) await this.cache.del(`ep:${id}`);
  }

  async create(projectId: string, dto: any, userId?: string) {
    const exists = await this.endpointModel.findOne({ projectId, url: dto.url });
    if (exists) throw new ConflictException('Endpoint with this URL already exists in this project');

    if (userId) {
      const sub = await this.subModel.findOne({ userId });
      if (sub && sub.endpointsLimit > 0) {
        const currentCount = await this.endpointModel.countDocuments({ projectId });
        if (currentCount >= sub.endpointsLimit) {
          throw new ForbiddenException(
            `Endpoint limit reached (${sub.endpointsLimit} on ${sub.planName} plan). Upgrade to create more.`,
          );
        }
      }
    }

    let secret: string;
    let ed25519PublicKey: string | undefined;

    if (dto.signatureScheme === SignatureScheme.ED25519) {
      const kp = SignatureUtil.generateEd25519KeyPair();
      secret = kp.privateKey;
      ed25519PublicKey = kp.publicKey;
    } else {
      secret = `whksec_${randomBytes(24).toString('hex')}`;
    }

    return this.endpointModel.create({ ...dto, projectId, secret, ed25519PublicKey });
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
    await this.invalidateEndpointCache(id);
    return ep;
  }

  async delete(id: string, projectId: string) {
    const ep = await this.endpointModel.findOneAndDelete({ _id: id, projectId });
    if (!ep) throw new NotFoundException('Endpoint not found');
    await this.invalidateEndpointCache(id);
    return { message: 'Endpoint deleted' };
  }

  async rotateSecret(id: string, projectId: string) {
    const ep = await this.endpointModel.findOne({ _id: id, projectId });
    if (!ep) throw new NotFoundException('Endpoint not found');

    let secret: string;
    let ed25519PublicKey: string | undefined;

    if (ep.signatureScheme === SignatureScheme.ED25519) {
      const kp = SignatureUtil.generateEd25519KeyPair();
      secret = kp.privateKey;
      ed25519PublicKey = kp.publicKey;
    } else {
      secret = `whksec_${randomBytes(24).toString('hex')}`;
    }

    await this.endpointModel.findOneAndUpdate({ _id: id, projectId }, { secret, ed25519PublicKey }, { new: true });

    await this.invalidateEndpointCache(id);
    return { secret, publicKey: ed25519PublicKey };
  }

  async pause(id: string, projectId: string) {
    const ep = await this.endpointModel.findOneAndUpdate({ _id: id, projectId }, { status: EndpointStatus.PAUSED }, { new: true });
    await this.invalidateEndpointCache(id);
    return ep;
  }

  async resume(id: string, projectId: string) {
    const ep = await this.endpointModel.findOneAndUpdate({ _id: id, projectId }, { status: EndpointStatus.ACTIVE }, { new: true });
    await this.invalidateEndpointCache(id);
    return ep;
  }
}
