import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation,
  ApiResponse, ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth('JWT')
@UseGuards(AuthGuard('jwt'))
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Global full-text search across events, endpoints, and projects' })
  @ApiQuery({ name: 'q', required: true, type: String, description: 'Search query (min 2 characters)', example: 'payment webhook' })
  @ApiResponse({ status: 200, description: 'Search results grouped by type (events, endpoints, projects)' })
  @ApiResponse({ status: 400, description: 'Query too short or missing' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  search(@Query('q') q: string, @Request() req: any) {
    return this.searchService.globalSearch(q, req.user.id, req.user.role);
  }
}
