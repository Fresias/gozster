import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { Button } from "./button";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "./icons";
import { EmptyState } from "./empty-state";

export interface ColumnDef<TData, TValue = unknown> {
  id?: string;
  accessorKey?: keyof TData | string;
  header:
    | React.ReactNode
    | ((context: {
        column: ColumnDef<TData, TValue>;
        isSorted: false | "asc" | "desc";
        toggleSorting: () => void;
      }) => React.ReactNode);
  cell?: (context: {
    row: TData;
    value: TValue;
    index: number;
  }) => React.ReactNode;
  sortable?: boolean;
  enableSorting?: boolean;
  className?: string;
  headerClassName?: string;
  cellProps?:
    | (React.TdHTMLAttributes<HTMLTableCellElement> & Record<string, any>)
    | ((context: {
        row: TData;
        value: TValue;
        index: number;
      }) => React.TdHTMLAttributes<HTMLTableCellElement> & Record<string, any>);
}

export interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  pageSize?: number;
  showPagination?: boolean;
  searchKey?: keyof TData | string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  containerClassName?: string;
  tableClassName?: string;
  headerRowClassName?: string;
  rowClassName?: string | ((row: TData, index: number) => string);
  paginationClassName?: string;
  onRowClick?: (row: TData) => void;
  tableTestId?: string;
  rowTestId?: string | ((row: TData, index: number) => string);
}

export function DataTable<TData>({
  columns,
  data,
  pageSize = 15,
  showPagination = true,
  searchKey,
  searchPlaceholder = "Buscar...",
  emptyTitle = "Sin resultados",
  emptyDescription = "No se encontraron elementos que coincidan con la búsqueda.",
  className,
  containerClassName,
  tableClassName,
  headerRowClassName,
  rowClassName,
  paginationClassName,
  onRowClick,
  tableTestId,
  rowTestId,
}: DataTableProps<TData>) {
  const [pageIndex, setPageIndex] = React.useState(0);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc" | null>(null);

  // Helper to extract value by accessorKey
  const getCellValue = (item: TData, col: ColumnDef<TData>): any => {
    const key = (col.accessorKey || col.id) as keyof TData | undefined;
    if (!key) return undefined;
    return item[key];
  };

  // Filter
  const filteredData = React.useMemo(() => {
    if (!searchTerm || !searchKey) return data;
    const term = searchTerm.toLowerCase().trim();
    return data.filter((item) => {
      const val = item[searchKey as keyof TData];
      if (val === null || val === undefined) return false;
      return String(val).toLowerCase().includes(term);
    });
  }, [data, searchTerm, searchKey]);

  // Sort
  const sortedData = React.useMemo(() => {
    if (!sortKey || !sortOrder) return filteredData;
    const col = columns.find((c) => (c.id || c.accessorKey) === sortKey);
    if (!col) return filteredData;

    return [...filteredData].sort((a, b) => {
      const valA = getCellValue(a, col);
      const valB = getCellValue(b, col);

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (typeof valA === "number" && typeof valB === "number") {
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortOrder === "asc"
        ? strA.localeCompare(strB)
        : strB.localeCompare(strA);
    });
  }, [filteredData, sortKey, sortOrder, columns]);

  // Reset page when filter or data changes
  React.useEffect(() => {
    setPageIndex(0);
  }, [searchTerm, data]);

  // Pagination calculation
  const totalRows = sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(pageIndex, totalPages - 1);
  const currentCount = totalRows === 0 ? 0 : Math.min((currentPage + 1) * pageSize, totalRows);

  const paginatedData = React.useMemo(() => {
    if (!showPagination) return sortedData;
    const start = currentPage * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize, showPagination]);

  const handleSort = (columnId: string) => {
    if (sortKey === columnId) {
      if (sortOrder === "asc") setSortOrder("desc");
      else if (sortOrder === "desc") {
        setSortOrder(null);
        setSortKey(null);
      }
    } else {
      setSortKey(columnId);
      setSortOrder("asc");
    }
  };

  return (
    <div className={cn("w-full space-y-3", className)}>
      {searchKey && (
        <div className="flex items-center gap-2 max-w-sm">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-xl border border-border/80 bg-background pl-9 pr-3 py-2 text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      )}

      <div className={cn("rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden", containerClassName)}>
        <Table className={tableClassName} data-testid={tableTestId}>
          <TableHeader>
            <TableRow className={headerRowClassName}>
              {columns.map((col, idx) => {
                const colId = (col.id || col.accessorKey || idx).toString();
                const isSortable = col.sortable ?? col.enableSorting ?? false;
                const isCurrentSorted = sortKey === colId;
                const currentDirection = isCurrentSorted ? sortOrder : false;

                const ariaSortValue: "ascending" | "descending" | "none" | undefined = isSortable
                  ? isCurrentSorted && sortOrder === "asc"
                    ? "ascending"
                    : isCurrentSorted && sortOrder === "desc"
                      ? "descending"
                      : "none"
                  : undefined;

                return (
                  <TableHead
                    key={colId}
                    role="columnheader"
                    aria-sort={ariaSortValue}
                    className={cn(col.headerClassName)}
                  >
                    {isSortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(colId)}
                        className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer select-none -ml-1 px-1 py-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {typeof col.header === "function"
                          ? col.header({
                              column: col,
                              isSorted: currentDirection || false,
                              toggleSorting: () => handleSort(colId),
                            })
                          : col.header}
                        {isCurrentSorted ? (
                          sortOrder === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5 text-foreground" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-foreground" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-50" />
                        )}
                      </button>
                    ) : typeof col.header === "function" ? (
                      col.header({
                        column: col,
                        isSorted: false,
                        toggleSorting: () => {},
                      })
                    ) : (
                      col.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length > 0 ? (
              paginatedData.map((row, rowIdx) => (
                <TableRow
                  key={rowIdx}
                  data-testid={
                    typeof rowTestId === "function"
                      ? rowTestId(row, rowIdx)
                      : rowTestId
                  }
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    onRowClick && "cursor-pointer hover:bg-muted/60 transition-colors",
                    typeof rowClassName === "function" ? rowClassName(row, rowIdx) : rowClassName,
                  )}
                >
                  {columns.map((col, colIdx) => {
                    const colId = (col.id || col.accessorKey || colIdx).toString();
                    const val = getCellValue(row, col);
                    const extraProps = typeof col.cellProps === "function"
                      ? col.cellProps({ row, value: val, index: rowIdx })
                      : col.cellProps;
                    return (
                      <TableCell key={colId} className={col.className} {...extraProps}>
                        {col.cell
                          ? col.cell({ row, value: val, index: rowIdx })
                          : (val as React.ReactNode) ?? "—"}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center p-0"
                >
                  <EmptyState
                    bordered={false}
                    title={emptyTitle}
                    description={emptyDescription}
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {showPagination && (
        <div className={cn("flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-2 text-xs text-muted-foreground select-none", paginationClassName)}>
          <div data-testid="data-table-legend">
            Mostrando {currentCount} de {totalRows}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentPage === 0}
              aria-label="Página anterior"
              className="h-8 px-3 text-xs gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Anterior</span>
            </Button>
            <div className="text-xs font-medium text-foreground px-2">
              Página {currentPage + 1} de {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPageIndex((prev) => Math.min(totalPages - 1, prev + 1))}
              disabled={currentPage >= totalPages - 1}
              aria-label="Página siguiente"
              className="h-8 px-3 text-xs gap-1"
            >
              <span>Siguiente</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
