import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PaginationCarousel({
  currentPage,
  totalPages,
  onPageChange,
  ariaLabel = "Pages",
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
}) {
  const pages = useMemo(() => buildPageRange(currentPage, totalPages), [currentPage, totalPages]);

  return (
    <nav className="mt-6 flex items-center justify-center gap-1" aria-label={ariaLabel}>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Button>

      {pages.map((page, index) =>
        page === "ellipsis" ? (
          <span
            key={index === 1 ? "ellipsis-start" : "ellipsis-end"}
            className="px-1 text-muted-foreground select-none"
          >
            ...
          </span>
        ) : (
          <Button
            key={page}
            variant={page === currentPage ? "default" : "ghost"}
            size="xs"
            onClick={() => onPageChange(page as number)}
            className={cn("min-w-8", page === currentPage && "font-bold cursor-default")}
            aria-label={`Page ${page}`}
            aria-current={page === currentPage ? "page" : undefined}
          >
            {page}
          </Button>
        ),
      )}

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        aria-label="Next page"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </nav>
  );
}

function buildPageRange(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [1];

  if (current > 3) {
    pages.push("ellipsis");
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push("ellipsis");
  }

  if (!pages.includes(total)) {
    pages.push(total);
  }

  return pages;
}
