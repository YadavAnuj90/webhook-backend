import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';
import { PermissionGuard } from './permissions.guard';
import { CustomRole, CustomRoleSchema } from './schemas/custom-role.schema';

/**
 * PermissionsModule — marked @Global so PermissionsService and PermissionGuard
 * are available everywhere without explicit imports. This allows any controller
 * to use @RequirePermission() + PermissionGuard seamlessly.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CustomRole.name, schema: CustomRoleSchema },
    ]),
  ],
  controllers: [PermissionsController],
  providers: [PermissionsService, PermissionGuard],
  exports: [PermissionsService, PermissionGuard],
})
export class PermissionsModule {}
