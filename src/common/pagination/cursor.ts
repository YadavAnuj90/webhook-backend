import { Model, FilterQuery, SortOrder } from 'mongoose';
import { BadRequestException } from '@nestjs/common';

function encodeCursor(value: { v: any; id: string }): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): { v: any; id: string } {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed.id !== 'string') throw new Error('malformed');
    return parsed;
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }
}

export interface CursorPageResult<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface CursorPageOptions<T> {

  model: Model<T>;

  filter: FilterQuery<T>;

  sortField: string;

  sortOrder?: SortOrder;

  cursor?: string;

  limit?: number;

  projection?: Record<string, 0 | 1>;
}

export async function cursorPaginate<T>({
  model,
  filter,
  sortField,
  sortOrder = -1,
  cursor,
  limit = 20,
  projection,
}: CursorPageOptions<T>): Promise<CursorPageResult<T>> {
  const size = Math.max(1, Math.min(200, Math.floor(limit)));
  const cmp = sortOrder === -1 ? '$lt' : '$gt';

  const combinedFilter: FilterQuery<T> = { ...filter };
  if (cursor) {
    const { v, id } = decodeCursor(cursor);
    const orClause = [
      { [sortField]: { [cmp]: v } },
      { [sortField]: v, _id: { [cmp]: id } },
    ];

    if ((combinedFilter as any).$or) {
      (combinedFilter as any).$and = [
        { $or: (combinedFilter as any).$or },
        { $or: orClause },
      ];
      delete (combinedFilter as any).$or;
    } else {
      (combinedFilter as any).$or = orClause;
    }
  }

  let q = model
    .find(combinedFilter)
    .sort({ [sortField]: sortOrder, _id: sortOrder } as any)
    .limit(size + 1);
  if (projection) q = q.select(projection) as any;

  const rows = await q.lean().exec();
  const hasMore = rows.length > size;
  const data = hasMore ? rows.slice(0, size) : rows;

  let nextCursor: string | null = null;
  if (hasMore && data.length > 0) {
    const last: any = data[data.length - 1];
    nextCursor = encodeCursor({ v: last[sortField], id: String(last._id) });
  }

  return { data: data as unknown as T[], nextCursor, hasMore };
}
