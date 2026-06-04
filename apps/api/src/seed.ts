/**
 * Database Seed Script — 2 Cafe/Resto Tenants
 *
 * Tenant 1: Thamada Coffee Shop — Modern specialty coffee, Jakarta
 * Tenant 2: Warung Kopi Nusantara — Traditional Indonesian cafe, Bandung
 *
 * Usage: pnpm db:seed
 */

import 'dotenv/config';
import { db } from '@pos/infrastructure/database';
import {
  tenants, products, productCategories, productOptionGroups, productOptions,
  tenantFeatures, tenantModuleConfigs, tables, orders, orderItems,
  orderTypes, tenantOrderTypes, businessTypes, outlets,
} from '@shared/schema';
import type {
  InsertTenant, InsertProduct, InsertProductOptionGroup, InsertProductOption,
  InsertTenantFeature, InsertTenantModuleConfig, InsertTable, InsertOrderType,
  InsertTenantOrderType, InsertBusinessType, InsertOutlet,
} from '@shared/schema';
import { sql, eq } from 'drizzle-orm';
import { auth } from './lib/auth';

// ─── IMAGES ──────────────────────────────────────────────────────────────────
const IMG = {
  cappuccino: '/generated_images/Cappuccino_coffee_product_photo_d92cda67.png',
  icedLatte:  '/generated_images/Iced_caramel_latte_product_photo_1bc0e828.png',
  rice:       '/generated_images/Chicken_rice_bowl_product_photo_3ab2fbee.png',
  burger:     '/generated_images/Gourmet_beef_burger_product_photo_df61270b.png',
  lava:       '/generated_images/Chocolate_lava_cake_product_photo_cb07f0be.png',
  fries:      '/generated_images/French_fries_product_photo_dc986f4d.png',
  wings:      '/generated_images/Fried_chicken_wings_product_photo_fce05207.png',
};

// ─── CLEAR ────────────────────────────────────────────────────────────────────
async function clearDatabase() {
  console.log('🧹 Clearing existing data...');
  await db.execute(sql`
    TRUNCATE TABLE
      order_item_modifiers, order_payments, kitchen_tickets,
      order_items, orders, tenant_order_types, order_types,
      product_options, product_option_groups, products, product_categories,
      tenant_features, tenant_module_configs, "tables",
      outlet_product_configs, user_outlet_assignments, outlets,
      tenants, business_types
    CASCADE
  `);
  // Clear better-auth tables separately (they may not exist in initial migration)
  try {
    await db.execute(sql`TRUNCATE TABLE "user", "session", "account", "verification" CASCADE`);
  } catch {
    console.log('   ℹ️  Auth tables not found or already empty, skipping');
  }
  console.log('✅ Database cleared\n');
}

// ─── BUSINESS TYPES ───────────────────────────────────────────────────────────
async function seedBusinessTypes() {
  console.log('📊 Seeding business types...');
  const data: InsertBusinessType[] = [
    { code: 'CAFE_RESTAURANT',     name: 'Cafe & Restaurant',    description: 'Food and beverage service', isActive: true },
    { code: 'RETAIL_MINIMARKET',   name: 'Retail & Minimarket',  description: 'Retail store',              isActive: true },
    { code: 'LAUNDRY',             name: 'Laundry Service',      description: 'Laundry and cleaning',      isActive: true },
    { code: 'SERVICE_APPOINTMENT', name: 'Service Business',     description: 'General service',           isActive: true },
    { code: 'DIGITAL_PPOB',        name: 'Digital & PPOB',       description: 'Digital products',          isActive: true },
  ];
  await db.insert(businessTypes).values(data).onConflictDoNothing();
  console.log('✅ Business types seeded\n');
}

// ─── ORDER TYPES ──────────────────────────────────────────────────────────────
async function seedOrderTypes() {
  console.log('📋 Seeding order types...');
  const data: InsertOrderType[] = [
    { code: 'DINE_IN',    name: 'Dine In',    description: 'Makan di tempat',          isOnPremise: true,  needTableNumber: true,  needAddress: false, allowScheduled: false, isDigitalProduct: false, affectsServiceCharge: true,  isActive: true },
    { code: 'TAKE_AWAY',  name: 'Take Away',  description: 'Bawa pulang',              isOnPremise: true,  needTableNumber: false, needAddress: false, allowScheduled: false, isDigitalProduct: false, affectsServiceCharge: false, isActive: true },
    { code: 'DELIVERY',   name: 'Delivery',   description: 'Antar ke alamat',          isOnPremise: false, needTableNumber: false, needAddress: true,  allowScheduled: true,  isDigitalProduct: false, affectsServiceCharge: false, isActive: true },
    { code: 'WALK_IN',    name: 'Walk In',    description: 'Transaksi langsung di toko', isOnPremise: true, needTableNumber: false, needAddress: false, allowScheduled: false, isDigitalProduct: false, affectsServiceCharge: false, isActive: true },
  ];
  const created = await db.insert(orderTypes).values(data).onConflictDoNothing().returning();
  console.log(`✅ ${created.length} order types seeded\n`);
  return created;
}

