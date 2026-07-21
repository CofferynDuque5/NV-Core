import { ApiProperty } from "@nestjs/swagger";

/**
 * Generic paginated list envelope. Mirrors `ListResult<T>` from @nv/domain so
 * the frontend HTTP adapter can consume it 1:1.
 */
export class ListResultDto<T> {
  @ApiProperty({ isArray: true })
  items: T[];

  @ApiProperty({ example: 0 })
  total: number;

  constructor(items: T[] = [], total = 0) {
    this.items = items;
    this.total = total;
  }

  static empty<T>(): ListResultDto<T> {
    return new ListResultDto<T>([], 0);
  }
}
