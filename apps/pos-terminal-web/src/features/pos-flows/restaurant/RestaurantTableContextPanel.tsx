import type { Table } from "@pos/domain/seating";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RestaurantTableContextPanel({
  tables,
  selectedTableNumber,
  onSelectTable,
  manualTableNumber,
  onManualTableNumberChange,
  isLoading,
  error,
}: {
  tables: Table[];
  selectedTableNumber: string;
  onSelectTable: (tableNumber: string) => void;
  manualTableNumber: string;
  onManualTableNumberChange: (value: string) => void;
  isLoading?: boolean;
  error?: unknown;
}) {
  return (
    <Card className="m-3" data-testid="restaurant-table-context-panel">
      <CardHeader className="pb-2"><CardTitle className="text-base">Konteks Meja / Dining</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-muted-foreground">Memuat meja...</p> : null}
        {error ? <p className="text-sm text-destructive">API meja tidak tersedia. Isi nomor meja manual jika operasional mengizinkan.</p> : null}
        {tables.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {tables.map((table) => (
              <Button key={table.id ?? table.tableNumber} type="button" variant={selectedTableNumber === table.tableNumber ? "default" : "outline"} size="sm" onClick={() => onSelectTable(table.tableNumber)}>
                {table.tableName || `Meja ${table.tableNumber}`}
              </Button>
            ))}
          </div>
        ) : null}
        <Input placeholder="Nomor meja / catatan dining" value={manualTableNumber} onChange={(event) => onManualTableNumberChange(event.target.value)} />
      </CardContent>
    </Card>
  );
}
