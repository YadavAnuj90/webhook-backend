import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Global search' })
  search(@Query('q') q: string, @Request() req: any) {
    return this.searchService.globalSearch(q, req.user.id, req.user.role);
  }
}