// ─── OWNER ACCOUNTS ───────────────────────────────────────────────────────────
async function createOwnerAccount(opts: {
  name: string; email: string; username: string; password: string; tenantId: string;
}) {
  console.log(`   👤 Creating owner: ${opts.username} <${opts.email}>`);
  try {
    const res = await auth.api.signUpEmail({
      body: {
        name: opts.name,
        email: opts.email,
        username: opts.username,
        password: opts.password,
      },
    });
    // Link user to their tenant via direct DB update
    if (res?.user?.id) {
      await db.execute(sql`UPDATE "user" SET tenant_id = ${opts.tenantId} WHERE id = ${res.user.id}`);
      console.log(`   ✅ Account created & linked: ${opts.username} → tenant ${opts.tenantId}`);
    }
    return res;
  } catch (err: any) {
    console.log(`   ⚠️  Could not create account (${err?.message ?? err}) — skipping`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TENANT 1 — THAMADA COFFEE SHOP (Modern Specialty Coffee, Jakarta)
// ═══════════════════════════════════════════════════════════════════════════════

async function seedThamada(createdOrderTypes: any[]) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('☕  TENANT 1 — Thamada Coffee Shop (Jakarta)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Tenant dulu, baru owner account agar tenantId sudah tersedia
  const [tenant] = await db.insert(tenants).values({
    id: 'thamada',
    name: 'Thamada Coffee Shop',
    slug: 'thamada',
    businessType: 'CAFE_RESTAURANT',
    businessName: 'Thamada Coffee Shop',
    businessAddress: 'Jl. Sudirman No. 45, Jakarta Pusat 10220',
    businessPhone: '+62812-9988-7766',
    businessEmail: 'hello@thamadacoffee.id',
    planTier: 'growth',
    subscriptionStatus: 'active',
    timezone: 'Asia/Jakarta',
    currency: 'IDR',
    locale: 'id-ID',
    isActive: true,
  } as InsertTenant).returning();
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})\n`);

  // Default outlet
  const [thamadaOutlet] = await db.insert(outlets).values({
    tenantId: tenant.id,
    name: 'Cabang Utama',
    slug: 'main',
    address: 'Jl. Sudirman No. 45, Jakarta Pusat 10220',
    phone: '+62812-9988-7766',
    isDefault: true,
    isActive: true,
  } as InsertOutlet).returning();
  console.log(`✅ Default outlet: ${thamadaOutlet.name} (${thamadaOutlet.id})\n`);

  // Owner account — dibuat setelah tenant agar bisa langsung di-link
  console.log('👤 Owner account...');
  await createOwnerAccount({
    name: 'Ahmad Thamada',
    email: 'ahmad@thamadacoffee.id',
    username: 'thamada_owner',
    password: 'Thamada2024!',
    tenantId: tenant.id,
  });
  console.log('');

  // Order types
  const tenantOTs = createdOrderTypes.map(ot => ({ tenantId: tenant.id, orderTypeId: ot.id, isEnabled: true }));
  await db.insert(tenantOrderTypes).values(tenantOTs as InsertTenantOrderType[]);
  console.log(`✅ Order types enabled: Dine In, Take Away, Delivery\n`);

  // Module config
  await db.insert(tenantModuleConfigs).values({
    tenantId: tenant.id,
    enableTableManagement: true,
    enableKitchenTicket: true,
    enableLoyalty: false,
    enableDelivery: true,
    enableInventory: false,
    enableInventoryAdvanced: false,
    enableAppointments: false,
    enableMultiLocation: false,
  } as InsertTenantModuleConfig);

  // Features — seeded lengkap sesuai CAFE_RESTAURANT template
  // kitchen_ticket disinkronisasi dengan enableKitchenTicket: true di atas
  await db.insert(tenantFeatures).values([
    // Kitchen features (synced: enableKitchenTicket = true)
    { tenantId: tenant.id, featureCode: 'kitchen_ticket',      source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'kitchen_display',     source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'kitchen_printer',     source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'order_notifications', source: 'plan_default', isActive: true },
    // POS features
    { tenantId: tenant.id, featureCode: 'product_variants',    source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'partial_payment',     source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'discounts',           source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'order_queue',         source: 'plan_default', isActive: true },
    // Printing
    { tenantId: tenant.id, featureCode: 'receipt_printer',     source: 'plan_default', isActive: true },
    // Reporting
    { tenantId: tenant.id, featureCode: 'sales_reports',       source: 'plan_default', isActive: true },
  ] as InsertTenantFeature[]);
  console.log('✅ Modules & features configured (10 features)\n');

  // Tables
  console.log('🪑 Seeding tables...');
  const tableData: InsertTable[] = [
    ...['1','2','3','4','5','6','7','8'].map(n => ({
      tenantId: tenant.id, outletId: thamadaOutlet.id, tableNumber: n, tableName: `Meja ${n}`,
      floor: 'Ground Floor', capacity: n <= '4' ? 2 : 4, status: 'available' as const,
    })),
    { tenantId: tenant.id, outletId: thamadaOutlet.id, tableNumber: 'V1', tableName: 'VIP Booth 1', floor: '2nd Floor', capacity: 6, status: 'available' as const },
    { tenantId: tenant.id, outletId: thamadaOutlet.id, tableNumber: 'V2', tableName: 'VIP Booth 2', floor: '2nd Floor', capacity: 6, status: 'available' as const },
    { tenantId: tenant.id, outletId: thamadaOutlet.id, tableNumber: 'T1', tableName: 'Teras 1',     floor: 'Outdoor',   capacity: 4, status: 'available' as const },
    { tenantId: tenant.id, outletId: thamadaOutlet.id, tableNumber: 'T2', tableName: 'Teras 2',     floor: 'Outdoor',   capacity: 4, status: 'available' as const },
  ];
  await db.insert(tables).values(tableData);
  console.log(`✅ ${tableData.length} tables created\n`);

  // Products
  console.log('☕ Seeding menu Thamada Coffee Shop...');
  const allProducts: any[] = [];

  const addOpt = async (groupId: string, tenantId: string, opts: {name:string, delta:string, order:number}[]) => {
    await db.insert(productOptions).values(opts.map(o => ({
      tenantId, optionGroupId: groupId, name: o.name, priceDelta: o.delta, isAvailable: true, displayOrder: o.order,
    })) as InsertProductOption[]);
  };

  const addGroup = async (productId: string, tenantId: string, g: {
    name: string; type: 'single'|'multiple'; min: number; max: number; required: boolean; order: number;
  }) => {
    const [grp] = await db.insert(productOptionGroups).values({
      tenantId, productId, name: g.name, selectionType: g.type,
      minSelections: g.min, maxSelections: g.max, isRequired: g.required, displayOrder: g.order,
    } as InsertProductOptionGroup).returning();
    return grp.id;
  };

  const categoryIdByName = new Map<string, string>();
  const getCategoryId = async (name: string) => {
    if (categoryIdByName.has(name)) return categoryIdByName.get(name)!;
    const [created] = await db.insert(productCategories).values({ tenantId: tenant.id, name }).onConflictDoNothing().returning();
    if (created) {
      categoryIdByName.set(name, created.id);
      return created.id;
    }
    const [found] = await db.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.tenantId, tenant.id)).limit(1);
    if (!found) throw new Error('Failed finding category id');
    categoryIdByName.set(name, found.id);
    return found.id;
  };

  const addProduct = async (p: Omit<InsertProduct, 'tenantId'>) => {
    const categoryId = await getCategoryId((p as any).category);
    const [prod] = await db.insert(products).values({ ...p, tenantId: tenant.id, categoryId } as InsertProduct).returning();
    allProducts.push(prod);
    console.log(`   ✅ ${prod.name}`);
    return prod;
  };

  // ── Coffee ──
  console.log('\n📂 Coffee');
  const espresso = await addProduct({ name: 'Espresso', description: 'Single/double shot espresso dengan crema sempurna', basePrice: '22000', category: 'Coffee', imageUrl: IMG.cappuccino, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gEsp = await addGroup(espresso.id, tenant.id, { name: 'Shot', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gEsp, tenant.id, [{ name: 'Single Shot', delta: '0', order: 0 }, { name: 'Double Shot', delta: '10000', order: 1 }]);

  const americano = await addProduct({ name: 'Americano', description: 'Espresso diencerkan dengan air panas, rasa bersih', basePrice: '25000', category: 'Coffee', imageUrl: IMG.cappuccino, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gAmTemp = await addGroup(americano.id, tenant.id, { name: 'Suhu', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gAmTemp, tenant.id, [{ name: 'Hot', delta: '0', order: 0 }, { name: 'Iced', delta: '3000', order: 1 }]);

  const cappuccino = await addProduct({ name: 'Cappuccino', description: 'Espresso klasik dengan steamed milk dan milk foam yang creamy', basePrice: '32000', category: 'Coffee', imageUrl: IMG.cappuccino, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gCapTemp = await addGroup(cappuccino.id, tenant.id, { name: 'Suhu', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gCapTemp, tenant.id, [{ name: 'Hot', delta: '0', order: 0 }, { name: 'Iced', delta: '3000', order: 1 }]);
  const gCapSize = await addGroup(cappuccino.id, tenant.id, { name: 'Ukuran', type: 'single', min: 1, max: 1, required: true, order: 1 });
  await addOpt(gCapSize, tenant.id, [{ name: 'Regular (250ml)', delta: '0', order: 0 }, { name: 'Large (350ml)', delta: '8000', order: 1 }]);
  const gCapAdd = await addGroup(cappuccino.id, tenant.id, { name: 'Tambahan', type: 'multiple', min: 0, max: 3, required: false, order: 2 });
  await addOpt(gCapAdd, tenant.id, [{ name: 'Extra Shot', delta: '10000', order: 0 }, { name: 'Oat Milk', delta: '7000', order: 1 }, { name: 'Vanilla Syrup', delta: '5000', order: 2 }]);

  const latte = await addProduct({ name: 'Caffe Latte', description: 'Espresso dengan steamed milk lembut dan sedikit foam', basePrice: '35000', category: 'Coffee', imageUrl: IMG.icedLatte, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gLatTemp = await addGroup(latte.id, tenant.id, { name: 'Suhu', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gLatTemp, tenant.id, [{ name: 'Hot', delta: '0', order: 0 }, { name: 'Iced', delta: '3000', order: 1 }]);
  const gLatSize = await addGroup(latte.id, tenant.id, { name: 'Ukuran', type: 'single', min: 1, max: 1, required: true, order: 1 });
  await addOpt(gLatSize, tenant.id, [{ name: 'Regular (250ml)', delta: '0', order: 0 }, { name: 'Large (350ml)', delta: '8000', order: 1 }]);
  const gLatAdd = await addGroup(latte.id, tenant.id, { name: 'Tambahan', type: 'multiple', min: 0, max: 3, required: false, order: 2 });
  await addOpt(gLatAdd, tenant.id, [{ name: 'Extra Shot', delta: '10000', order: 0 }, { name: 'Caramel Drizzle', delta: '5000', order: 1 }, { name: 'Hazelnut Syrup', delta: '5000', order: 2 }]);

  const kopiSusu = await addProduct({ name: 'Kopi Susu Gula Aren', description: 'Espresso dingin dengan susu segar dan gula aren asli Kalimantan', basePrice: '28000', category: 'Coffee', imageUrl: IMG.icedLatte, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gKSSize = await addGroup(kopiSusu.id, tenant.id, { name: 'Ukuran', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gKSSize, tenant.id, [{ name: 'Regular (350ml)', delta: '0', order: 0 }, { name: 'Large (500ml)', delta: '8000', order: 1 }]);

  const coldBrew = await addProduct({ name: 'Cold Brew', description: 'Kopi diseduh dingin 18 jam, smooth dan rendah asam', basePrice: '38000', category: 'Coffee', imageUrl: IMG.cappuccino, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gCBVar = await addGroup(coldBrew.id, tenant.id, { name: 'Varian', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gCBVar, tenant.id, [{ name: 'Original', delta: '0', order: 0 }, { name: 'Milk Cold Brew', delta: '8000', order: 1 }, { name: 'Vanilla Cold Brew', delta: '10000', order: 2 }]);

  // ── Non-Coffee ──
  console.log('\n📂 Non-Coffee');
  const matchaLatte = await addProduct({ name: 'Matcha Latte', description: 'Matcha ceremonial grade Jepang dengan steamed milk, earthy dan creamy', basePrice: '35000', category: 'Non-Coffee', imageUrl: null, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gMLTemp = await addGroup(matchaLatte.id, tenant.id, { name: 'Suhu', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gMLTemp, tenant.id, [{ name: 'Hot', delta: '0', order: 0 }, { name: 'Iced', delta: '3000', order: 1 }]);
  const gMLSize = await addGroup(matchaLatte.id, tenant.id, { name: 'Ukuran', type: 'single', min: 1, max: 1, required: true, order: 1 });
  await addOpt(gMLSize, tenant.id, [{ name: 'Regular (250ml)', delta: '0', order: 0 }, { name: 'Large (350ml)', delta: '8000', order: 1 }]);
  const gMLSugar = await addGroup(matchaLatte.id, tenant.id, { name: 'Tingkat Gula', type: 'single', min: 1, max: 1, required: true, order: 2 });
  await addOpt(gMLSugar, tenant.id, [{ name: 'Tanpa Gula', delta: '0', order: 0 }, { name: 'Less Sweet', delta: '0', order: 1 }, { name: 'Normal', delta: '0', order: 2 }]);

  const darkChoc = await addProduct({ name: 'Dark Chocolate', description: 'Minuman cokelat premium dark cocoa 70%, kaya rasa', basePrice: '32000', category: 'Non-Coffee', imageUrl: null, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gDCTemp = await addGroup(darkChoc.id, tenant.id, { name: 'Suhu', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gDCTemp, tenant.id, [{ name: 'Hot', delta: '0', order: 0 }, { name: 'Iced', delta: '3000', order: 1 }]);

  const taroMT = await addProduct({ name: 'Taro Milk Tea', description: 'Teh susu dengan bubuk taro ungu asli, creamy dan manis alami', basePrice: '30000', category: 'Non-Coffee', imageUrl: null, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gTMTSugar = await addGroup(taroMT.id, tenant.id, { name: 'Tingkat Gula', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gTMTSugar, tenant.id, [{ name: 'Less Sweet', delta: '0', order: 0 }, { name: 'Normal', delta: '0', order: 1 }, { name: 'Extra Sweet', delta: '0', order: 2 }]);

  const lemonSquash = await addProduct({ name: 'Lemon Squash', description: 'Perasan lemon segar dengan soda dan madu, menyegarkan', basePrice: '25000', category: 'Non-Coffee', imageUrl: null, hasVariants: false, stockTrackingEnabled: false, isActive: true });

  // ── Main Course ──
  console.log('\n📂 Main Course');
  const nasiGoreng = await addProduct({ name: 'Nasi Goreng Spesial', description: 'Nasi goreng bumbu rahasia dengan ayam suwir, telur mata sapi, dan kerupuk', basePrice: '38000', category: 'Main Course', imageUrl: IMG.rice, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gNGSpicy = await addGroup(nasiGoreng.id, tenant.id, { name: 'Level Pedas', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gNGSpicy, tenant.id, [{ name: 'Tidak Pedas', delta: '0', order: 0 }, { name: 'Sedang', delta: '0', order: 1 }, { name: 'Pedas Banget', delta: '0', order: 2 }]);
  const gNGAdd = await addGroup(nasiGoreng.id, tenant.id, { name: 'Tambahan Topping', type: 'multiple', min: 0, max: 3, required: false, order: 1 });
  await addOpt(gNGAdd, tenant.id, [{ name: 'Ekstra Telur', delta: '5000', order: 0 }, { name: 'Ekstra Ayam', delta: '10000', order: 1 }, { name: 'Tambah Keju', delta: '8000', order: 2 }]);

  const chickenSandwich = await addProduct({ name: 'Chicken Sandwich', description: 'Ayam crispy juicy dengan selada, tomat, mayo di roti brioche', basePrice: '45000', category: 'Main Course', imageUrl: IMG.burger, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gCSSide = await addGroup(chickenSandwich.id, tenant.id, { name: 'Side Dish', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gCSSide, tenant.id, [{ name: 'Tanpa Side', delta: '0', order: 0 }, { name: '+ Kentang Goreng', delta: '12000', order: 1 }, { name: '+ Garden Salad', delta: '10000', order: 2 }]);

  const avocadoToast = await addProduct({ name: 'Avocado Toast', description: 'Roti sourdough panggang dengan alpukat tumbuk berbumbu dan red pepper flake', basePrice: '42000', category: 'Main Course', imageUrl: null, hasVariants: false, stockTrackingEnabled: true, stockQty: 18, isActive: true });

  // ── Snack ──
  console.log('\n📂 Snack');
  const croissant = await addProduct({ name: 'Croissant', description: 'Croissant butter Prancis, renyah di luar lembut di dalam, fresh setiap pagi', basePrice: '25000', category: 'Snack', imageUrl: null, hasVariants: true, stockTrackingEnabled: true, stockQty: 20, isActive: true });
  const gCrFilling = await addGroup(croissant.id, tenant.id, { name: 'Isian', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gCrFilling, tenant.id, [{ name: 'Plain', delta: '0', order: 0 }, { name: 'Keju', delta: '5000', order: 1 }, { name: 'Cokelat', delta: '5000', order: 2 }, { name: 'Ham & Keju', delta: '12000', order: 3 }]);

  const waffle = await addProduct({ name: 'Waffle', description: 'Waffle renyah dengan topping pilihan, sempurna menemani kopi', basePrice: '35000', category: 'Snack', imageUrl: IMG.lava, hasVariants: true, stockTrackingEnabled: true, stockQty: 15, isActive: true });
  const gWafTop = await addGroup(waffle.id, tenant.id, { name: 'Topping', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gWafTop, tenant.id, [{ name: 'Maple Syrup & Butter', delta: '0', order: 0 }, { name: 'Strawberry & Cream', delta: '8000', order: 1 }, { name: 'Nutella & Banana', delta: '10000', order: 2 }]);

  const lavaCake = await addProduct({ name: 'Chocolate Lava Cake', description: 'Kue cokelat hangat dengan lava cokelat lumer di dalam, disajikan dengan ice cream', basePrice: '42000', category: 'Snack', imageUrl: IMG.lava, hasVariants: false, stockTrackingEnabled: true, stockQty: 12, isActive: true });

  const kentangGoreng = await addProduct({ name: 'Kentang Goreng', description: 'Kentang goreng renyah dengan bumbu pilihan dan saus pendamping', basePrice: '22000', category: 'Snack', imageUrl: IMG.fries, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gKGSize = await addGroup(kentangGoreng.id, tenant.id, { name: 'Ukuran', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gKGSize, tenant.id, [{ name: 'Regular', delta: '0', order: 0 }, { name: 'Large', delta: '8000', order: 1 }]);
  const gKGFlavor = await addGroup(kentangGoreng.id, tenant.id, { name: 'Bumbu', type: 'single', min: 1, max: 1, required: true, order: 1 });
  await addOpt(gKGFlavor, tenant.id, [{ name: 'Original', delta: '0', order: 0 }, { name: 'Barbeque', delta: '0', order: 1 }, { name: 'Keju', delta: '3000', order: 2 }, { name: 'Pedas', delta: '0', order: 3 }]);

  console.log(`\n✅ ${allProducts.length} menu items seeded for Thamada Coffee Shop\n`);

  // Demo orders
  console.log('📦 Seeding demo orders...');
  const dineInOT = createdOrderTypes.find(ot => ot.code === 'DINE_IN');
  if (dineInOT) {
    const TAX = 0.11; const SVC = 0.05;
    const demoOrders = [
      { table: '1', customer: 'Budi Santoso',     status: 'confirmed' as const, items: [{ p: cappuccino, qty: 2 }, { p: croissant, qty: 1 }] },
      { table: '2', customer: 'Sari Dewi',         status: 'preparing' as const, items: [{ p: nasiGoreng, qty: 1 }, { p: kopiSusu, qty: 1 }] },
      { table: '3', customer: 'Reza Pratama',      status: 'preparing' as const, items: [{ p: chickenSandwich, qty: 2 }, { p: coldBrew, qty: 2 }] },
      { table: 'V1', customer: 'Indah Permatasari', status: 'ready'    as const, items: [{ p: matchaLatte, qty: 2 }, { p: lavaCake, qty: 1 }] },
    ];
    for (let i = 0; i < demoOrders.length; i++) {
      const o = demoOrders[i];
      const sub = o.items.reduce((s, it) => s + parseFloat(it.p.basePrice) * it.qty, 0);
      const tax = Math.round(sub * TAX); const svc = Math.round(sub * SVC);
      const [order] = await db.insert(orders).values({
        tenantId: tenant.id, orderTypeId: dineInOT.id,
        orderNumber: `#TH${String(i + 1).padStart(4, '0')}`,
        status: o.status, paymentStatus: 'unpaid',
        tableNumber: o.table, customerName: o.customer,
        subtotal: sub.toString(), taxAmount: tax.toString(),
        serviceCharge: svc.toString(), total: (sub + tax + svc).toString(), notes: null,
      }).returning();
      for (const it of o.items) {
        await db.insert(orderItems).values({
          orderId: order.id, productId: it.p.id, productName: it.p.name,
          unitPrice: it.p.basePrice, quantity: it.qty,
          itemSubtotal: (parseFloat(it.p.basePrice) * it.qty).toString(),
        });
      }
      // Mark table occupied
      await db.update(tables).set({ status: 'occupied' }).where(eq(tables.tableNumber, o.table));
      console.log(`   ✅ ${order.orderNumber} — Meja ${o.table} — ${o.customer} [${o.status}]`);
    }
  }

  console.log(`\n✅ Thamada Coffee Shop fully seeded!\n`);
  return tenant.id;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TENANT 2 — WARUNG KOPI NUSANTARA (Traditional Indonesian Cafe, Bandung)
