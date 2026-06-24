import { Router, Request, Response } from "express";
import { z } from "zod";
import type { AppContainer } from "../../composition/createAppContainer";
import type { InsertTable } from "@pos/infrastructure/db/schema";
import { requireEntitlement } from "../middleware/entitlementGuard";

const VALID_TABLE_STATUSES = ["available", "occupied", "reserved", "maintenance", "cleaning"] as const;

const listTablesQuerySchema = z.object({
  status: z.enum(VALID_TABLE_STATUSES).optional(),
  floor: z.string().min(1).optional(),
});

const createTableBodySchema = z.object({
  tableNumber: z.string().min(1),
  tableName: z.string().min(1).optional(),
  floor: z.string().min(1).optional(),
  capacity: z
    .union([z.number().int().positive(), z.string().min(1)])
    .optional()
    .transform((value) => {
      if (typeof value === "number") return value;
      if (typeof value === "string") {
        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : Number.NaN;
      }
      return undefined;
    })
    .refine((value) => value === undefined || Number.isFinite(value), {
      message: "Capacity must be a positive integer",
    }),
});

const updateTableStatusBodySchema = z.object({
  status: z.enum(VALID_TABLE_STATUSES),
  currentOrderId: z.string().min(1).optional(),
});

export interface TablesRouterDependencies {
  listTables: AppContainer["listTables"];
  updateTableStatus: AppContainer["updateTableStatus"];
  tableCommands: AppContainer["tableCommands"];
  seatingOrderQueries: AppContainer["seatingOrderQueries"];
}

export function createTablesRouter(dependencies: TablesRouterDependencies): Router {
  const router = Router();
  const { listTables, updateTableStatus, tableCommands, seatingOrderQueries } = dependencies;

  router.use(requireEntitlement('restaurant_table_service'));

  router.get("/", async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const parsedQuery = listTablesQuerySchema.safeParse(req.query);
      if (!parsedQuery.success) {
        return res.status(400).json({
          success: false,
          error: { message: `Invalid query parameters: ${parsedQuery.error.message}` },
        });
      }

      const result = await listTables.execute({
        tenantId,
        status: parsedQuery.data.status,
        floor: parsedQuery.data.floor,
        outletId: req.outletId,
      });

      res.json({ success: true, data: { tables: result.tables, total: result.total } });
    } catch (error) {
      console.error("Error listing tables:", error);
      res.status(500).json({ success: false, error: { message: "Failed to list tables" } });
    }
  });

  router.post("/", async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const parsedBody = createTableBodySchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          success: false,
          error: { message: `Invalid request body: ${parsedBody.error.message}` },
        });
      }

      const { tableNumber, tableName, floor, capacity } = parsedBody.data;

      const newTable = await tableCommands.create({
        tenantId,
        tableNumber,
        tableName,
        floor,
        capacity,
        status: "available",
        outletId: req.outletId,
      } as InsertTable);

      res.status(201).json({ success: true, data: newTable });
    } catch (error) {
      console.error("Error creating table:", error);
      res.status(500).json({ success: false, error: { message: "Failed to create table" } });
    }
  });

  router.patch("/:id/status", async (req: Request, res: Response) => {
    try {
      const tenantId = req.tenantId!;
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, error: { message: "Table id is required" } });
      }

      const parsedBody = updateTableStatusBodySchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          success: false,
          error: { message: `Invalid request body: ${parsedBody.error.message}` },
        });
      }

      const { status, currentOrderId } = parsedBody.data;

      const existingTable = await tableCommands.findById(id, tenantId);
      if (!existingTable || (req.outletId && existingTable.outletId !== req.outletId)) {
        return res.status(404).json({
          success: false,
          error: { message: 'Table not found for this outlet' },
        });
      }

      if (currentOrderId) {
        const order = await seatingOrderQueries.findById(currentOrderId, tenantId);
        if (!order || (req.outletId && order.outletId !== req.outletId)) {
          return res.status(400).json({
            success: false,
            error: { message: "Current order does not belong to this tenant and outlet" },
          });
        }
      }

      const updated = await updateTableStatus.execute({
        tenantId,
        tableId: id,
        status,
        currentOrderId,
        outletId: req.outletId,
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      console.error("Error updating table status:", error);
      res.status(500).json({ success: false, error: { message: "Failed to update table" } });
    }
  });

  return router;
}
