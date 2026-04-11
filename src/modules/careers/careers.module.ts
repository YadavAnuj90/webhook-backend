import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { Job, JobSchema } from './schemas/job.schema';
import { Application, ApplicationSchema } from './schemas/application.schema';
import { CareersService } from './careers.service';
import { CareersPublicController, CareersAdminController } from './careers.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Job.name,         schema: JobSchema },
      { name: Application.name, schema: ApplicationSchema },
    ]),
    MulterModule.register({ dest: './uploads/resumes' }),
  ],
  controllers: [CareersPublicController, CareersAdminController],
  providers:   [CareersService],
  exports:     [CareersService],
})
export class CareersModule {}
