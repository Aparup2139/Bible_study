import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Denomination, DenominationGroup } from '@bibleway/shared-types';
import { SupabaseService } from '../supabase/supabase.service';

/** Row shape from public.denominations (snake_case). */
interface DenominationRow {
  id: string;
  name: string;
  group: DenominationGroup;
  description: string;
  bible_version: string;
  founded_year: number | null;
  worldwide_members: number | string | null;
  global_followers: string;
  sort_order: number;
}

const DENOM_COLUMNS =
  'id, name, "group", description, bible_version, founded_year, worldwide_members, global_followers, sort_order';

// Reference data changes monthly at most — a short in-process cache spares the DB
// on the hot list endpoint. Swap for Upstash Redis in Phase 8 (rule #6) without
// touching callers. Cache header on the controller does the heavy lifting at the edge.
const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class DenominationsService {
  constructor(private readonly supabase: SupabaseService) {}

  private cache: { at: number; data: Denomination[] } | null = null;

  /** All denominations, ordered for display. Cached in-process. */
  async list(): Promise<Denomination[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.data;
    }
    const { data, error } = await this.supabase.admin
      .from('denominations')
      .select(DENOM_COLUMNS)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
      .returns<DenominationRow[]>();

    if (error) throw new BadRequestException(error.message);
    const mapped = (data ?? []).map(toDenomination);
    this.cache = { at: Date.now(), data: mapped };
    return mapped;
  }

  /** Single denomination by slug id. */
  async getById(id: string): Promise<Denomination> {
    const { data, error } = await this.supabase.admin
      .from('denominations')
      .select(DENOM_COLUMNS)
      .eq('id', id)
      .maybeSingle<DenominationRow>();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException(`No denomination '${id}'`);
    return toDenomination(data);
  }

  /** Invalidate the in-process cache (call after a future admin write). */
  invalidate(): void {
    this.cache = null;
  }
}

/** Map a DB row to the API/frontend contract. */
function toDenomination(row: DenominationRow): Denomination {
  const members =
    row.worldwide_members === null || row.worldwide_members === undefined
      ? ''
      : Number(row.worldwide_members).toLocaleString('en-US');
  return {
    id: row.id,
    name: row.name,
    group: row.group,
    description: row.description,
    globalFollowers: row.global_followers,
    bibleVersion: row.bible_version,
    foundedYear: row.founded_year ?? 0,
    worldwideMembers: members,
  };
}
