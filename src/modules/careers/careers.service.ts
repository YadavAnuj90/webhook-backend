import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job, JobStatus } from './schemas/job.schema';
import { Application, ApplicationStatus } from './schemas/application.schema';

@Injectable()
export class CareersService {
  private readonly logger = new Logger(CareersService.name);

  constructor(
    @InjectModel(Job.name)         private jobModel: Model<Job>,
    @InjectModel(Application.name) private appModel: Model<Application>,
  ) {}

  async listOpenJobs(filters?: { department?: string; type?: string; location?: string }) {
    const query: any = { status: JobStatus.OPEN };
    if (filters?.department) query.department = filters.department;
    if (filters?.type)       query.type       = filters.type;
    if (filters?.location)   query.location   = { $regex: filters.location, $options: 'i' };

    return this.jobModel
      .find(query)
      .select('-description -requirements -niceToHave -perks -postedBy')
      .sort({ publishedAt: -1 })
      .lean();
  }

  async getJobBySlug(slug: string) {
    const job = await this.jobModel.findOne({ slug, status: JobStatus.OPEN }).lean();
    if (!job) throw new NotFoundException('Job not found or no longer open');
    return job;
  }

  async submitApplication(dto: {
    jobId: string;
    fullName: string;
    email: string;
    phone: string;
    linkedinUrl?: string;
    portfolioUrl?: string;
    resumeUrl?: string;
    resumeFilename?: string;
    coverLetter?: string;
    currentCtc?: string;
    expectedCtc?: string;
    noticePeriod?: string;
    currentCompany?: string;
    yearsOfExperience?: string;
  }) {
    const isGeneral = dto.jobId === 'general';
    let jobTitle = 'General Application';

    if (!isGeneral) {

      const job = await this.jobModel.findById(dto.jobId);
      if (!job || job.status !== JobStatus.OPEN) {
        throw new BadRequestException('This position is no longer accepting applications');
      }
      jobTitle = job.title;

      await this.jobModel.updateOne({ _id: dto.jobId }, { $inc: { applicationCount: 1 } });
    }

    const existing = await this.appModel.findOne({ email: dto.email.toLowerCase(), jobId: dto.jobId });
    if (existing) {
      throw new ConflictException('You have already applied for this position');
    }

    const application = await this.appModel.create({
      ...dto,
      email: dto.email.toLowerCase(),
      jobTitle,
      status: ApplicationStatus.NEW,
    });

    this.logger.log(`New application: ${dto.fullName} → ${jobTitle}`);
    return { id: application._id, message: 'Application submitted successfully' };
  }

  async adminListJobs(filters?: { status?: string }) {
    const query: any = {};
    if (filters?.status) query.status = filters.status;
    return this.jobModel.find(query).sort({ createdAt: -1 }).lean();
  }

  async createJob(dto: Partial<Job> & { postedBy: string }) {

    if (!dto.slug && dto.title) {
      dto.slug = dto.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        + '-' + Date.now().toString(36);
    }
    return this.jobModel.create(dto);
  }

  async updateJob(jobId: string, dto: Partial<Job>) {
    const job = await this.jobModel.findByIdAndUpdate(jobId, dto, { new: true });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async publishJob(jobId: string) {
    return this.updateJob(jobId, { status: JobStatus.OPEN, publishedAt: new Date() } as any);
  }

  async closeJob(jobId: string) {
    return this.updateJob(jobId, { status: JobStatus.CLOSED } as any);
  }

  async deleteJob(jobId: string) {
    const job = await this.jobModel.findById(jobId);
    if (!job) throw new NotFoundException('Job not found');
    if (job.applicationCount > 0) {
      throw new BadRequestException('Cannot delete a job with existing applications. Close it instead.');
    }
    await this.jobModel.deleteOne({ _id: jobId });
    return { message: 'Job deleted' };
  }

  async adminListApplications(filters?: {
    jobId?: string; status?: string; page?: number; limit?: number;
  }) {
    const query: any = {};
    if (filters?.jobId)  query.jobId  = filters.jobId;
    if (filters?.status) query.status = filters.status;

    const page  = Math.max(1, filters?.page || 1);
    const limit = Math.min(100, Math.max(1, filters?.limit || 25));
    const skip  = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.appModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.appModel.countDocuments(query),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getApplication(id: string) {
    const app = await this.appModel.findById(id).lean();
    if (!app) throw new NotFoundException('Application not found');
    return app;
  }

  async updateApplicationStatus(id: string, dto: {
    status: ApplicationStatus;
    adminNotes?: string;
    reviewedBy: string;
  }) {
    const app = await this.appModel.findByIdAndUpdate(id, {
      status: dto.status,
      ...(dto.adminNotes != null && { adminNotes: dto.adminNotes }),
      reviewedBy: dto.reviewedBy,
      reviewedAt: new Date(),
    }, { new: true });
    if (!app) throw new NotFoundException('Application not found');

    this.logger.log(`Application ${id} → ${dto.status} by ${dto.reviewedBy}`);
    return app;
  }

  async getStats() {
    const [openJobs, totalApps, newApps, shortlisted] = await Promise.all([
      this.jobModel.countDocuments({ status: JobStatus.OPEN }),
      this.appModel.countDocuments(),
      this.appModel.countDocuments({ status: ApplicationStatus.NEW }),
      this.appModel.countDocuments({ status: ApplicationStatus.SHORTLISTED }),
    ]);
    return { openJobs, totalApplications: totalApps, newApplications: newApps, shortlisted };
  }
}
