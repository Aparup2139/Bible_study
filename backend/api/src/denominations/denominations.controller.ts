import { Controller, Get, Header, Param } from '@nestjs/common';
import type { Denomination } from '@bibleway/shared-types';
import { DenominationsService } from './denominations.service';

/**
 * Public reference data. No auth.
 *
 * Cache-Control is aggressive on purpose (rule #5/#6): browsers cache for an hour,
 * shared/edge caches (CDN) for a day, and may serve stale while revalidating.
 * This data changes monthly at most.
 */
@Controller('denominations')
export class DenominationsController {
  constructor(private readonly denominations: DenominationsService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400')
  list(): Promise<Denomination[]> {
    return this.denominations.list();
  }

  @Get(':id')
  @Header('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400')
  getById(@Param('id') id: string): Promise<Denomination> {
    return this.denominations.getById(id);
  }
}
