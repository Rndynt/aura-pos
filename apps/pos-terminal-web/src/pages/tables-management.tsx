import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useTables, useOpenOrders } from "@/lib/api/tableHooks";
import { useCart } from "@/hooks/useCart";
import { getActiveTenantId } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { 
  Search, 
  X, 
  Clock, 
  Edit2, 
  Users, 
  CheckCircle, 
  AlertTriangle, 
  ShoppingBag,
  UtensilsCrossed,
  Banknote,
  LayoutGrid,
  Square,
  CreditCard,
  Settings
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { UnifiedBottomNav } from "@/components/navigation/UnifiedBottomNav";
import type { Table } from "@shared/schema";

const getStatusColor = (status: string) => {
  switch (status) {
    case "available":
      return "bg-blue-600 text-white shadow-blue-200";
    case "occupied":
      return "bg-slate-200 text-slate-600";
    case "reserved":
      return "bg-orange-100 text-orange-600 border-orange-200 border";
    case "maintenance":
      return "bg-red-600 text-white shadow-red-200";
    default:
      return "bg-slate-100 text-slate-400";
  }
};

const getTableCardBg = (status: string) => {
  switch (status) {
    case "available":
      return "bg-white border-slate-200 hover:border-blue-300";
    case "occupied":
      return "bg-slate-100 border-slate-200";
    case "maintenance":
      return "bg-red-50 border-red-100";
    case "reserved":
      return "bg-orange-50 border-orange-100";
    default:
      return "bg-white border-slate-200";
  }
};

export default function TablesManagementPage() {
  const [, setLocation] = useLocation();
  const cart = useCart();
  const { toast } = useToast();
  const { data: tablesData, isLoading } = useTables();
  const { data: ordersData } = useOpenOrders();
  const [searchTable, setSearchTable] = useState("");
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "available" | "occupied" | "reserved">("all");

  const tables = tablesData?.tables || [];
  const orders = ordersData?.orders || [];

  // Calculate actual status based on active orders
  const getActualTableStatus = (table: Table): string => {
    if (table.status === "maintenance") return "maintenance";
    if (table.status === "reserved") return "reserved";
    
    // Check if table has active orders
    const hasActiveOrders = orders.some(
      (order) =>
        order.tableNumber === table.tableNumber &&
        order.status !== "completed" &&
        order.status !== "cancelled"
    );
    
    return hasActiveOrders ? "occupied" : "available";
  };

  const availableCount = tables.filter((t) => getActualTableStatus(t) === "available").length;
  const occupiedCount = tables.filter((t) => getActualTableStatus(t) === "occupied").length;

  const handleContinueOrder = async (order: any) => {
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        headers: {
          "x-tenant-id": getActiveTenantId(),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch order details");
      
      const json = await response.json();
      const fullOrder = json.data;
      
      toast({
        title: "Order loaded",
        description: `Order #${order.orderNumber} loaded into cart.`,
      });
      // Pass orderId directly without calling loadOrder here - let POS page handle it
      setLocation(`/pos?continueOrderId=${fullOrder.id}`);
    } catch (error) {
      console.error("Error loading order:", error);
      toast({
        title: "Error loading order",
        description: "Failed to load order into cart",
        variant: "destructive",
      });
    }
  };

  const filteredTables = useMemo(() => {
    return tables.filter((table) => {
      const actualStatus = getActualTableStatus(table);
      const matchesStatus = filterStatus === "all" || actualStatus === filterStatus;
      const matchesSearch =
        table.tableNumber.toLowerCase().includes(searchTable.toLowerCase()) ||
        (table.tableName?.toLowerCase().includes(searchTable.toLowerCase()) ?? false);
      return matchesStatus && matchesSearch;
    });
  }, [tables, searchTable, filterStatus, orders]);

  const tableOrders = useMemo(() => {
    if (!selectedTable) return [];
    return orders.filter(
      (order) =>
        order.tableNumber === selectedTable.tableNumber &&
        order.status !== "completed" &&
        order.status !== "cancelled"
    );
  }, [selectedTable, orders]);

  const formatPrice = (price: string | number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(parseFloat(String(price)));
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-center text-slate-500">Loading tables...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden bg-slate-50 relative">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative pb-[60px] md:pb-0">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 p-4 md:p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-800" data-testid="heading-tables">
                Tables
              </h1>
              <p className="text-slate-500 text-sm">
                Manage restaurant tables layout
              </p>
            </div>
            <div className="flex gap-2 text-xs font-bold">
              <div className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg">
                {availableCount} Avail
              </div>
              <div className="bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg">
                {occupiedCount} Occu
              </div>
            </div>
          </div>
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            {/* Search Input */}
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search tables..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                value={searchTable}
                onChange={(e) => setSearchTable(e.target.value)}
                data-testid="input-search-tables"
              />
            </div>
            {/* Filter Tabs */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
              {(["all", "available", "occupied", "reserved"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all whitespace-nowrap ${
                    filterStatus === status
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                  data-testid={`filter-${status}`}
                >
                  {status}{" "}
                  {status !== "all" &&
                    `(${tables.filter((t) => getActualTableStatus(t) === status).length})`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table Grid */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredTables.map((table) => {
              const actualStatus = getActualTableStatus(table);
              const hasActiveOrders = orders.some(
                (order) =>
                  order.tableNumber === table.tableNumber &&
                  order.status !== "completed" &&
                  order.status !== "cancelled"
              );
              return (
                <button
                  key={table.id}
                  onClick={() => setSelectedTable(table)}
                  className={`relative aspect-video md:aspect-[4/3] rounded-2xl p-4 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 group border border-transparent ${
                    selectedTable?.id === table.id
                      ? "ring-4 ring-blue-500/20 border-blue-500 z-10"
                      : ""
                  } ${getTableCardBg(actualStatus)}`}
                  data-testid={`table-select-${table.tableNumber}`}
                >
                  <div
                    className={`absolute top-3 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide ${getStatusColor(
                      actualStatus
                    )}`}
                  >
                    {actualStatus}
                  </div>
                  <span className="text-3xl font-black text-slate-800 mt-4">
                    {table.tableNumber}
                  </span>
                  <div className="flex items-center gap-1 text-slate-500 text-xs font-medium">
                    <Users size={14} />
                    <span>{table.capacity}</span>
                  </div>
                  {hasActiveOrders && (
                    <div className="absolute bottom-3 flex items-center gap-1 bg-white px-2 py-1 rounded-full shadow-sm border border-slate-100">
                      <Clock size={12} className="text-orange-500" />
                      <span className="text-[10px] font-bold text-slate-600">
                        Active
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Overlay for mobile */}
      {selectedTable && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-[55] md:hidden"
          onClick={() => setSelectedTable(null)}
        />
      )}

      {/* Detail Panel */}
      <div
        className={`fixed md:relative inset-x-0 bottom-0 md:inset-auto md:w-[400px] md:h-full z-[60] bg-white border-l border-slate-200 shadow-2xl md:shadow-none flex flex-col transition-transform duration-300 ease-out ${
          selectedTable
            ? "translate-y-0"
            : "translate-y-full md:translate-x-full md:translate-y-0 md:w-0 md:border-none"
        } rounded-t-3xl md:rounded-none h-[85vh] md:h-auto`}
      >
        {selectedTable ? (
          <>
            {/* Panel Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-slate-800 mb-1">
                  Table Details
                </h2>
                <div className="flex items-center gap-3 text-sm text-slate-500">
                  <span className="font-bold text-slate-800 text-lg">
                    {selectedTable.tableName || `Table ${selectedTable.tableNumber}`}
                  </span>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Users size={14} /> {selectedTable.capacity} people
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedTable(null)}
                className="p-2 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-500"
                data-testid="button-close-details"
              >
                <X size={20} />
              </button>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
              {/* Status Section */}
              <div className="mb-6">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">
                  Status
                </h3>
                <div
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold capitalize ${getStatusColor(
                    getActualTableStatus(selectedTable)
                  )}`}
                >
                  {getActualTableStatus(selectedTable) === "maintenance" ? (
                    <AlertTriangle size={16} />
                  ) : (
                    <CheckCircle size={16} />
                  )}
                  {getActualTableStatus(selectedTable)}
                </div>
              </div>

              {/* Active Orders Section */}
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                <ShoppingBag size={16} /> Active Orders ({tableOrders.length})
              </h3>
              {tableOrders.length === 0 ? (
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center flex flex-col items-center gap-2 text-slate-400">
                  <UtensilsCrossed size={32} className="opacity-50" />
                  <p className="text-sm">No active orders</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tableOrders.map((order) => (
                    <div
                      key={order.id}
                      className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded w-fit mb-1">
                            #{order.orderNumber}
                          </div>
                          <div className="font-bold text-slate-700 text-sm">
                            {order.customerName || "Walk-in Guest"}
                          </div>
                        </div>
                        <div className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded">
                          {order.paymentStatus === "paid" ? "PAID" : "UNPAID"}
                        </div>
                      </div>
                      <div className="space-y-2 mb-3">
                        {order.orderItems && order.orderItems.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            className="text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100"
                          >
                            <div className="font-medium">
                              {item.productName || item.product_name} x{item.quantity}
                            </div>
                            {(item.variant_name || item.variantName) && (
                              <div className="text-slate-500 ml-1 mt-0.5">
                                • {item.variant_name || item.variantName}
                              </div>
                            )}
                            {(item.selected_options || item.selectedOptions) && (item.selected_options || item.selectedOptions).length > 0 && (
                              <div className="text-slate-500 ml-1 mt-0.5">
                                {(item.selected_options || item.selectedOptions).map((opt: any, optIdx: number) => (
                                  <div key={optIdx}>
                                    • {opt.option_name || opt.optionName}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                        <span className="text-sm font-bold text-slate-600">
                          Total
                        </span>
                        <span className="text-lg font-black text-slate-800">
                          {formatPrice(order.total)}
                        </span>
                      </div>
                      {order.paymentStatus !== "paid" && (
                        <button
                          onClick={() => handleContinueOrder(order)}
                          className="mt-3 w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
                          data-testid={`button-continue-order-${order.id}`}
                        >
                          <Edit2 size={14} /> Continue Order
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Panel Footer - Action Buttons */}
            <div className="p-6 border-t border-slate-200 bg-white">
              {getActualTableStatus(selectedTable) === "available" ? (
                <button
                  onClick={() => {
                    setLocation(`/pos?table=${selectedTable.tableNumber}`);
                  }}
                  className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-900"
                  data-testid="button-new-order"
                >
                  Check In / New Order
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (tableOrders.length > 0) {
                      handleContinueOrder(tableOrders[0]);
                    }
                  }}
                  className="w-full bg-green-50 text-green-700 border border-green-200 py-3 rounded-xl font-bold hover:bg-green-100 flex items-center justify-center gap-2"
                  data-testid="button-checkout-table"
                >
                  <Banknote size={18} /> Checkout & Payment
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400">
            Select a table
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      <UnifiedBottomNav cartCount={cart.items.length} />
    </div>
  );
}
