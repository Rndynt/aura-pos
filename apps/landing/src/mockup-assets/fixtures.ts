export const mockupProducts = [
  { id: "p1", name: "Americano", category: "Kopi", price: 22000, emoji: "☕", available: true },
  { id: "p2", name: "Cappuccino", category: "Kopi", price: 26000, emoji: "☕", available: true },
  { id: "p3", name: "Es Kopi Susu", category: "Kopi", price: 24000, emoji: "🧋", available: true },
  { id: "p4", name: "Matcha Latte", category: "Non-Kopi", price: 28000, emoji: "🍵", available: true },
  { id: "p5", name: "Nasi Goreng", category: "Makanan", price: 32000, emoji: "🍳", available: true },
  { id: "p6", name: "Mie Goreng", category: "Makanan", price: 28000, emoji: "🍜", available: true },
  { id: "p7", name: "Chicken Burger", category: "Makanan", price: 35000, emoji: "🍔", available: true },
  { id: "p8", name: "French Fries", category: "Snack", price: 20000, emoji: "🍟", available: true },
  { id: "p9", name: "Brownies", category: "Snack", price: 22000, emoji: "🍫", available: true },
  { id: "p10", name: "Jus Alpukat", category: "Non-Kopi", price: 26000, emoji: "🥑", available: false },
  { id: "p11", name: "Mineral Water", category: "Minuman", price: 8000, emoji: "💧", available: true },
  { id: "p12", name: "Croissant", category: "Snack", price: 18000, emoji: "🥐", available: true },
];

export const mockupCartItems = [
  { product: mockupProducts[0], qty: 1 },
  { product: mockupProducts[4], qty: 1 },
  { product: mockupProducts[2], qty: 2 },
  { product: mockupProducts[7], qty: 1 },
];

export const TAX_RATE = 0.11;

export const mockupSubtotal = mockupCartItems.reduce((s, i) => s + i.product.price * i.qty, 0);
export const mockupTax = Math.round(mockupSubtotal * TAX_RATE);
export const mockupTotal = mockupSubtotal + mockupTax;

export const mockupCategories = ["Semua", "Kopi", "Non-Kopi", "Makanan", "Snack", "Minuman"];

export const mockupOrders = [
  { id: "ORD-0001", number: "ORD-20260624-0001", type: "DINE_IN", table: "Meja 01", status: "confirmed", payStatus: "unpaid", items: 3, total: 74000, time: "19:10", customer: null },
  { id: "ORD-0002", number: "ORD-20260624-0002", type: "TAKE_AWAY", table: null, status: "preparing", payStatus: "unpaid", items: 2, total: 52000, time: "19:18", customer: "Budi" },
  { id: "ORD-0003", number: "ORD-20260624-0003", type: "DINE_IN", table: "Meja 03", status: "preparing", payStatus: "partial", items: 5, total: 134200, time: "19:05", customer: null },
  { id: "ORD-0004", number: "ORD-20260624-0004", type: "DELIVERY", table: null, status: "ready", payStatus: "paid", items: 4, total: 88000, time: "18:55", customer: "Siti Rahayu" },
  { id: "ORD-0005", number: "ORD-20260624-0005", type: "DINE_IN", table: "Meja 05", status: "draft", payStatus: "unpaid", items: 1, total: 22000, time: "19:24", customer: null },
  { id: "ORD-0006", number: "ORD-20260624-0006", type: "TAKE_AWAY", table: null, status: "confirmed", payStatus: "paid", items: 3, total: 66000, time: "19:20", customer: "Agus" },
];

export const mockupTables = [
  { number: "01", status: "occupied", order: "ORD-0001", seats: 4, items: 3, total: 74000 },
  { number: "02", status: "available", order: null, seats: 2, items: 0, total: 0 },
  { number: "03", status: "occupied", order: "ORD-0003", seats: 6, items: 5, total: 134200 },
  { number: "04", status: "available", order: null, seats: 4, items: 0, total: 0 },
  { number: "05", status: "occupied", order: "ORD-0005", seats: 2, items: 1, total: 22000 },
  { number: "06", status: "available", order: null, seats: 4, items: 0, total: 0 },
  { number: "07", status: "reserved", order: null, seats: 8, items: 0, total: 0 },
  { number: "08", status: "available", order: null, seats: 2, items: 0, total: 0 },
  { number: "09", status: "occupied", order: "ORD-X", seats: 4, items: 2, total: 48000 },
  { number: "10", status: "available", order: null, seats: 6, items: 0, total: 0 },
];

export const mockupInventory = [
  { name: "Biji Kopi Arabica", category: "Bahan Baku", stock: 12, unit: "kg", min: 5, status: "normal" },
  { name: "Susu Fresh Milk", category: "Bahan Baku", stock: 8, unit: "liter", min: 10, status: "low" },
  { name: "Gula Aren", category: "Bahan Baku", stock: 5, unit: "botol", min: 8, status: "low" },
  { name: "Cup 16oz", category: "Packaging", stock: 240, unit: "pcs", min: 100, status: "normal" },
  { name: "Tepung Ayam Crispy", category: "Bahan Baku", stock: 3, unit: "kg", min: 5, status: "critical" },
  { name: "Sedotan Bambu", category: "Packaging", stock: 500, unit: "pcs", min: 200, status: "normal" },
  { name: "Kertas Kemasan Burger", category: "Packaging", stock: 80, unit: "lembar", min: 100, status: "low" },
  { name: "Sirup Vanilla", category: "Bahan Baku", stock: 6, unit: "botol", min: 4, status: "normal" },
];

export const mockupReports = {
  salesTotal: 5742000,
  transactions: 128,
  avgTransaction: 44859,
  itemsSold: 339,
  cashPayment: 2350000,
  nonCashPayment: 3392000,
  topProducts: [
    { name: "Es Kopi Susu", qty: 87, revenue: 2088000 },
    { name: "Nasi Goreng", qty: 64, revenue: 2048000 },
    { name: "Americano", qty: 52, revenue: 1144000 },
    { name: "Cappuccino", qty: 48, revenue: 1248000 },
    { name: "French Fries", qty: 44, revenue: 880000 },
  ],
  hourlyData: [
    { hour: "08", sales: 180000 },
    { hour: "09", sales: 420000 },
    { hour: "10", sales: 680000 },
    { hour: "11", sales: 920000 },
    { hour: "12", sales: 1240000 },
    { hour: "13", sales: 980000 },
    { hour: "14", sales: 620000 },
    { hour: "15", sales: 480000 },
    { hour: "16", sales: 540000 },
    { hour: "17", sales: 680000 },
    { hour: "18", sales: 920000 },
    { hour: "19", sales: 1040000 },
    { hour: "20", sales: 760000 },
    { hour: "21", sales: 420000 },
  ],
};

export function formatRp(n: number) {
  return "Rp " + n.toLocaleString("id-ID");
}
