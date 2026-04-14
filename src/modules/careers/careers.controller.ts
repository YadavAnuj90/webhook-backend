import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, Req,
  UseGuards, HttpCode, HttpStatus, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiQuery, ApiParam, ApiConsumes } from '@nestjs/swagger';
import { CareersService } from './careers.service';
import { ApplicationStatus } from './schemas/application.schema';
import { UserRole } from '../users/schemas/user.schema';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Public } from '../../common/guards/subscription.guard';
import { SkipEmailVerification } from '../../common/guards/email-verified.guard';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'resumes');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const resumeStorage = diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${extname(file.originalname)}`);
  },
});

const resumeFilter = (_req: any, file: any, cb: any) => {
  const allowed = ['.pdf', '.doc', '.docx'];
  if (allowed.includes(extname(file.originalname).toLowerCase())) cb(null, true);
  else cb(new Error('Only PDF and Word documents are allowed'), false);
};

@ApiTags('Careers (Public)')
@Controller('careers')
export class CareersPublicController {
  constructor(private readonly svc: CareersService) {}

  @Get('jobs')
  @SkipEmailVerification()
  @Public()
  @ApiOperation({ summary: 'List all open job positions' })
  @ApiQuery({ name: 'department', required: false })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'location', required: false })
  @ApiResponse({ status: 200, description: 'Array of open job listings' })
  async listJobs(
    @Query('department') department?: string,
    @Query('type') type?: string,
    @Query('location') location?: string,
  ) {
    return this.svc.listOpenJobs({ department, type, location });
  }

  @Get('jobs/:slug')
  @SkipEmailVerification()
  @Public()
  @ApiOperation({ summary: 'Get job details by slug' })
  @ApiParam({ name: 'slug', description: 'URL-friendly job identifier' })
  @ApiResponse({ status: 200, description: 'Full job details' })
  async getJob(@Param('slug') slug: string) {
    return this.svc.getJobBySlug(slug);
  }

  @Post('apply')
  @SkipEmailVerification()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('resume', {
    storage: resumeStorage,
    fileFilter: resumeFilter,
    limits: { fileSize: 5 * 1024 * 1024 },
  }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Submit a job application' })
  @ApiResponse({ status: 201, description: 'Application submitted' })
  @ApiResponse({ status: 409, description: 'Already applied for this position' })
  async apply(
    @Body() body: any,
    @UploadedFile() resume?: any ,
  ) {
    return this.svc.submitApplication({
      ...body,
      resumeUrl: resume ? `/uploads/resumes/${resume.filename}` : '',
      resumeFilename: resume?.originalname || '',
    });
  }
}

@ApiTags('Careers (Admin)')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('admin/careers')
export class CareersAdminController {
  constructor(private readonly svc: CareersService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Careers dashboard stats' })
  async getStats() {
    return this.svc.getStats();
  }

  @Get('jobs')
  @ApiOperation({ summary: 'List all jobs (any status)' })
  @ApiQuery({ name: 'status', required: false })
  async listAllJobs(@Query('status') status?: string) {
    return this.svc.adminListJobs({ status });
  }

  @Post('jobs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new job posting' })
  async createJob(@Body() body: any, @Req() req: any) {
    return this.svc.createJob({ ...body, postedBy: req.user.userId || req.user._id });
  }

  @Patch('jobs/:id')
  @ApiOperation({ summary: 'Update a job posting' })
  async updateJob(@Param('id') id: string, @Body() body: any) {
    return this.svc.updateJob(id, body);
  }

  @Post('jobs/:id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a draft job' })
  async publishJob(@Param('id') id: string) {
    return this.svc.publishJob(id);
  }

  @Post('jobs/:id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a job posting' })
  async closeJob(@Param('id') id: string) {
    return this.svc.closeJob(id);
  }

  @Delete('jobs/:id')
  @ApiOperation({ summary: 'Delete a job (only if no applications)' })
  async deleteJob(@Param('id') id: string) {
    return this.svc.deleteJob(id);
  }

  @Get('applications')
  @ApiOperation({ summary: 'List all applications with filters' })
  @ApiQuery({ name: 'jobId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listApplications(
    @Query('jobId') jobId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.adminListApplications({
      jobId, status,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('applications/:id')
  @ApiOperation({ summary: 'Get application details' })
  async getApplication(@Param('id') id: string) {
    return this.svc.getApplication(id);
  }

  @Patch('applications/:id/status')
  @ApiOperation({ summary: 'Update application status and notes' })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: ApplicationStatus; adminNotes?: string },
    @Req() req: any,
  ) {
    return this.svc.updateApplicationStatus(id, {
      ...body,
      reviewedBy: req.user.userId || req.user._id,
    });
  }
}