// ═══════════════════════════════════════════════════════════════════════════════

async function seedNusantara(createdOrderTypes: any[]) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏮  TENANT 2 — Warung Kopi Nusantara (Bandung)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Tenant dulu, baru owner account
  const [tenant] = await db.insert(tenants).values({
    id: 'kopinusantara',
    name: 'Warung Kopi Nusantara',
    slug: 'kopinusantara',
    businessType: 'CAFE_RESTAURANT',
    businessName: 'Warung Kopi Nusantara',
    businessAddress: 'Jl. Braga No. 12, Bandung Kota 40111',
    businessPhone: '+62822-1234-5678',
    businessEmail: 'salam@kopinusantara.id',
    planTier: 'growth',
    subscriptionStatus: 'active',
    timezone: 'Asia/Jakarta',
    currency: 'IDR',
    locale: 'id-ID',
    isActive: true,
  } as InsertTenant).returning();
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})\n`);

  // Default outlet
  const [nusantaraOutlet] = await db.insert(outlets).values({
    tenantId: tenant.id,
    name: 'Cabang Utama',
    slug: 'main',
    address: 'Jl. Braga No. 12, Bandung Kota 40111',
    phone: '+62822-1234-5678',
    isDefault: true,
    isActive: true,
  } as InsertOutlet).returning();
  console.log(`✅ Default outlet: ${nusantaraOutlet.name} (${nusantaraOutlet.id})\n`);

  // Owner account — dibuat setelah tenant agar bisa langsung di-link
  console.log('👤 Owner account...');
  await createOwnerAccount({
    name: 'Dewi Rahayu',
    email: 'dewi@kopinusantara.id',
    username: 'nusantara_owner',
    password: 'Nusantara2024!',
    tenantId: tenant.id,
  });
  console.log('');

  // Only Dine In + Take Away (no delivery — traditional warung)
  const allowedCodes = ['DINE_IN', 'TAKE_AWAY'];
  const tenantOTs = createdOrderTypes
    .filter(ot => allowedCodes.includes(ot.code))
    .map(ot => ({ tenantId: tenant.id, orderTypeId: ot.id, isEnabled: true }));
  await db.insert(tenantOrderTypes).values(tenantOTs as InsertTenantOrderType[]);
  console.log(`✅ Order types enabled: Dine In, Take Away (no delivery)\n`);

  // Module config — simple setup, no kitchen display, no delivery
  await db.insert(tenantModuleConfigs).values({
    tenantId: tenant.id,
    enableTableManagement: true,
    enableKitchenTicket: false,
    enableLoyalty: false,
    enableDelivery: false,
    enableInventory: false,
    enableInventoryAdvanced: false,
    enableAppointments: false,
    enableMultiLocation: false,
  } as InsertTenantModuleConfig);

  // Features — seeded lengkap (CAFE_RESTAURANT tanpa kitchen karena enableKitchenTicket: false)
  // Tidak ada kitchen_ticket/kitchen_display/kitchen_printer karena module kitchen OFF
  await db.insert(tenantFeatures).values([
    // POS features
    { tenantId: tenant.id, featureCode: 'product_variants',    source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'partial_payment',     source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'discounts',           source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'order_queue',         source: 'plan_default', isActive: true },
    // Printing
    { tenantId: tenant.id, featureCode: 'receipt_printer',     source: 'plan_default', isActive: true },
    // Reporting
    { tenantId: tenant.id, featureCode: 'sales_reports',       source: 'plan_default', isActive: true },
  ] as InsertTenantFeature[]);
  console.log('✅ Modules & features configured (6 features, no kitchen)\n');

  // Tables — lesehan/warung style, fewer tables
  console.log('🪑 Seeding tables...');
  const tableData: InsertTable[] = [
    { tenantId: tenant.id, outletId: nusantaraOutlet.id, tableNumber: 'A', tableName: 'Meja A — Pojok Bambu', floor: 'Indoor', capacity: 4, status: 'available' as const },
    { tenantId: tenant.id, outletId: nusantaraOutlet.id, tableNumber: 'B', tableName: 'Meja B — Tengah',      floor: 'Indoor', capacity: 4, status: 'available' as const },
    { tenantId: tenant.id, outletId: nusantaraOutlet.id, tableNumber: 'C', tableName: 'Meja C — Dekat Kasir', floor: 'Indoor', capacity: 2, status: 'available' as const },
    { tenantId: tenant.id, outletId: nusantaraOutlet.id, tableNumber: 'D', tableName: 'Meja D — Lesehan',     floor: 'Indoor', capacity: 6, status: 'available' as const },
    { tenantId: tenant.id, outletId: nusantaraOutlet.id, tableNumber: 'L1', tableName: 'Lesehan 1',           floor: 'Outdoor', capacity: 8, status: 'available' as const },
    { tenantId: tenant.id, outletId: nusantaraOutlet.id, tableNumber: 'L2', tableName: 'Lesehan 2',           floor: 'Outdoor', capacity: 8, status: 'available' as const },
  ];
  await db.insert(tables).values(tableData);
  console.log(`✅ ${tableData.length} tables created\n`);

  // Products
  console.log('🏮 Seeding menu Warung Kopi Nusantara...');
  const allProducts: any[] = [];

  const addOpt = async (groupId: string, tenantId: string, opts: {name:string, delta:string, order:number}[]) => {
    await db.insert(productOptions).values(opts.map(o => ({
      tenantId, optionGroupId: groupId, name: o.name, priceDelta: o.delta, isAvailable: true, displayOrder: o.order,
    })) as InsertProductOption[]);
  };

  const addGroup = async (productId: string, tenantId: string, g: {
    name: string; type: 'single'|'multiple'; min: number; max: number; required: boolean; order: number;
  }) => {
    const [grp] = await db.insert(productOptionGroups).values({
      tenantId, productId, name: g.name, selectionType: g.type,
      minSelections: g.min, maxSelections: g.max, isRequired: g.required, displayOrder: g.order,
    } as InsertProductOptionGroup).returning();
    return grp.id;
  };

  const categoryIdByName = new Map<string, string>();
  const getCategoryId = async (name: string) => {
    if (categoryIdByName.has(name)) return categoryIdByName.get(name)!;
    const [created] = await db.insert(productCategories).values({ tenantId: tenant.id, name }).onConflictDoNothing().returning();
    if (created) {
      categoryIdByName.set(name, created.id);
      return created.id;
    }
    const [found] = await db.select({ id: productCategories.id }).from(productCategories).where(eq(productCategories.tenantId, tenant.id)).limit(1);
    if (!found) throw new Error('Failed finding category id');
    categoryIdByName.set(name, found.id);
    return found.id;
  };

  const addProduct = async (p: Omit<InsertProduct, 'tenantId'>) => {
    const categoryId = await getCategoryId((p as any).category);
    const [prod] = await db.insert(products).values({ ...p, tenantId: tenant.id, categoryId } as InsertProduct).returning();
    allProducts.push(prod);
    console.log(`   ✅ ${prod.name}`);
    return prod;
  };

  // ── Kopi Tradisional ──
  console.log('\n📂 Kopi Tradisional');
  const kopiTubruk = await addProduct({ name: 'Kopi Tubruk', description: 'Kopi robusta Jawa diseduh langsung, ampas kopi tidak disaring — cara tradisional asli Indonesia', basePrice: '12000', category: 'Kopi Tradisional', imageUrl: IMG.cappuccino, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gKTManis = await addGroup(kopiTubruk.id, tenant.id, { name: 'Tingkat Manis', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gKTManis, tenant.id, [{ name: 'Pahit (Tanpa Gula)', delta: '0', order: 0 }, { name: 'Kurang Manis', delta: '0', order: 1 }, { name: 'Manis Normal', delta: '0', order: 2 }, { name: 'Ekstra Manis', delta: '0', order: 3 }]);

  const kopiSusuJawa = await addProduct({ name: 'Kopi Susu Jawa', description: 'Kopi tubruk robusta dengan susu kental manis, khas warung kopi tradisional Jawa', basePrice: '15000', category: 'Kopi Tradisional', imageUrl: IMG.cappuccino, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gKSJSuhu = await addGroup(kopiSusuJawa.id, tenant.id, { name: 'Penyajian', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gKSJSuhu, tenant.id, [{ name: 'Panas', delta: '0', order: 0 }, { name: 'Es (Iced)', delta: '2000', order: 1 }]);

  const kopiAceh = await addProduct({ name: 'Kopi Aceh Gayo', description: 'Kopi arabika single origin dari dataran tinggi Gayo, Aceh — fruity, wine-like, aroma bunga', basePrice: '22000', category: 'Kopi Tradisional', imageUrl: IMG.cappuccino, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gKABrewl = await addGroup(kopiAceh.id, tenant.id, { name: 'Metode Seduh', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gKABrewl, tenant.id, [{ name: 'Tubruk', delta: '0', order: 0 }, { name: 'V60 Pour Over', delta: '5000', order: 1 }, { name: 'French Press', delta: '5000', order: 2 }]);

  const kopiToraja = await addProduct({ name: 'Kopi Toraja', description: 'Arabika single origin Toraja, Sulawesi — nutty, earthy, dark chocolate notes, body tebal', basePrice: '20000', category: 'Kopi Tradisional', imageUrl: IMG.cappuccino, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gKTorBrewl = await addGroup(kopiToraja.id, tenant.id, { name: 'Metode Seduh', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gKTorBrewl, tenant.id, [{ name: 'Tubruk', delta: '0', order: 0 }, { name: 'V60 Pour Over', delta: '5000', order: 1 }, { name: 'Moka Pot', delta: '3000', order: 2 }]);

  const kopiFlores = await addProduct({ name: 'Kopi Flores Bajawa', description: 'Arabika Flores, NTT — notes cokelat susu, caramel, dan rempah-rempah yang khas', basePrice: '18000', category: 'Kopi Tradisional', imageUrl: IMG.cappuccino, hasVariants: false, stockTrackingEnabled: false, isActive: true });

  const espressoNusantara = await addProduct({ name: 'Espresso Nusantara', description: 'Blend khusus arabika Gayo + robusta Lampung, balance antara keasaman dan body penuh', basePrice: '18000', category: 'Kopi Tradisional', imageUrl: IMG.cappuccino, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gENShot = await addGroup(espressoNusantara.id, tenant.id, { name: 'Shot', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gENShot, tenant.id, [{ name: 'Single', delta: '0', order: 0 }, { name: 'Double', delta: '8000', order: 1 }]);

  // ── Minuman Tradisional ──
  console.log('\n📂 Minuman Tradisional');
  const tehTarik = await addProduct({ name: 'Teh Tarik Kampung', description: 'Teh hitam kuat dengan susu kental manis, ditarik berkali-kali hingga berbusa — sajian khas Melayu', basePrice: '12000', category: 'Minuman Tradisional', imageUrl: null, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gTTSuhu = await addGroup(tehTarik.id, tenant.id, { name: 'Penyajian', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gTTSuhu, tenant.id, [{ name: 'Panas', delta: '0', order: 0 }, { name: 'Es (Iced)', delta: '2000', order: 1 }]);

  const wedangJahe = await addProduct({ name: 'Wedang Jahe', description: 'Rempah jahe segar direbus dengan gula aren dan serai, menghangatkan dan menyehatkan', basePrice: '13000', category: 'Minuman Tradisional', imageUrl: null, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gWJVar = await addGroup(wedangJahe.id, tenant.id, { name: 'Varian', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gWJVar, tenant.id, [{ name: 'Original', delta: '0', order: 0 }, { name: '+ Susu', delta: '3000', order: 1 }, { name: '+ Sereh & Kayu Manis', delta: '2000', order: 2 }]);

  const bajigur = await addProduct({ name: 'Bajigur', description: 'Minuman hangat khas Sunda dari gula aren, santan, jahe, dan rempah — cocok di malam hari', basePrice: '15000', category: 'Minuman Tradisional', imageUrl: null, hasVariants: false, stockTrackingEnabled: false, isActive: true });

  const bandrek = await addProduct({ name: 'Bandrek Bandung', description: 'Minuman herbal Sunda — campuran jahe, serai, cengkeh, kayu manis, dan pandan — original dari Bandung', basePrice: '14000', category: 'Minuman Tradisional', imageUrl: null, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gBandrekVar = await addGroup(bandrek.id, tenant.id, { name: 'Varian', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gBandrekVar, tenant.id, [{ name: 'Original', delta: '0', order: 0 }, { name: 'Bandrek Susu', delta: '4000', order: 1 }, { name: 'Bandrek Telur', delta: '6000', order: 2 }]);

  const cendolDawet = await addProduct({ name: 'Es Cendol Dawet', description: 'Es cendol hijau segar dengan santan, gula aren, dan ketan hitam — jajanan legendaris Nusantara', basePrice: '16000', category: 'Minuman Tradisional', imageUrl: null, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gCDAdd = await addGroup(cendolDawet.id, tenant.id, { name: 'Tambahan', type: 'multiple', min: 0, max: 2, required: false, order: 0 });
  await addOpt(gCDAdd, tenant.id, [{ name: 'Ketan Hitam', delta: '3000', order: 0 }, { name: 'Nangka', delta: '3000', order: 1 }, { name: 'Durian', delta: '8000', order: 2 }]);

  // ── Makanan Berat ──
  console.log('\n📂 Makanan Berat');
  const nasiKuning = await addProduct({ name: 'Nasi Kuning Komplit', description: 'Nasi kuning harum kunyit dengan ayam goreng, telur balado, tempe orek, sambal, dan lalapan segar', basePrice: '28000', category: 'Makanan Berat', imageUrl: IMG.rice, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gNKAdd = await addGroup(nasiKuning.id, tenant.id, { name: 'Tambahan Lauk', type: 'multiple', min: 0, max: 3, required: false, order: 0 });
  await addOpt(gNKAdd, tenant.id, [{ name: 'Ekstra Ayam Goreng', delta: '12000', order: 0 }, { name: 'Ekstra Tempe', delta: '5000', order: 1 }, { name: 'Ekstra Tahu', delta: '4000', order: 2 }, { name: 'Ekstra Telur', delta: '6000', order: 3 }]);
  const gNKSambal = await addGroup(nasiKuning.id, tenant.id, { name: 'Tingkat Pedas', type: 'single', min: 1, max: 1, required: true, order: 1 });
  await addOpt(gNKSambal, tenant.id, [{ name: 'Tidak Pedas', delta: '0', order: 0 }, { name: 'Pedas Sedang', delta: '0', order: 1 }, { name: 'Pedas Extra', delta: '0', order: 2 }]);

  const miGorengJawa = await addProduct({ name: 'Mie Goreng Jawa', description: 'Mie goreng bumbu kacang khas Jawa dengan ayam suwir, sayur, telur, dan kerupuk', basePrice: '25000', category: 'Makanan Berat', imageUrl: null, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gMGJSpicy = await addGroup(miGorengJawa.id, tenant.id, { name: 'Tingkat Pedas', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gMGJSpicy, tenant.id, [{ name: 'Tidak Pedas', delta: '0', order: 0 }, { name: 'Sedang', delta: '0', order: 1 }, { name: 'Pedas', delta: '0', order: 2 }]);
  const gMGJAdd = await addGroup(miGorengJawa.id, tenant.id, { name: 'Tambahan', type: 'multiple', min: 0, max: 2, required: false, order: 1 });
  await addOpt(gMGJAdd, tenant.id, [{ name: 'Ekstra Telur', delta: '5000', order: 0 }, { name: 'Ekstra Ayam', delta: '10000', order: 1 }]);

  const nasiUduk = await addProduct({ name: 'Nasi Uduk Betawi', description: 'Nasi uduk santan harum dengan ayam goreng, bihun goreng, tempe orek, dan emping', basePrice: '30000', category: 'Makanan Berat', imageUrl: IMG.rice, hasVariants: false, stockTrackingEnabled: false, isActive: true });

  const siomay = await addProduct({ name: 'Siomay Bandung', description: 'Siomay ikan tenggiri khas Bandung dengan tahu, kentang, telur, dan bumbu kacang special', basePrice: '22000', category: 'Makanan Berat', imageUrl: null, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gSiomaySize = await addGroup(siomay.id, tenant.id, { name: 'Porsi', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gSiomaySize, tenant.id, [{ name: 'Reguler (5 pcs)', delta: '0', order: 0 }, { name: 'Besar (10 pcs)', delta: '18000', order: 1 }]);
  const gSiomayAdd = await addGroup(siomay.id, tenant.id, { name: 'Tambahan', type: 'multiple', min: 0, max: 2, required: false, order: 1 });
  await addOpt(gSiomayAdd, tenant.id, [{ name: 'Ekstra Bumbu Kacang', delta: '2000', order: 0 }, { name: 'Ekstra Pedas', delta: '0', order: 1 }]);

  // ── Jajan Pasar ──
  console.log('\n📂 Jajan Pasar');
  const ongolOngol = await addProduct({ name: 'Ongol-Ongol Gula Aren', description: 'Kue basah tradisional dari tepung sagu dan gula aren, ditaburi kelapa parut segar', basePrice: '10000', category: 'Jajan Pasar', imageUrl: null, hasVariants: false, stockTrackingEnabled: true, stockQty: 30, isActive: true });
  const getukSingkong = await addProduct({ name: 'Getuk Singkong', description: 'Getuk singkong rebus dengan gula aren dan parutan kelapa, khas jajanan Jawa Tengah', basePrice: '10000', category: 'Jajan Pasar', imageUrl: null, hasVariants: false, stockTrackingEnabled: true, stockQty: 25, isActive: true });
  const klepon = await addProduct({ name: 'Klepon', description: 'Bola-bola ketan hijau berisi gula aren cair, dibalut kelapa parut — meledak di mulut!', basePrice: '12000', category: 'Jajan Pasar', imageUrl: null, hasVariants: true, stockTrackingEnabled: true, stockQty: 40, isActive: true });
  const gKleponPcs = await addGroup(klepon.id, tenant.id, { name: 'Porsi', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gKleponPcs, tenant.id, [{ name: '5 pcs', delta: '0', order: 0 }, { name: '10 pcs', delta: '10000', order: 1 }]);

  const pisangGoreng = await addProduct({ name: 'Pisang Goreng Crispy', description: 'Pisang kepok goreng dengan tepung crispy, disajikan panas dengan taburan gula atau keju', basePrice: '14000', category: 'Jajan Pasar', imageUrl: null, hasVariants: true, stockTrackingEnabled: false, isActive: true });
  const gPGTopping = await addGroup(pisangGoreng.id, tenant.id, { name: 'Topping', type: 'single', min: 1, max: 1, required: true, order: 0 });
  await addOpt(gPGTopping, tenant.id, [{ name: 'Gula Halus', delta: '0', order: 0 }, { name: 'Keju Parut', delta: '3000', order: 1 }, { name: 'Cokelat', delta: '3000', order: 2 }]);

  console.log(`\n✅ ${allProducts.length} menu items seeded for Warung Kopi Nusantara\n`);

  // Demo orders
  console.log('📦 Seeding demo orders...');
  const dineInOT = createdOrderTypes.find(ot => ot.code === 'DINE_IN');
  if (dineInOT) {
    const TAX = 0.11; const SVC = 0.05;
    const demoOrders = [
      { table: 'A',  customer: 'Pak Hasan',   status: 'confirmed' as const, items: [{ p: kopiTubruk, qty: 2 }, { p: pisangGoreng, qty: 1 }] },
      { table: 'B',  customer: 'Bu Wati',      status: 'preparing' as const, items: [{ p: nasiKuning, qty: 2 }, { p: tehTarik, qty: 2 }] },
      { table: 'L1', customer: 'Grup Sunda',   status: 'confirmed' as const, items: [{ p: kopiAceh, qty: 3 }, { p: siomay, qty: 2 }, { p: wedangJahe, qty: 2 }] },
    ];
    for (let i = 0; i < demoOrders.length; i++) {
      const o = demoOrders[i];
      const sub = o.items.reduce((s, it) => s + parseFloat(it.p.basePrice) * it.qty, 0);
      const tax = Math.round(sub * TAX); const svc = Math.round(sub * SVC);
      const [order] = await db.insert(orders).values({
        tenantId: tenant.id, orderTypeId: dineInOT.id,
        orderNumber: `#NU${String(i + 1).padStart(4, '0')}`,
        status: o.status, paymentStatus: 'unpaid',
        tableNumber: o.table, customerName: o.customer,
        subtotal: sub.toString(), taxAmount: tax.toString(),
        serviceCharge: svc.toString(), total: (sub + tax + svc).toString(), notes: null,
      }).returning();
      for (const it of o.items) {
        await db.insert(orderItems).values({
          orderId: order.id, productId: it.p.id, productName: it.p.name,
          unitPrice: it.p.basePrice, quantity: it.qty,
          itemSubtotal: (parseFloat(it.p.basePrice) * it.qty).toString(),
        });
      }
      await db.update(tables).set({ status: 'occupied' }).where(eq(tables.tableNumber, o.table));
      console.log(`   ✅ ${order.orderNumber} — Meja ${o.table} — ${o.customer} [${o.status}]`);
    }
  }

  console.log(`\n✅ Warung Kopi Nusantara fully seeded!\n`);
  return tenant.id;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TENANT 3 — WARUNG BAHAGIA (Free Starter - no modules, free features only)
