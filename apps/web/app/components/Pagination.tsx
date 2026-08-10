'use client';

interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

function buildPages(page: number, pageCount: number): (number | 'ellipsis')[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i);
  }
  const pages: (number | 'ellipsis')[] = [0];
  if (page > 2) pages.push('ellipsis');
  for (let i = Math.max(1, page - 1); i <= Math.min(pageCount - 2, page + 1); i += 1) {
    pages.push(i);
  }
  if (page < pageCount - 3) pages.push('ellipsis');
  pages.push(pageCount - 1);
  return pages;
}

export default function Pagination({ page, pageCount, total, pageSize, onPageChange }: PaginationProps) {
  if (pageCount <= 1) {
    return (
      <div className="component-pagination">
        <span className="component-pagination-info">
          {total} item{total === 1 ? '' : 's'}
        </span>
      </div>
    );
  }

  const start = page * pageSize + 1;
  const end = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="component-pagination">
      <button
        type="button"
        className="button small secondary"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        ‹ Prev
      </button>
      {buildPages(page, pageCount).map((p, idx) =>
        p === 'ellipsis' ? (
          <span key={`ellipsis-${idx}`} className="component-pagination-ellipsis">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={`button small ${p === page ? 'primary' : 'secondary'}`}
            onClick={() => onPageChange(p)}
            aria-current={p === page ? 'page' : undefined}
          >
            {p + 1}
          </button>
        )
      )}
      <button
        type="button"
        className="button small secondary"
        disabled={page >= pageCount - 1}
        onClick={() => onPageChange(page + 1)}
      >
        Next ›
      </button>
      <span className="component-pagination-info">
        {start}–{end} of {total}
      </span>
    </div>
  );
}
