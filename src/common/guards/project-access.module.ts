import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Project, ProjectSchema } from '../../modules/projects/schemas/project.schema';
import { Workspace, WorkspaceSchema } from '../../modules/workspaces/schemas/workspace.schema';
import { ProjectAccessGuard } from './project-access.guard';

/**
 * ProjectAccessModule — @Global so ProjectAccessGuard is available
 * everywhere without explicit imports. Provides the Mongoose models
 * needed for membership resolution.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Project.name, schema: ProjectSchema },
      { name: Workspace.name, schema: WorkspaceSchema },
    ]),
  ],
  providers: [ProjectAccessGuard],
  exports: [ProjectAccessGuard, MongooseModule],
})
export class ProjectAccessModule {}