// ═══════════════════════════════════════════════════════════════════════════════

async function seedFreeStarter(createdOrderTypes: any[]) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏪  TENANT 3 — Warung Bahagia (Free Starter)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const [tenant] = await db.insert(tenants).values({
    id: 'warung-bahagia',
    name: 'Warung Bahagia',
    slug: 'warung-bahagia',
    businessType: 'CAFE_RESTAURANT',
    businessName: 'Warung Bahagia',
    businessAddress: 'Jl. Kebahagiaan No. 1, Depok',
    businessPhone: '+62811-1111-2222',
    businessEmail: 'owner@warungbahagia.id',
    planTier: 'free',
    subscriptionStatus: 'active',
    timezone: 'Asia/Jakarta',
    currency: 'IDR',
    locale: 'id-ID',
    isActive: true,
  } as InsertTenant).returning();
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})\n`);

  const [outlet] = await db.insert(outlets).values({
    tenantId: tenant.id,
    name: 'Warung Utama',
    slug: 'main',
    address: 'Jl. Kebahagiaan No. 1, Depok',
    phone: '+62811-1111-2222',
    isDefault: true,
    isActive: true,
  } as InsertOutlet).returning();

  await createOwnerAccount({
    name: 'Budi Santoso',
    email: 'budi@warungbahagia.id',
    username: 'warung_owner',
    password: 'Warung2024!',
    tenantId: tenant.id,
  });

  // Only DINE_IN & TAKE_AWAY for free plan
  const dinein  = createdOrderTypes.find(o => o.code === 'DINE_IN');
  const takeaway = createdOrderTypes.find(o => o.code === 'TAKE_AWAY');
  if (dinein)   await db.insert(tenantOrderTypes).values({ tenantId: tenant.id, orderTypeId: dinein.id,   isEnabled: true } as InsertTenantOrderType);
  if (takeaway) await db.insert(tenantOrderTypes).values({ tenantId: tenant.id, orderTypeId: takeaway.id, isEnabled: true } as InsertTenantOrderType);

  // No modules enabled on free plan
  await db.insert(tenantModuleConfigs).values({
    tenantId: tenant.id,
    enableTableManagement: false,
    enableKitchenTicket: false,
    enableLoyalty: false,
    enableDelivery: false,
    enableInventory: false,
    enableInventoryAdvanced: false,
    enableAppointments: false,
    enableMultiLocation: false,
  } as InsertTenantModuleConfig);

  // Only free-plan features
  await db.insert(tenantFeatures).values([
    { tenantId: tenant.id, featureCode: 'product_variants', source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'partial_payment',  source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'discounts',        source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'order_queue',      source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'receipt_printer',  source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'sales_reports',    source: 'plan_default', isActive: true },
  ] as InsertTenantFeature[]);
  console.log('✅ Free plan features only (6 features, 0 modules)\n');

  // Simple products — NO variants (variants feature disabled by default for testing)
  const [catMakanan] = await db.insert(productCategories).values({
    tenantId: tenant.id, name: 'Makanan', displayOrder: 1, isActive: true,
  }).returning();
  const [catMinuman] = await db.insert(productCategories).values({
    tenantId: tenant.id, name: 'Minuman', displayOrder: 2, isActive: true,
  }).returning();

  const menuItems = [
    { categoryId: catMakanan.id, name: 'Nasi Goreng', price: '15000', desc: 'Nasi goreng spesial bumbu rumahan' },
    { categoryId: catMakanan.id, name: 'Mie Goreng',  price: '13000', desc: 'Mie goreng dengan telur' },
    { categoryId: catMakanan.id, name: 'Nasi Uduk',   price: '12000', desc: 'Nasi uduk + lauk pilihan' },
    { categoryId: catMakanan.id, name: 'Gado-Gado',   price: '14000', desc: 'Gado-gado segar bumbu kacang' },
    { categoryId: catMinuman.id, name: 'Es Teh Manis', price: '5000',  desc: 'Teh manis dingin segar' },
    { categoryId: catMinuman.id, name: 'Es Jeruk',     price: '7000',  desc: 'Jeruk peras segar' },
    { categoryId: catMinuman.id, name: 'Kopi Tubruk',  price: '8000',  desc: 'Kopi hitam tradisional' },
    { categoryId: catMinuman.id, name: 'Air Mineral',  price: '3000',  desc: 'Aqua 600ml' },
  ];

  for (const item of menuItems) {
    await db.insert(products).values({
      tenantId: tenant.id,
      categoryId: item.categoryId,
      outletId: outlet.id,
      name: item.name,
      description: item.desc,
      basePrice: item.price,
      isAvailable: true,
      hasVariants: false,
      trackStock: false,
      displayOrder: 0,
    } as any);
  }
  console.log(`✅ ${menuItems.length} menu items seeded (no variants)\n`);
  console.log('✅ Warung Bahagia (Free Starter) fully seeded!\n');
  return tenant.id;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function seed() {
  console.log('\n🌱 AuraPOS — Database Seed (3 Tenants)\n');

  try {
    await clearDatabase();
    await seedBusinessTypes();
    const createdOrderTypes = await seedOrderTypes();

    const thamadaId      = await seedThamada(createdOrderTypes);
    const nusantaraId    = await seedNusantara(createdOrderTypes);
    const freeStarterId  = await seedFreeStarter(createdOrderTypes);

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🎉  Seed completed successfully!\n');
    console.log('📋  Summary:');
    console.log('   Tenant 1: Thamada Coffee Shop  (slug: thamada)  → Premium plan');
    console.log(`     ID: ${thamadaId}`);
    console.log('     Login: thamada_owner / Thamada2024!');
    console.log('     Modules: Table Management ✓ · Kitchen Display ✓ · Delivery ✓\n');
    console.log('   Tenant 2: Warung Kopi Nusantara  (slug: kopi-nusantara)  → Growth plan');
    console.log(`     ID: ${nusantaraId}`);
    console.log('     Login: nusantara_owner / Nusantara2024!');
    console.log('     Modules: Table Management ✓  (no Kitchen, no Delivery)\n');
    console.log('   Tenant 3: Warung Bahagia  (slug: warung-bahagia)  → FREE plan');
    console.log(`     ID: ${freeStarterId}`);
    console.log('     Login: warung_owner / Warung2024!');
    console.log('     Modules: NONE  |  Features: 6 free features only');
    console.log('     Use this tenant to test free-tier feature restrictions\n');
    console.log('═══════════════════════════════════════════════════════════════\n');
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }

  process.exit(0);
}

seed();
