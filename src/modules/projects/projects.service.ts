// ─── Service ─────────────────────────────────────────────────────────────────
import {
  Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Project } from './schemas/project.schema';

export class CreateProjectDto {
  @ApiProperty({ example: 'My E-Commerce App' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateProjectDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() maxRetryAttempts?: number;
  @IsOptional() @IsNumber() defaultTimeoutMs?: number;
}

@Injectable()
export class ProjectsService {
  constructor(@InjectModel(Project.name) private projectModel: Model<Project>) {}

  async create(ownerId: string, dto: CreateProjectDto): Promise<Project> {
    return new this.projectModel({ ...dto, ownerId }).save();
  }

  async findAll(userId: string): Promise<Project[]> {
    return this.projectModel.find({
      $or: [{ ownerId: userId }, { 'members.userId': userId }],
    }).exec();
  }

  async findOne(id: string, userId: string): Promise<Project> {
    const project = await this.projectModel.findById(id);
    if (!project) throw new NotFoundException('Project not found');
    this.checkAccess(project, userId);
    return project;
  }

  async update(id: string, userId: string, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.findOne(id, userId);
    return this.projectModel.findByIdAndUpdate(id, dto, { new: true }) as any;
  }

  async delete(id: string, userId: string): Promise<void> {
    const project = await this.projectModel.findById(id);
    if (!project) throw new NotFoundException('Project not found');
    if (project.ownerId !== userId) throw new ForbiddenException('Only owner can delete');
    await this.projectModel.findByIdAndDelete(id);
  }

  async addMember(projectId: string, ownerId: string, memberId: string, role: string) {
    const project = await this.findOne(projectId, ownerId);
    if (project.ownerId !== ownerId) throw new ForbiddenException();

    const exists = project.members.find(m => m.userId === memberId);
    if (exists) return project;

    return this.projectModel.findByIdAndUpdate(
      projectId,
      { $push: { members: { userId: memberId, role } } },
      { new: true },
    );
  }

  async incrementEventCount(projectId: string): Promise<void> {
    await this.projectModel.findByIdAndUpdate(projectId, {
      $inc: { currentMonthEvents: 1 },
    });
  }

  async checkEventLimit(projectId: string): Promise<boolean> {
    const project = await this.projectModel.findById(projectId);
    if (!project) return false;
    return project.currentMonthEvents < project.monthlyEventLimit;
  }

  private checkAccess(project: Project, userId: string): void {
    const isOwner = project.ownerId === userId;
    const isMember = project.members.some(m => m.userId === userId);
    if (!isOwner && !isMember) throw new ForbiddenException('No access to this project');
  }
}
