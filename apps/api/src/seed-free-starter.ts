import 'dotenv/config';
import { db } from '@pos/infrastructure/database';
import { tenants, outlets, tenantModuleConfigs, tenantFeatures, tenantOrderTypes, orderTypes, productCategories, products } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';

async function run() {
  console.log('\n🌱 Adding Warung Bahagia (Free Starter tenant)...\n');

  try {
    await db.delete(tenants).where(eq(tenants.id, 'warung-bahagia'));
  } catch { /* ignore */ }

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
  } as any).returning();
  console.log('✅ Tenant:', tenant.name, '(' + tenant.id + ')');

  const [outlet] = await db.insert(outlets).values({
    tenantId: tenant.id,
    name: 'Warung Utama',
    slug: 'main',
    address: 'Jl. Kebahagiaan No. 1, Depok',
    phone: '+62811-1111-2222',
    isDefault: true,
    isActive: true,
  } as any).returning();
  console.log('✅ Outlet:', outlet.name);

  await db.insert(tenantModuleConfigs).values({
    tenantId: tenant.id,
    enableTableManagement: false,
    enableKitchenTicket: false,
    enableLoyalty: false,
    enableDelivery: false,
    enableInventory: false,
    enableAppointments: false,
    enableMultiLocation: false,
  } as any);
  console.log('✅ Module config: semua OFF');

  await db.insert(tenantFeatures).values([
    { tenantId: tenant.id, featureCode: 'product_variants', source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'partial_payment',  source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'discounts',        source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'order_queue',      source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'receipt_printer',  source: 'plan_default', isActive: true },
    { tenantId: tenant.id, featureCode: 'sales_reports',    source: 'plan_default', isActive: true },
  ] as any);
  console.log('✅ 6 free features (no kitchen, no analytics, no inventory)');

  const ots = await db.select().from(orderTypes).where(
    inArray(orderTypes.code, ['DINE_IN', 'TAKE_AWAY'])
  );
  for (const ot of ots) {
    await db.insert(tenantOrderTypes).values({
      tenantId: tenant.id, orderTypeId: ot.id, isEnabled: true,
    } as any);
  }
  console.log('✅ Order types: DINE_IN, TAKE_AWAY');

  const [catMakan] = await db.insert(productCategories).values({
    tenantId: tenant.id, name: 'Makanan', displayOrder: 1, isActive: true,
  }).returning();
  const [catMinum] = await db.insert(productCategories).values({
    tenantId: tenant.id, name: 'Minuman', displayOrder: 2, isActive: true,
  }).returning();

  const menu = [
    { cat: catMakan.id, catName: 'Makanan', name: 'Nasi Goreng',  price: '15000' },
    { cat: catMakan.id, catName: 'Makanan', name: 'Mie Goreng',   price: '13000' },
    { cat: catMakan.id, catName: 'Makanan', name: 'Nasi Uduk',    price: '12000' },
    { cat: catMakan.id, catName: 'Makanan', name: 'Gado-Gado',    price: '14000' },
    { cat: catMinum.id, catName: 'Minuman', name: 'Es Teh Manis', price: '5000'  },
    { cat: catMinum.id, catName: 'Minuman', name: 'Es Jeruk',     price: '7000'  },
    { cat: catMinum.id, catName: 'Minuman', name: 'Kopi Tubruk',  price: '8000'  },
    { cat: catMinum.id, catName: 'Minuman', name: 'Air Mineral',  price: '3000'  },
  ];
  for (const item of menu) {
    await db.insert(products).values({
      tenantId: tenant.id,
      categoryId: item.cat,
      category: item.catName,
      outletId: outlet.id,
      name: item.name,
      basePrice: item.price,
      isAvailable: true,
      hasVariants: false,
      trackStock: false,
      displayOrder: 0,
    } as any);
  }
  console.log('✅ 8 menu items (tanpa varian)');

  console.log('\n🎉 Warung Bahagia siap!');
  console.log('   Tenant ID / x-tenant-id: warung-bahagia');
  console.log('   Plan: FREE — 0 modul aktif, 6 fitur dasar');
  console.log('   Untuk test: nonaktifkan fitur di Marketplace, lihat efeknya\n');
  process.exit(0);
}

run().catch((err) => { console.error('❌ Failed:', err); process.exit(1); });
