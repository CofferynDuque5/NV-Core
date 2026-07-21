import { Controller, Get, NotFoundException, Param } from "@nestjs/common";
import { Injectable, Module } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { getWorkspaceBySlug, WORKSPACES, type Workspace } from "@nv/domain";

/**
 * Workspaces are structural configuration (branding + enabled modules), so
 * these are served from @nv/domain config — not the database. This is the one
 * place returning non-empty data because it is configuration, not user data.
 */
@Injectable()
export class WorkspacesService {
  list(): Workspace[] {
    return WORKSPACES;
  }

  get(slug: string): Workspace {
    const ws = getWorkspaceBySlug(slug);
    if (!ws) throw new NotFoundException(`Workspace "${slug}" no encontrado`);
    return ws;
  }
}

@ApiTags("workspaces")
@Controller("workspaces")
export class WorkspacesController {
  constructor(private readonly service: WorkspacesService) {}

  @Get()
  list(): Workspace[] {
    return this.service.list();
  }

  @Get(":workspace")
  get(@Param("workspace") slug: string): Workspace {
    return this.service.get(slug);
  }
}

@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
