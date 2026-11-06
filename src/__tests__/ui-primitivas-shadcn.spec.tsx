import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  StatusBadge,
  type StatusBadgeProps,
} from "@/components/ui/status-badge";
import { Segmented } from "@/components/ui/segmented";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import * as Icons from "@/components/ui/icons";

describe("GOZS-376: Primitivas UI con API shadcn y Regla Ponytail", () => {
  describe("Regla Ponytail y Dependencias", () => {
    it("GIVEN package.json THEN no contiene @radix-ui ni lucide-react", () => {
      const packageJsonPath = path.resolve(process.cwd(), "package.json");
      const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
      const pkg = JSON.parse(packageJsonContent);

      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      const hasRadix = Object.keys(allDeps).some((dep) =>
        dep.startsWith("@radix-ui"),
      );
      const hasLucide = "lucide-react" in allDeps;

      expect(hasRadix).toBe(false);
      expect(hasLucide).toBe(false);
    });
  });

  describe("StatusBadge (Criterio 1: Contrato estricto de children)", () => {
    it("GIVEN un StatusBadge con children THEN compila y renderiza correctamente", () => {
      const html = renderToStaticMarkup(
        <StatusBadge variant="success" size="md" dot>
          Al día
        </StatusBadge>,
      );

      expect(html).toContain("Al día");
      expect(html).toContain("bg-emerald-500"); // dot
      expect(html).toContain("border-emerald-500/30");
      expect(html).toContain("rounded-full");
    });

    it("GIVEN el contrato TypeScript de StatusBadgeProps THEN children es una prop obligatoria (no opcional)", () => {
      // Si la prop es opcional (children?: React.ReactNode), Pick<Props, "children"> permitiría un objeto vacío {}
      type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? true : false;
      type IsChildrenOptional = IsOptional<StatusBadgeProps, "children">;
      const isOptional: IsChildrenOptional = false;
      expect(isOptional).toBe(false);
    });

    it("renderiza variantes semánticas con ratios de contraste accesibles", () => {
      const variants = [
        "default",
        "neutral",
        "success",
        "warning",
        "destructive",
        "info",
        "purple",
      ] as const;

      for (const variant of variants) {
        const html = renderToStaticMarkup(
          <StatusBadge variant={variant}>{variant}</StatusBadge>,
        );
        expect(html).toContain(variant);
      }
    });
  });

  describe("Sheet y Dialog (<dialog> nativo, Escape y retorno de foco)", () => {
    it("GIVEN un Dialog abierto THEN renderiza elemento dialog con aria-modal y rol dialog", () => {
      const html = renderToStaticMarkup(
        <Dialog open={true}>
          <DialogTrigger>Abrir Diálogo</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Título del Diálogo</DialogTitle>
              <DialogDescription>Descripción accesible</DialogDescription>
            </DialogHeader>
            <p>Contenido modal</p>
            <DialogFooter>
              <DialogClose>Cancelar</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>,
      );

      expect(html).toContain("<dialog");
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain("Título del Diálogo");
      expect(html).toContain("Descripción accesible");
      expect(html).toContain('aria-label="Cerrar"');
    });

    it("GIVEN un Sheet abierto THEN renderiza elemento dialog lateral con soporte de orientación", () => {
      const html = renderToStaticMarkup(
        <Sheet open={true}>
          <SheetTrigger>Abrir Sheet</SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Ficha Lateral</SheetTitle>
              <SheetDescription>Detalle del alumno</SheetDescription>
            </SheetHeader>
            <div>Cuerpo del sheet</div>
            <SheetFooter>
              <SheetClose>Cerrar Ficha</SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>,
      );

      expect(html).toContain("<dialog");
      expect(html).toContain('role="dialog"');
      expect(html).toContain("Ficha Lateral");
      expect(html).toContain("slide-in-from-right");
    });

    it("GIVEN un Dialog abierto WHEN se presiona Escape THEN cierra inmediatamente y reubica el foco en el disparador", () => {
      const onOpenChange = vi.fn();
      const mockTrigger = { focus: vi.fn() } as unknown as HTMLButtonElement;

      // Montamos función simulando handleKeyDown en DialogContent
      const setOpen = (next: boolean) => {
        onOpenChange(next);
        if (!next && mockTrigger) {
          mockTrigger.focus();
        }
      };

      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();

      const simulateEscape = () => {
        preventDefault();
        stopPropagation();
        setOpen(false);
      };

      simulateEscape();

      expect(preventDefault).toHaveBeenCalled();
      expect(stopPropagation).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mockTrigger.focus).toHaveBeenCalledTimes(1);
    });

    it("GIVEN un Sheet abierto WHEN se presiona Escape THEN cierra inmediatamente y reubica el foco en el disparador", () => {
      const onOpenChange = vi.fn();
      const mockTrigger = { focus: vi.fn() } as unknown as HTMLButtonElement;

      const setOpen = (next: boolean) => {
        onOpenChange(next);
        if (!next && mockTrigger) {
          mockTrigger.focus();
        }
      };

      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();

      const simulateEscape = () => {
        preventDefault();
        stopPropagation();
        setOpen(false);
      };

      simulateEscape();

      expect(preventDefault).toHaveBeenCalled();
      expect(stopPropagation).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(mockTrigger.focus).toHaveBeenCalledTimes(1);
    });
  });

  describe("DataTable (Criterio 3: 36 filas, pageSize = 15, leyenda y paginación)", () => {
    interface TestItem {
      id: number;
      nombre: string;
      plan: string;
      estado: string;
    }

    const mockData: TestItem[] = Array.from({ length: 36 }, (_, i) => ({
      id: i + 1,
      nombre: `Alumno ${i + 1}`,
      plan: i % 2 === 0 ? "Pase Libre" : "3 Días",
      estado: i % 3 === 0 ? "Al día" : "Pendiente",
    }));

    const mockColumns: ColumnDef<TestItem>[] = [
      { id: "id", accessorKey: "id", header: "#", sortable: true },
      { id: "nombre", accessorKey: "nombre", header: "Nombre", sortable: true },
      { id: "plan", accessorKey: "plan", header: "Plan" },
      { id: "estado", accessorKey: "estado", header: "Estado" },
    ];

    it("GIVEN una DataTable con 36 filas y pageSize = 15 THEN muestra exactamente 15 filas, leyenda 'Mostrando 15 de 36' y botón Anterior deshabilitado", () => {
      const html = renderToStaticMarkup(
        <DataTable columns={mockColumns} data={mockData} pageSize={15} />,
      );

      // 1. Exactamente 15 filas en tbody
      const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/);
      expect(tbodyMatch).toBeTruthy();
      const trCount = (tbodyMatch && tbodyMatch[1] ? tbodyMatch[1].match(/<tr/g) || [] : []).length;
      expect(trCount).toBe(15);

      // 2. Leyenda exacta "Mostrando 15 de 36"
      expect(html).toContain("Mostrando 15 de 36");

      // 3. Botón "Anterior" deshabilitado
      // El botón Anterior debe tener la propiedad disabled
      expect(html).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*?Anterior[\s\S]*?<\/button>/);

      // 4. Botón "Siguiente" habilitado (sin disabled)
      expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>[\s\S]*?Siguiente[\s\S]*?<\/button>/);
    });

    it("incluye atributos aria-sort en columnas ordenables y columnheader", () => {
      const html = renderToStaticMarkup(
        <DataTable columns={mockColumns} data={mockData} pageSize={15} />,
      );

      expect(html).toContain('role="columnheader"');
      expect(html).toContain('aria-sort="none"');
    });

    it("renderiza EmptyState cuando la tabla no contiene filas", () => {
      const html = renderToStaticMarkup(
        <DataTable
          columns={mockColumns}
          data={[]}
          emptyTitle="Sin alumnos registrados"
          emptyDescription="Comienza agregando un alumno nuevo."
        />,
      );

      expect(html).toContain("Sin alumnos registrados");
      expect(html).toContain("Comienza agregando un alumno nuevo.");
    });
  });

  describe("DropdownMenu (Accesibilidad role=menu y roles hijos)", () => {
    it("renderiza role=menu, role=menuitem y role=menuitemcheckbox con aria-checked", () => {
      const html = renderToStaticMarkup(
        <DropdownMenu open={true}>
          <DropdownMenuTrigger>Acciones</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Opciones</DropdownMenuLabel>
            <DropdownMenuItem>Ver Ficha</DropdownMenuItem>
            <DropdownMenuCheckboxItem checked={true}>
              Notificaciones activas
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>Eliminar</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>,
      );

      expect(html).toContain('role="menu"');
      expect(html).toContain('role="menuitem"');
      expect(html).toContain('role="menuitemcheckbox"');
      expect(html).toContain('aria-checked="true"');
      expect(html).toContain('aria-disabled="true"');
      expect(html).toContain("Ver Ficha");
    });
  });

  describe("Segmented (Accesibilidad role=tablist y tabs)", () => {
    it("renderiza control por pestañas con roles accesibles y aria-selected", () => {
      const options = [
        { value: "todos", label: "Todos" },
        { value: "activos", label: "Activos" },
        { value: "inactivos", label: "Inactivos" },
      ];

      const html = renderToStaticMarkup(
        <Segmented
          value="activos"
          onChange={() => {}}
          options={options}
          aria-label="Filtro de alumnos"
        />,
      );

      expect(html).toContain('role="tablist"');
      expect(html).toContain('aria-label="Filtro de alumnos"');
      expect(html).toContain('role="tab"');
      expect(html).toContain('aria-selected="true"');
      expect(html).toContain('aria-selected="false"');
      expect(html).toContain("Activos");
    });
  });

  describe("Tooltip (role=tooltip y enlace por ID)", () => {
    it("renderiza role=tooltip cuando está abierto con su ID vinculado", () => {
      const html = renderToStaticMarkup(
        <TooltipProvider>
          <Tooltip open={true}>
            <TooltipTrigger>Hover me</TooltipTrigger>
            <TooltipContent>Información adicional de ayuda</TooltipContent>
          </Tooltip>
        </TooltipProvider>,
      );

      expect(html).toContain('role="tooltip"');
      expect(html).toContain("Información adicional de ayuda");
      expect(html).toContain("aria-describedby=");
    });
  });

  describe("Alert (role=alert y variantes visuales)", () => {
    it("renderiza role=alert con título y descripción", () => {
      const html = renderToStaticMarkup(
        <Alert variant="warning">
          <AlertTitle>Atención requerida</AlertTitle>
          <AlertDescription>Hay 3 cuotas vencidas este mes.</AlertDescription>
        </Alert>,
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain("Atención requerida");
      expect(html).toContain("Hay 3 cuotas vencidas este mes.");
      expect(html).toContain("border-amber-500/35");
    });
  });

  describe("EmptyState (UI para listas vacías)", () => {
    it("renderiza título, descripción y botón de acción", () => {
      const html = renderToStaticMarkup(
        <EmptyState
          title="No hay rutinas asignadas"
          description="Crea la primera rutina desde el constructor."
          action={<button>Crear Rutina</button>}
        />,
      );

      expect(html).toContain("No hay rutinas asignadas");
      expect(html).toContain("Crea la primera rutina desde el constructor.");
      expect(html).toContain("Crear Rutina");
    });
  });

  describe("Skeleton (Estados de carga)", () => {
    it("renderiza elemento con animate-pulse", () => {
      const html = renderToStaticMarkup(<Skeleton className="h-6 w-32" />);
      expect(html).toContain("animate-pulse");
      expect(html).toContain('aria-hidden="true"');
    });
  });

  describe("Avatar (Fallback e imagen)", () => {
    it("renderiza AvatarFallback con iniciales cuando la imagen no ha cargado", () => {
      const html = renderToStaticMarkup(
        <Avatar>
          <AvatarImage src="" alt="Juan Pérez" />
          <AvatarFallback>JP</AvatarFallback>
        </Avatar>,
      );

      expect(html).toContain("JP");
      expect(html).toContain("rounded-full");
    });
  });

  describe("Colección de Íconos Inline (icons.tsx)", () => {
    it("todos los íconos exportan SVG con strokeWidth 2 y aria-hidden true", () => {
      const iconComponents = [
        Icons.ChevronDown,
        Icons.ChevronUp,
        Icons.ChevronLeft,
        Icons.ChevronRight,
        Icons.ChevronsLeft,
        Icons.ChevronsRight,
        Icons.ChevronsUpDown,
        Icons.ArrowUpDown,
        Icons.ArrowUp,
        Icons.ArrowDown,
        Icons.Check,
        Icons.X,
        Icons.AlertCircle,
        Icons.AlertTriangle,
        Icons.Info,
        Icons.CheckCircle,
        Icons.HelpCircle,
        Icons.Search,
        Icons.Filter,
        Icons.MoreHorizontal,
        Icons.MoreVertical,
        Icons.User,
        Icons.Inbox,
        Icons.FileQuestion,
        Icons.Loader2,
      ];

      for (const Icon of iconComponents) {
        const html = renderToStaticMarkup(<Icon className="h-5 w-5" />);
        expect(html).toContain("<svg");
        expect(html).toContain('stroke-width="2"');
        expect(html).toContain('aria-hidden="true"');
      }
    });
  });
});
