/**
 * Database Seed Script
 * Populates initial data for products, features, and tenant features
 * 
 * Usage: npm run db:seed
 */

import 'dotenv/config';
import { db } from '@pos/infrastructure/database';
import { 
  tenants, 
  products, 
  productOptionGroups, 
  productOptions,
  tenantFeatures,
  tenantModuleConfigs,
  tables,
  orders,
  orderItems,
  orderItemModifiers,
  orderPayments,
  kitchenTickets,
  users,
  orderTypes,
  tenantOrderTypes,
  businessTypes,
} from '@shared/schema';
import type { 
  InsertTenant, 
  InsertProduct, 
  InsertProductOptionGroup, 
  InsertProductOption,
  InsertTenantFeature,
  InsertTenantModuleConfig,
  InsertTable,
  InsertOrderType,
  InsertTenantOrderType,
  InsertBusinessType,
} from '@shared/schema';
import { sql, eq } from 'drizzle-orm';

// Product images paths
const PRODUCT_IMAGES = {
  burger: '/generated_images/Gourmet_beef_burger_product_photo_df61270b.png',
  rice: '/generated_images/Chicken_rice_bowl_product_photo_3ab2fbee.png',
  cappuccino: '/generated_images/Cappuccino_coffee_product_photo_d92cda67.png',
  lava: '/generated_images/Chocolate_lava_cake_product_photo_cb07f0be.png',
  pizza: '/generated_images/Supreme_pizza_product_photo_78bbaf57.png',
  fries: '/generated_images/French_fries_product_photo_dc986f4d.png',
  icedLatte: '/generated_images/Iced_caramel_latte_product_photo_1bc0e828.png',
  wings: '/generated_images/Fried_chicken_wings_product_photo_fce05207.png',
};

// Feature codes to seed
const FEATURE_CODES = [
  'product_variants',
  'partial_payment',
  'kitchen_ticket',
  'stock_tracking',
  'order_history',
];

// Features to enable for demo tenant
const DEMO_TENANT_FEATURES = [
  'product_variants',
  'partial_payment',
  'kitchen_ticket',
];

/**
 * Clear all data from the database in the correct order (respecting FK constraints)
 */
async function clearDatabase() {
  console.log('🧹 Clearing existing data...');
  
  try {
    // Works with both local PostgreSQL and Neon cloud via Drizzle ORM
    await db.execute(sql`TRUNCATE TABLE order_item_modifiers, order_payments, kitchen_tickets, order_items, orders, tenant_order_types, order_types, product_options, product_option_groups, products, tenant_features, tenants, users, business_types CASCADE`);
    
    console.log('✅ Database cleared successfully');
  } catch (error) {
    console.error('❌ Error clearing database:', error);
    throw error;
  }
}

/**
 * Seed business types (master data)
 */
async function seedBusinessTypes() {
  console.log('📊 Seeding business types...');
  
  const businessTypeData: InsertBusinessType[] = [
    { code: 'CAFE_RESTAURANT', name: 'Cafe & Restaurant', description: 'Food and beverage service', isActive: true },
    { code: 'LAUNDRY_SERVICE', name: 'Laundry Service', description: 'Laundry and cleaning services', isActive: true },
    { code: 'RETAIL_MINIMARKET', name: 'Retail & Minimarket', description: 'Retail store and minimarket', isActive: true },
    { code: 'SERVICE_BUSINESS', name: 'Service Business', description: 'General service business', isActive: true },
    { code: 'DIGITAL_PPOB', name: 'Digital & PPOB', description: 'Digital products and PPOB services', isActive: true },
  ];
  
  await db.insert(businessTypes).values(businessTypeData);
  console.log(`✅ Created ${businessTypeData.length} business types\n`);
}

/**
 * Seed the demo tenant - Thamada Coffee Shop
 */
async function seedTenant(): Promise<string> {
  console.log('🏢 Seeding tenant...');
  
  const tenantData = {
    id: 'demo-tenant',
    name: 'Thamada Coffee Shop',
    slug: 'demo-tenant',
    businessType: 'CAFE_RESTAURANT',
    businessName: 'Thamada Coffee Shop',
    businessAddress: 'Jl. Sudirman No. 45, Jakarta Pusat 10220',
    businessPhone: '+62812-9988-7766',
    businessEmail: 'hello@thamadacoffee.id',
    planTier: 'premium',
    subscriptionStatus: 'active',
    timezone: 'Asia/Jakarta',
    currency: 'IDR',
    locale: 'id-ID',
    isActive: true,
  };
  
  const [tenant] = await db.insert(tenants).values(tenantData).returning();
  console.log(`✅ Tenant created: ${tenant.slug} (${tenant.id})`);
  
  return tenant.id;
}

/**
 * Helper: seed a beverage product with Temperature + Sugar Level + Add-ons options
 */
async function seedBeverageProduct(
  tenantId: string,
  name: string,
  description: string,
  basePrice: string,
  category: string,
  imageUrl: string | null,
  hasSugarLevel = false,
) {
  const [product] = await db.insert(products).values({
    tenantId,
    name,
    description,
    basePrice,
    category,
    imageUrl,
    hasVariants: true,
    stockTrackingEnabled: false,
    isActive: true,
  } as InsertProduct).returning();

  // Temperature group
  const [tempGroup] = await db.insert(productOptionGroups).values({
    tenantId,
    productId: product.id,
    name: 'Suhu',
    selectionType: 'single',
    minSelections: 1,
    maxSelections: 1,
    isRequired: true,
    displayOrder: 0,
  } as InsertProductOptionGroup).returning();

  await db.insert(productOptions).values([
    { tenantId, optionGroupId: tempGroup.id, name: 'Hot', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: tempGroup.id, name: 'Iced', priceDelta: '3000', isAvailable: true, displayOrder: 1 },
  ] as InsertProductOption[]);

  // Size group
  const [sizeGroup] = await db.insert(productOptionGroups).values({
    tenantId,
    productId: product.id,
    name: 'Ukuran',
    selectionType: 'single',
    minSelections: 1,
    maxSelections: 1,
    isRequired: true,
    displayOrder: 1,
  } as InsertProductOptionGroup).returning();

  await db.insert(productOptions).values([
    { tenantId, optionGroupId: sizeGroup.id, name: 'Regular (250ml)', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: sizeGroup.id, name: 'Large (350ml)', priceDelta: '8000', isAvailable: true, displayOrder: 1 },
  ] as InsertProductOption[]);

  if (hasSugarLevel) {
    const [sugarGroup] = await db.insert(productOptionGroups).values({
      tenantId,
      productId: product.id,
      name: 'Tingkat Gula',
      selectionType: 'single',
      minSelections: 1,
      maxSelections: 1,
      isRequired: true,
      displayOrder: 2,
    } as InsertProductOptionGroup).returning();

    await db.insert(productOptions).values([
      { tenantId, optionGroupId: sugarGroup.id, name: 'Tanpa Gula', priceDelta: '0', isAvailable: true, displayOrder: 0 },
      { tenantId, optionGroupId: sugarGroup.id, name: 'Less Sweet', priceDelta: '0', isAvailable: true, displayOrder: 1 },
      { tenantId, optionGroupId: sugarGroup.id, name: 'Normal', priceDelta: '0', isAvailable: true, displayOrder: 2 },
      { tenantId, optionGroupId: sugarGroup.id, name: 'Extra Sweet', priceDelta: '0', isAvailable: true, displayOrder: 3 },
    ] as InsertProductOption[]);
  }

  console.log(`  ✅ ${name}`);
  return product;
}

/**
 * Seed products - Thamada Coffee Shop menu
 * Categories: Coffee, Non-Coffee, Main Course, Snack
 */
async function seedProducts(tenantId: string) {
  console.log('☕ Seeding Thamada Coffee Shop menu...\n');

  // ─── COFFEE ──────────────────────────────────────────────────────────────────
  console.log('📂 Category: Coffee');

  // Espresso - simple, no size
  const [espresso] = await db.insert(products).values({
    tenantId,
    name: 'Espresso',
    description: 'Single shot espresso dengan crema sempurna, intensity tinggi dan body penuh',
    basePrice: '22000',
    category: 'Coffee',
    imageUrl: PRODUCT_IMAGES.cappuccino,
    hasVariants: true,
    stockTrackingEnabled: false,
    isActive: true,
  } as InsertProduct).returning();

  const [espressoShotGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: espresso.id, name: 'Shot', selectionType: 'single',
    minSelections: 1, maxSelections: 1, isRequired: true, displayOrder: 0,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: espressoShotGroup.id, name: 'Single Shot', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: espressoShotGroup.id, name: 'Double Shot', priceDelta: '10000', isAvailable: true, displayOrder: 1 },
  ] as InsertProductOption[]);
  console.log('  ✅ Espresso');

  // Americano
  await seedBeverageProduct(tenantId, 'Americano', 'Espresso yang diencerkan dengan air panas, rasa bersih dan refreshing', '25000', 'Coffee', PRODUCT_IMAGES.cappuccino);

  // Cappuccino
  const cappuccino = await seedBeverageProduct(tenantId, 'Cappuccino', 'Espresso klasik dengan steamed milk dan milk foam yang creamy', '32000', 'Coffee', PRODUCT_IMAGES.cappuccino);
  // Add coffee add-ons
  const [capAddonsGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: cappuccino.id, name: 'Tambahan', selectionType: 'multiple',
    minSelections: 0, maxSelections: 3, isRequired: false, displayOrder: 3,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: capAddonsGroup.id, name: 'Extra Shot', priceDelta: '10000', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: capAddonsGroup.id, name: 'Oat Milk', priceDelta: '7000', isAvailable: true, displayOrder: 1 },
    { tenantId, optionGroupId: capAddonsGroup.id, name: 'Vanilla Syrup', priceDelta: '5000', isAvailable: true, displayOrder: 2 },
  ] as InsertProductOption[]);

  // Caffe Latte
  const latte = await seedBeverageProduct(tenantId, 'Caffe Latte', 'Perpaduan espresso dengan steamed milk lembut dan sedikit foam di atasnya', '35000', 'Coffee', PRODUCT_IMAGES.icedLatte);
  const [latteAddonsGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: latte.id, name: 'Tambahan', selectionType: 'multiple',
    minSelections: 0, maxSelections: 3, isRequired: false, displayOrder: 3,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: latteAddonsGroup.id, name: 'Extra Shot', priceDelta: '10000', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: latteAddonsGroup.id, name: 'Oat Milk', priceDelta: '7000', isAvailable: true, displayOrder: 1 },
    { tenantId, optionGroupId: latteAddonsGroup.id, name: 'Caramel Drizzle', priceDelta: '5000', isAvailable: true, displayOrder: 2 },
    { tenantId, optionGroupId: latteAddonsGroup.id, name: 'Hazelnut Syrup', priceDelta: '5000', isAvailable: true, displayOrder: 3 },
  ] as InsertProductOption[]);

  // Flat White
  await seedBeverageProduct(tenantId, 'Flat White', 'Espresso dengan microfoam susu sapi pilihan, tekstur halus dan kaya rasa', '36000', 'Coffee', PRODUCT_IMAGES.cappuccino);

  // Kopi Susu Gula Aren
  const [kopiSusu] = await db.insert(products).values({
    tenantId,
    name: 'Kopi Susu Gula Aren',
    description: 'Espresso dingin dengan susu segar dan gula aren asli Kalimantan yang harum',
    basePrice: '28000',
    category: 'Coffee',
    imageUrl: PRODUCT_IMAGES.icedLatte,
    hasVariants: true,
    stockTrackingEnabled: false,
    isActive: true,
  } as InsertProduct).returning();
  const [kopiSusuSizeGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: kopiSusu.id, name: 'Ukuran', selectionType: 'single',
    minSelections: 1, maxSelections: 1, isRequired: true, displayOrder: 0,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: kopiSusuSizeGroup.id, name: 'Regular (350ml)', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: kopiSusuSizeGroup.id, name: 'Large (500ml)', priceDelta: '8000', isAvailable: true, displayOrder: 1 },
  ] as InsertProductOption[]);
  const [kopiSusuSugarGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: kopiSusu.id, name: 'Tingkat Manis', selectionType: 'single',
    minSelections: 1, maxSelections: 1, isRequired: true, displayOrder: 1,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: kopiSusuSugarGroup.id, name: 'Less Sweet', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: kopiSusuSugarGroup.id, name: 'Normal', priceDelta: '0', isAvailable: true, displayOrder: 1 },
    { tenantId, optionGroupId: kopiSusuSugarGroup.id, name: 'Extra Sweet', priceDelta: '0', isAvailable: true, displayOrder: 2 },
  ] as InsertProductOption[]);
  console.log('  ✅ Kopi Susu Gula Aren');

  // Cold Brew
  const [coldBrew] = await db.insert(products).values({
    tenantId,
    name: 'Cold Brew',
    description: 'Kopi diseduh dingin selama 18 jam, smooth dan rendah asam, disajikan langsung dengan es batu',
    basePrice: '38000',
    category: 'Coffee',
    imageUrl: PRODUCT_IMAGES.cappuccino,
    hasVariants: true,
    stockTrackingEnabled: false,
    isActive: true,
  } as InsertProduct).returning();
  const [coldBrewGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: coldBrew.id, name: 'Varian', selectionType: 'single',
    minSelections: 1, maxSelections: 1, isRequired: true, displayOrder: 0,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: coldBrewGroup.id, name: 'Original', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: coldBrewGroup.id, name: 'Milk Cold Brew', priceDelta: '8000', isAvailable: true, displayOrder: 1 },
    { tenantId, optionGroupId: coldBrewGroup.id, name: 'Vanilla Cold Brew', priceDelta: '10000', isAvailable: true, displayOrder: 2 },
  ] as InsertProductOption[]);
  console.log('  ✅ Cold Brew');

  // Vietnamese Iced Coffee
  const [vietnamCoffee] = await db.insert(products).values({
    tenantId,
    name: 'Vietnamese Iced Coffee',
    description: 'Kopi robusta kuat dengan susu kental manis yang legit, disajikan dengan es batu banyak',
    basePrice: '30000',
    category: 'Coffee',
    imageUrl: PRODUCT_IMAGES.icedLatte,
    hasVariants: false,
    stockTrackingEnabled: false,
    isActive: true,
  } as InsertProduct).returning();
  console.log('  ✅ Vietnamese Iced Coffee');

  // ─── NON-COFFEE ──────────────────────────────────────────────────────────────
  console.log('\n📂 Category: Non-Coffee');

  // Matcha Latte
  await seedBeverageProduct(tenantId, 'Matcha Latte', 'Matcha ceremonial grade Jepang dengan steamed milk, earthy dan creamy', '35000', 'Non-Coffee', null, true);

  // Teh Tarik
  const [tehTarik] = await db.insert(products).values({
    tenantId,
    name: 'Teh Tarik',
    description: 'Teh hitam khas Malaysia dengan susu kental yang ditarik hingga berbusa lembut',
    basePrice: '22000',
    category: 'Non-Coffee',
    imageUrl: null,
    hasVariants: true,
    stockTrackingEnabled: false,
    isActive: true,
  } as InsertProduct).returning();
  const [tehTarikTempGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: tehTarik.id, name: 'Suhu', selectionType: 'single',
    minSelections: 1, maxSelections: 1, isRequired: true, displayOrder: 0,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: tehTarikTempGroup.id, name: 'Hot', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: tehTarikTempGroup.id, name: 'Iced', priceDelta: '3000', isAvailable: true, displayOrder: 1 },
  ] as InsertProductOption[]);
  console.log('  ✅ Teh Tarik');

  // Cokelat Panas / Iced Chocolate
  await seedBeverageProduct(tenantId, 'Dark Chocolate', 'Minuman cokelat premium dengan dark cocoa 70%, kaya rasa dan tidak terlalu manis', '32000', 'Non-Coffee', null, true);

  // Taro Milk Tea
  await seedBeverageProduct(tenantId, 'Taro Milk Tea', 'Teh susu dengan bubuk taro ungu asli, creamy dan manis alami', '30000', 'Non-Coffee', null, true);

  // Thai Tea
  await seedBeverageProduct(tenantId, 'Thai Tea', 'Teh Assam khas Thailand dengan susu evaporasi, warna oranye khas dan rasa otentik', '28000', 'Non-Coffee', null, true);

  // Strawberry Smoothie
  const [strawSmoothie] = await db.insert(products).values({
    tenantId,
    name: 'Strawberry Smoothie',
    description: 'Smoothie strawberry segar dengan yogurt dan susu, tanpa gula tambahan',
    basePrice: '35000',
    category: 'Non-Coffee',
    imageUrl: null,
    hasVariants: true,
    stockTrackingEnabled: false,
    isActive: true,
  } as InsertProduct).returning();
  const [strawSizeGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: strawSmoothie.id, name: 'Ukuran', selectionType: 'single',
    minSelections: 1, maxSelections: 1, isRequired: true, displayOrder: 0,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: strawSizeGroup.id, name: 'Regular (300ml)', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: strawSizeGroup.id, name: 'Large (500ml)', priceDelta: '10000', isAvailable: true, displayOrder: 1 },
  ] as InsertProductOption[]);
  console.log('  ✅ Strawberry Smoothie');

  // Lemon Squash
  const [lemonSquash] = await db.insert(products).values({
    tenantId,
    name: 'Lemon Squash',
    description: 'Perasan lemon segar dengan soda dan madu, segar dan menyegarkan di hari panas',
    basePrice: '25000',
    category: 'Non-Coffee',
    imageUrl: null,
    hasVariants: false,
    stockTrackingEnabled: false,
    isActive: true,
  } as InsertProduct).returning();
  console.log('  ✅ Lemon Squash');

  // ─── MAIN COURSE ─────────────────────────────────────────────────────────────
  console.log('\n📂 Category: Main Course');

  // Nasi Goreng Spesial
  const [nasiGoreng] = await db.insert(products).values({
    tenantId,
    name: 'Nasi Goreng Spesial',
    description: 'Nasi goreng bumbu rahasia dengan ayam suwir, telur mata sapi, acar, dan kerupuk renyah',
    basePrice: '38000',
    category: 'Main Course',
    imageUrl: PRODUCT_IMAGES.rice,
    hasVariants: true,
    stockTrackingEnabled: false,
    isActive: true,
  } as InsertProduct).returning();
  const [nasiGorengAddGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: nasiGoreng.id, name: 'Tambahan Topping', selectionType: 'multiple',
    minSelections: 0, maxSelections: 3, isRequired: false, displayOrder: 0,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: nasiGorengAddGroup.id, name: 'Ekstra Telur', priceDelta: '5000', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: nasiGorengAddGroup.id, name: 'Ekstra Ayam', priceDelta: '10000', isAvailable: true, displayOrder: 1 },
    { tenantId, optionGroupId: nasiGorengAddGroup.id, name: 'Tambah Keju', priceDelta: '8000', isAvailable: true, displayOrder: 2 },
  ] as InsertProductOption[]);
  const [nasiGorengSpicyGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: nasiGoreng.id, name: 'Level Pedas', selectionType: 'single',
    minSelections: 1, maxSelections: 1, isRequired: true, displayOrder: 1,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: nasiGorengSpicyGroup.id, name: 'Tidak Pedas', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: nasiGorengSpicyGroup.id, name: 'Pedas Sedang', priceDelta: '0', isAvailable: true, displayOrder: 1 },
    { tenantId, optionGroupId: nasiGorengSpicyGroup.id, name: 'Pedas Banget', priceDelta: '0', isAvailable: true, displayOrder: 2 },
  ] as InsertProductOption[]);
  console.log('  ✅ Nasi Goreng Spesial');

  // Spaghetti Aglio e Olio
  const [spaghetti] = await db.insert(products).values({
    tenantId,
    name: 'Spaghetti Aglio e Olio',
    description: 'Pasta Italia dengan bawang putih, olive oil, cabai flakes, dan parsley segar',
    basePrice: '48000',
    category: 'Main Course',
    imageUrl: null,
    hasVariants: true,
    stockTrackingEnabled: false,
    isActive: true,
  } as InsertProduct).returning();
  const [spaghettiProteinGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: spaghetti.id, name: 'Protein', selectionType: 'single',
    minSelections: 1, maxSelections: 1, isRequired: true, displayOrder: 0,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: spaghettiProteinGroup.id, name: 'Vegetarian', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: spaghettiProteinGroup.id, name: '+ Ayam Panggang', priceDelta: '15000', isAvailable: true, displayOrder: 1 },
    { tenantId, optionGroupId: spaghettiProteinGroup.id, name: '+ Udang Sautéed', priceDelta: '20000', isAvailable: true, displayOrder: 2 },
  ] as InsertProductOption[]);
  console.log('  ✅ Spaghetti Aglio e Olio');

  // Chicken Sandwich
  const [chickenSandwich] = await db.insert(products).values({
    tenantId,
    name: 'Chicken Sandwich',
    description: 'Ayam crispy juicy dengan selada, tomat, mentimun, mayo bawang putih di roti brioche',
    basePrice: '45000',
    category: 'Main Course',
    imageUrl: PRODUCT_IMAGES.burger,
    hasVariants: true,
    stockTrackingEnabled: false,
    isActive: true,
  } as InsertProduct).returning();
  const [sandwichSideGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: chickenSandwich.id, name: 'Side Dish', selectionType: 'single',
    minSelections: 1, maxSelections: 1, isRequired: true, displayOrder: 0,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: sandwichSideGroup.id, name: 'Tanpa Side', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: sandwichSideGroup.id, name: '+ Kentang Goreng', priceDelta: '12000', isAvailable: true, displayOrder: 1 },
    { tenantId, optionGroupId: sandwichSideGroup.id, name: '+ Garden Salad', priceDelta: '10000', isAvailable: true, displayOrder: 2 },
  ] as InsertProductOption[]);
  console.log('  ✅ Chicken Sandwich');

  // Avocado Toast
  const [avocadoToast] = await db.insert(products).values({
    tenantId,
    name: 'Avocado Toast',
    description: 'Roti sourdough panggang dengan alpukat tumbuk berbumbu, red pepper flake, dan lemon',
    basePrice: '42000',
    category: 'Main Course',
    imageUrl: null,
    hasVariants: true,
    stockTrackingEnabled: true,
    stockQty: 18,
    sku: 'MAIN-AVOTOAST-001',
    isActive: true,
  } as InsertProduct).returning();
  const [avocadoAddGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: avocadoToast.id, name: 'Tambahan', selectionType: 'multiple',
    minSelections: 0, maxSelections: 2, isRequired: false, displayOrder: 0,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: avocadoAddGroup.id, name: '+ Telur Poach', priceDelta: '8000', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: avocadoAddGroup.id, name: '+ Smoked Salmon', priceDelta: '20000', isAvailable: true, displayOrder: 1 },
    { tenantId, optionGroupId: avocadoAddGroup.id, name: '+ Feta Cheese', priceDelta: '10000', isAvailable: true, displayOrder: 2 },
  ] as InsertProductOption[]);
  console.log('  ✅ Avocado Toast');

  // Big Breakfast
  const [bigBreakfast] = await db.insert(products).values({
    tenantId,
    name: 'Big Breakfast',
    description: 'Set sarapan lengkap: scrambled egg, beef sausage, toast panggang, baked beans, dan mushroom sautéed',
    basePrice: '65000',
    category: 'Main Course',
    imageUrl: null,
    hasVariants: true,
    stockTrackingEnabled: false,
    isActive: true,
  } as InsertProduct).returning();
  const [breakfastEggGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: bigBreakfast.id, name: 'Telur', selectionType: 'single',
    minSelections: 1, maxSelections: 1, isRequired: true, displayOrder: 0,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: breakfastEggGroup.id, name: 'Scrambled', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: breakfastEggGroup.id, name: 'Sunny Side Up', priceDelta: '0', isAvailable: true, displayOrder: 1 },
    { tenantId, optionGroupId: breakfastEggGroup.id, name: 'Poached', priceDelta: '0', isAvailable: true, displayOrder: 2 },
  ] as InsertProductOption[]);
  console.log('  ✅ Big Breakfast');

  // ─── SNACK ───────────────────────────────────────────────────────────────────
  console.log('\n📂 Category: Snack');

  // Croissant
  const [croissant] = await db.insert(products).values({
    tenantId,
    name: 'Croissant',
    description: 'Croissant butter Prancis yang renyah di luar dan lembut di dalam, dipanggang fresh setiap pagi',
    basePrice: '25000',
    category: 'Snack',
    imageUrl: null,
    hasVariants: true,
    stockTrackingEnabled: true,
    stockQty: 20,
    sku: 'SNK-CROISSANT-001',
    isActive: true,
  } as InsertProduct).returning();
  const [croissantFillingGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: croissant.id, name: 'Isian', selectionType: 'single',
    minSelections: 1, maxSelections: 1, isRequired: true, displayOrder: 0,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: croissantFillingGroup.id, name: 'Plain', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: croissantFillingGroup.id, name: 'Keju', priceDelta: '5000', isAvailable: true, displayOrder: 1 },
    { tenantId, optionGroupId: croissantFillingGroup.id, name: 'Cokelat', priceDelta: '5000', isAvailable: true, displayOrder: 2 },
    { tenantId, optionGroupId: croissantFillingGroup.id, name: 'Ham & Keju', priceDelta: '12000', isAvailable: true, displayOrder: 3 },
  ] as InsertProductOption[]);
  console.log('  ✅ Croissant');

  // Roti Bakar
  const [rotiBarkar] = await db.insert(products).values({
    tenantId,
    name: 'Roti Bakar',
    description: 'Roti tawar panggang dengan pilihan topping, disajikan hangat dan crispy',
    basePrice: '20000',
    category: 'Snack',
    imageUrl: null,
    hasVariants: true,
    stockTrackingEnabled: true,
    stockQty: 25,
    sku: 'SNK-ROTIBAKAR-001',
    isActive: true,
  } as InsertProduct).returning();
  const [rotiToppingGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: rotiBarkar.id, name: 'Topping', selectionType: 'single',
    minSelections: 1, maxSelections: 1, isRequired: true, displayOrder: 0,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: rotiToppingGroup.id, name: 'Butter & Gula', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: rotiToppingGroup.id, name: 'Nutella', priceDelta: '8000', isAvailable: true, displayOrder: 1 },
    { tenantId, optionGroupId: rotiToppingGroup.id, name: 'Selai Kaya', priceDelta: '5000', isAvailable: true, displayOrder: 2 },
    { tenantId, optionGroupId: rotiToppingGroup.id, name: 'Keju + Susu', priceDelta: '8000', isAvailable: true, displayOrder: 3 },
  ] as InsertProductOption[]);
  console.log('  ✅ Roti Bakar');

  // Waffle
  const [waffle] = await db.insert(products).values({
    tenantId,
    name: 'Waffle',
    description: 'Waffle renyah dengan topping pilihan, sempurna untuk menemani kopi pagi anda',
    basePrice: '35000',
    category: 'Snack',
    imageUrl: PRODUCT_IMAGES.lava,
    hasVariants: true,
    stockTrackingEnabled: true,
    stockQty: 15,
    sku: 'SNK-WAFFLE-001',
    isActive: true,
  } as InsertProduct).returning();
  const [waffleToppingGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: waffle.id, name: 'Topping', selectionType: 'single',
    minSelections: 1, maxSelections: 1, isRequired: true, displayOrder: 0,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: waffleToppingGroup.id, name: 'Maple Syrup & Butter', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: waffleToppingGroup.id, name: 'Strawberry & Cream', priceDelta: '8000', isAvailable: true, displayOrder: 1 },
    { tenantId, optionGroupId: waffleToppingGroup.id, name: 'Nutella & Banana', priceDelta: '10000', isAvailable: true, displayOrder: 2 },
  ] as InsertProductOption[]);
  const [waffleAddGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: waffle.id, name: 'Tambahan', selectionType: 'multiple',
    minSelections: 0, maxSelections: 2, isRequired: false, displayOrder: 1,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: waffleAddGroup.id, name: 'Ice Cream Vanilla', priceDelta: '12000', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: waffleAddGroup.id, name: 'Whipped Cream', priceDelta: '5000', isAvailable: true, displayOrder: 1 },
  ] as InsertProductOption[]);
  console.log('  ✅ Waffle');

  // Chocolate Lava Cake
  const [lavaCake] = await db.insert(products).values({
    tenantId,
    name: 'Chocolate Lava Cake',
    description: 'Kue cokelat hangat dengan isi cokelat cair lumer di dalamnya, disajikan dengan ice cream vanilla',
    basePrice: '42000',
    category: 'Snack',
    imageUrl: PRODUCT_IMAGES.lava,
    hasVariants: false,
    stockTrackingEnabled: true,
    stockQty: 12,
    sku: 'SNK-LAVA-001',
    isActive: true,
  } as InsertProduct).returning();
  console.log('  ✅ Chocolate Lava Cake');

  // Kentang Goreng
  const [kentangGoreng] = await db.insert(products).values({
    tenantId,
    name: 'Kentang Goreng',
    description: 'Kentang goreng renyah dengan bumbu pilihan dan saus pendamping, cocok untuk ngemil santai',
    basePrice: '22000',
    category: 'Snack',
    imageUrl: PRODUCT_IMAGES.fries,
    hasVariants: true,
    stockTrackingEnabled: false,
    isActive: true,
  } as InsertProduct).returning();
  const [kentangSizeGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: kentangGoreng.id, name: 'Ukuran', selectionType: 'single',
    minSelections: 1, maxSelections: 1, isRequired: true, displayOrder: 0,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: kentangSizeGroup.id, name: 'Regular', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: kentangSizeGroup.id, name: 'Large', priceDelta: '8000', isAvailable: true, displayOrder: 1 },
  ] as InsertProductOption[]);
  const [kentangFlavorGroup] = await db.insert(productOptionGroups).values({
    tenantId, productId: kentangGoreng.id, name: 'Bumbu', selectionType: 'single',
    minSelections: 1, maxSelections: 1, isRequired: true, displayOrder: 1,
  } as InsertProductOptionGroup).returning();
  await db.insert(productOptions).values([
    { tenantId, optionGroupId: kentangFlavorGroup.id, name: 'Original', priceDelta: '0', isAvailable: true, displayOrder: 0 },
    { tenantId, optionGroupId: kentangFlavorGroup.id, name: 'Barbeque', priceDelta: '0', isAvailable: true, displayOrder: 1 },
    { tenantId, optionGroupId: kentangFlavorGroup.id, name: 'Keju', priceDelta: '3000', isAvailable: true, displayOrder: 2 },
    { tenantId, optionGroupId: kentangFlavorGroup.id, name: 'Pedas', priceDelta: '0', isAvailable: true, displayOrder: 3 },
  ] as InsertProductOption[]);
  console.log('  ✅ Kentang Goreng');

  console.log('\n✅ Semua menu Thamada Coffee Shop berhasil di-seed!');
  console.log('   • 7 menu Coffee');
  console.log('   • 6 menu Non-Coffee');
  console.log('   • 5 menu Main Course');
  console.log('   • 5 menu Snack');
}

/**
 * Seed order types master data
 */
async function seedOrderTypes() {
  console.log('📋 Seeding order types...');
  
  const orderTypesData: InsertOrderType[] = [
    // Cafe / Restaurant oriented
    {
      code: 'DINE_IN',
      name: 'Dine In',
      description: 'Customer dining in at the restaurant',
      isOnPremise: true,
      needTableNumber: true,
      needAddress: false,
      allowScheduled: false,
      isDigitalProduct: false,
      affectsServiceCharge: true,
      isActive: true,
    },
    {
      code: 'TAKE_AWAY',
      name: 'Take Away',
      description: 'Customer picks up order to take away',
      isOnPremise: true,
      needTableNumber: false,
      needAddress: false,
      allowScheduled: false,
      isDigitalProduct: false,
      affectsServiceCharge: false,
      isActive: true,
    },
    {
      code: 'DELIVERY',
      name: 'Delivery',
      description: 'Order delivered to customer address',
      isOnPremise: false,
      needTableNumber: false,
      needAddress: true,
      allowScheduled: true,
      isDigitalProduct: false,
      affectsServiceCharge: false,
      isActive: true,
    },
    {
      code: 'DRIVE_THRU',
      name: 'Drive Thru',
      description: 'Customer orders from vehicle',
      isOnPremise: true,
      needTableNumber: false,
      needAddress: false,
      allowScheduled: false,
      isDigitalProduct: false,
      affectsServiceCharge: false,
      isActive: true,
    },
    // Retail / Minimarket / Swalayan
    {
      code: 'WALK_IN',
      name: 'Walk In',
      description: 'Customer walks in and purchases directly',
      isOnPremise: true,
      needTableNumber: false,
      needAddress: false,
      allowScheduled: false,
      isDigitalProduct: false,
      affectsServiceCharge: false,
      isActive: true,
    },
    {
      code: 'SELF_CHECKOUT',
      name: 'Self Checkout',
      description: 'Customer uses self-service kiosk',
      isOnPremise: true,
      needTableNumber: false,
      needAddress: false,
      allowScheduled: false,
      isDigitalProduct: false,
      affectsServiceCharge: false,
      isActive: true,
    },
    {
      code: 'PICKUP_STORE',
      name: 'Pickup at Store',
      description: 'Customer orders online and picks up at store',
      isOnPremise: false,
      needTableNumber: false,
      needAddress: false,
      allowScheduled: true,
      isDigitalProduct: false,
      affectsServiceCharge: false,
      isActive: true,
    },
    {
      code: 'PPOB',
      name: 'PPOB',
      description: 'Bill payment, pulsa, token, etc.',
      isOnPremise: false,
      needTableNumber: false,
      needAddress: false,
      allowScheduled: false,
      isDigitalProduct: true,
      affectsServiceCharge: false,
      isActive: true,
    },
    {
      code: 'DIGITAL_PRODUCT',
      name: 'Digital Product',
      description: 'Digital goods purchase',
      isOnPremise: false,
      needTableNumber: false,
      needAddress: false,
      allowScheduled: false,
      isDigitalProduct: true,
      affectsServiceCharge: false,
      isActive: true,
    },
    {
      code: 'PREORDER',
      name: 'Pre-order',
      description: 'Advance order for future fulfillment',
      isOnPremise: false,
      needTableNumber: false,
      needAddress: false,
      allowScheduled: true,
      isDigitalProduct: false,
      affectsServiceCharge: false,
      isActive: true,
    },
    // Laundry
    {
      code: 'DROPOFF',
      name: 'Drop Off',
      description: 'Customer drops off laundry',
      isOnPremise: true,
      needTableNumber: false,
      needAddress: false,
      allowScheduled: false,
      isDigitalProduct: false,
      affectsServiceCharge: false,
      isActive: true,
    },
    {
      code: 'PICKUP_DELIVERY',
      name: 'Pickup & Delivery',
      description: 'Pickup laundry from customer and deliver back',
      isOnPremise: false,
      needTableNumber: false,
      needAddress: true,
      allowScheduled: true,
      isDigitalProduct: false,
      affectsServiceCharge: false,
      isActive: true,
    },
    {
      code: 'EXPRESS',
      name: 'Express',
      description: 'Express service with faster turnaround',
      isOnPremise: false,
      needTableNumber: false,
      needAddress: false,
      allowScheduled: true,
      isDigitalProduct: false,
      affectsServiceCharge: true,
      isActive: true,
    },
    // Services / Appointment-based
    {
      code: 'APPOINTMENT',
      name: 'Appointment',
      description: 'Scheduled appointment for service',
      isOnPremise: true,
      needTableNumber: false,
      needAddress: false,
      allowScheduled: true,
      isDigitalProduct: false,
      affectsServiceCharge: false,
      isActive: true,
    },
    {
      code: 'SUBSCRIPTION',
      name: 'Subscription',
      description: 'Recurring service subscription',
      isOnPremise: false,
      needTableNumber: false,
      needAddress: true,
      allowScheduled: true,
      isDigitalProduct: false,
      affectsServiceCharge: false,
      isActive: true,
    },
  ];
  
  const createdOrderTypes = await db.insert(orderTypes).values(orderTypesData).returning();
  
  console.log(`✅ Created ${createdOrderTypes.length} order types:`);
  createdOrderTypes.forEach(ot => console.log(`   - ${ot.code}: ${ot.name}`));
  
  return createdOrderTypes;
}

/**
 * Seed tenant order types for demo tenant (restaurant use case)
 */
async function seedTenantOrderTypes(tenantId: string, createdOrderTypes: any[]) {
  console.log('🏪 Enabling order types for demo tenant...');
  
  // For a cafe/restaurant type tenant, enable these order types
  const restaurantOrderTypes = ['DINE_IN', 'TAKE_AWAY', 'DELIVERY'];
  
  const tenantOrderTypesData: InsertTenantOrderType[] = createdOrderTypes
    .filter(ot => restaurantOrderTypes.includes(ot.code))
    .map(ot => ({
      tenantId,
      orderTypeId: ot.id,
      isEnabled: true,
    }));
  
  await db.insert(tenantOrderTypes).values(tenantOrderTypesData);
  
  console.log(`✅ Enabled ${tenantOrderTypesData.length} order types for demo tenant:`);
  restaurantOrderTypes.forEach(code => console.log(`   - ${code}`));
}

/**
 * Seed tenant module configs (feature flags for UI modules)
 */
async function seedTenantModuleConfigs(tenantId: string) {
  console.log('⚙️ Seeding tenant module configs...');
  
  const moduleConfigs: InsertTenantModuleConfig = {
    tenantId,
    enableTableManagement: true,
    enableKitchenTicket: true,
    enableLoyalty: false,
    enableDelivery: false,
    enableInventory: false,
    enableAppointments: false,
    enableMultiLocation: false,
  };
  
  await db.insert(tenantModuleConfigs).values(moduleConfigs).onConflictDoUpdate({
    target: tenantModuleConfigs.tenantId,
    set: moduleConfigs,
  });
  
  console.log(`✅ Module configs enabled for demo tenant:`);
  console.log(`   - Table Management: ${moduleConfigs.enableTableManagement}`);
  console.log(`   - Kitchen Ticket: ${moduleConfigs.enableKitchenTicket}`);
}

/**
 * Seed demo tables for restaurant floor plan
 */
async function seedTables(tenantId: string) {
  console.log('🪑 Seeding demo tables...');
  
  const demoTables: InsertTable[] = [
    { tenantId, tableNumber: '1', tableName: 'Window Seat A', floor: 'Ground', capacity: 2, status: 'available' },
    { tenantId, tableNumber: '2', tableName: 'Window Seat B', floor: 'Ground', capacity: 2, status: 'available' },
    { tenantId, tableNumber: '3', tableName: 'Corner Table', floor: 'Ground', capacity: 4, status: 'available' },
    { tenantId, tableNumber: '4', tableName: 'Center Table 1', floor: 'Ground', capacity: 4, status: 'available' },
    { tenantId, tableNumber: '5', tableName: 'Center Table 2', floor: 'Ground', capacity: 4, status: 'available' },
    { tenantId, tableNumber: '6', tableName: 'VIP Table', floor: 'Ground', capacity: 6, status: 'available' },
    { tenantId, tableNumber: 'A1', tableName: 'Upper Terrace 1', floor: '2nd Floor', capacity: 2, status: 'available' },
    { tenantId, tableNumber: 'A2', tableName: 'Upper Terrace 2', floor: '2nd Floor', capacity: 4, status: 'available' },
    { tenantId, tableNumber: 'B1', tableName: 'Lounge Area', floor: '2nd Floor', capacity: 6, status: 'maintenance' },
    { tenantId, tableNumber: 'B2', tableName: 'Private Dining', floor: '2nd Floor', capacity: 8, status: 'available' },
  ];
  
  await db.insert(tables).values(demoTables);
  
  console.log(`✅ Created ${demoTables.length} demo tables for floor plan`);
}

/**
 * Generate a proper order number in format ORD-YYYYMMDD-XXXX
 */
function generateSeededOrderNumber(date: Date, sequence: number): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const seq = String(sequence).padStart(4, '0');
  return `ORD-${y}${m}${d}-${seq}`;
}

/**
 * Seed open & in-progress orders for the demo queue
 * Creates a realistic queue with different statuses and Indonesian customer names
 */
async function seedOpenOrders(tenantId: string) {
  console.log('🛒 Seeding demo order queue (Thamada Coffee Shop)...');
  
  try {
    const productsData = await db.query.products.findMany({
      where: (p, { eq }) => eq(p.tenantId, tenantId),
    });
    
    if (productsData.length === 0) {
      console.log('   ℹ️  No products found, skipping open orders');
      return;
    }

    const dineInOrderType = await db.query.tenantOrderTypes.findFirst({
      where: (tot, { eq }) => eq(tot.tenantId, tenantId),
    });

    if (!dineInOrderType) {
      console.log('   ℹ️  No order type found for tenant, skipping open orders');
      return;
    }

    const today = new Date();
    const taxRate = 0.11;         // PPN 11%
    const serviceChargeRate = 0.05; // Service charge 5%

    // Queue orders: mix of statuses to demo the full kitchen queue
    const queueOrders = [
      // Meja 1 - Budi & teman, confirmed (baru masuk dapur)
      {
        tableNumber: '1',
        customerName: 'Budi Santoso',
        status: 'confirmed' as const,
        sequence: 1,
        items: [
          { productName: 'Cappuccino', qty: 2, price: 32000 },
          { productName: 'Avocado Toast', qty: 1, price: 42000 },
          { productName: 'Croissant', qty: 2, price: 25000 },
        ],
      },
      // Meja 2 - Sari, preparing (sedang dibuat)
      {
        tableNumber: '2',
        customerName: 'Sari Dewi',
        status: 'preparing' as const,
        sequence: 2,
        items: [
          { productName: 'Nasi Goreng Spesial', qty: 1, price: 38000 },
          { productName: 'Kopi Susu Gula Aren', qty: 1, price: 28000 },
          { productName: 'Kentang Goreng', qty: 1, price: 22000 },
        ],
      },
      // Meja 3 - Reza & grup, preparing (sedang dibuat)
      {
        tableNumber: '3',
        customerName: 'Reza Pratama',
        status: 'preparing' as const,
        sequence: 3,
        items: [
          { productName: 'Chicken Sandwich', qty: 2, price: 45000 },
          { productName: 'Cold Brew', qty: 2, price: 38000 },
          { productName: 'Waffle', qty: 1, price: 35000 },
        ],
      },
      // Meja 4 - Indah, ready (siap dihidangkan)
      {
        tableNumber: '4',
        customerName: 'Indah Permatasari',
        status: 'ready' as const,
        sequence: 4,
        items: [
          { productName: 'Matcha Latte', qty: 1, price: 35000 },
          { productName: 'Chocolate Lava Cake', qty: 1, price: 42000 },
        ],
      },
      // Meja 5 - Farhan & Nadia, confirmed (antri)
      {
        tableNumber: '5',
        customerName: 'Farhan Maulana',
        status: 'confirmed' as const,
        sequence: 5,
        items: [
          { productName: 'Americano', qty: 1, price: 25000 },
          { productName: 'Caffe Latte', qty: 1, price: 35000 },
          { productName: 'Big Breakfast', qty: 2, price: 65000 },
        ],
      },
      // Meja 6 - Ayu, take away - confirmed
      {
        tableNumber: '6',
        customerName: 'Ayu Rahmawati',
        status: 'confirmed' as const,
        sequence: 6,
        items: [
          { productName: 'Taro Milk Tea', qty: 2, price: 30000 },
          { productName: 'Thai Tea', qty: 1, price: 28000 },
          { productName: 'Roti Bakar', qty: 2, price: 20000 },
        ],
      },
    ];

    for (const queueOrder of queueOrders) {
      const subtotal = queueOrder.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
      const tax = Math.round(subtotal * taxRate);
      const serviceCharge = Math.round(subtotal * serviceChargeRate);
      const total = subtotal + tax + serviceCharge;

      const orderNumber = generateSeededOrderNumber(today, queueOrder.sequence);

      const [order] = await db.insert(orders).values({
        tenantId,
        orderTypeId: dineInOrderType.orderTypeId,
        orderNumber,
        status: queueOrder.status,
        paymentStatus: 'unpaid',
        tableNumber: queueOrder.tableNumber,
        customerName: queueOrder.customerName,
        subtotal: subtotal.toString(),
        taxAmount: tax.toString(),
        serviceCharge: serviceCharge.toString(),
        total: total.toString(),
        notes: null,
      }).returning();

      for (const item of queueOrder.items) {
        const product = productsData.find(p => p.name === item.productName);
        if (product) {
          await db.insert(orderItems).values({
            orderId: order.id,
            productId: product.id,
            productName: item.productName,
            unitPrice: item.price.toString(),
            quantity: item.qty,
            itemSubtotal: (item.price * item.qty).toString(),
          });
        }
      }

      const statusLabel = { confirmed: '🟠 Waiting', preparing: '🟡 Preparing', ready: '🟢 Ready' }[queueOrder.status] || queueOrder.status;
      console.log(`   ✓ ${orderNumber} | Meja ${queueOrder.tableNumber} | ${queueOrder.customerName} | ${statusLabel} | Rp ${total.toLocaleString('id-ID')}`);
    }

    // Mark occupied tables
    const occupiedTables = [...new Set(queueOrders.map(o => o.tableNumber))];
    for (const tableNum of occupiedTables) {
      const tableToUpdate = await db.query.tables.findFirst({
        where: (t, { eq }) => eq(t.tableNumber, tableNum),
      });
      if (tableToUpdate) {
        await db.update(tables).set({ status: 'occupied' }).where(eq(tables.id, tableToUpdate.id));
      }
    }

    console.log(`✅ Created ${queueOrders.length} demo orders in queue (confirmed: 3, preparing: 2, ready: 1)`);
  } catch (error) {
    console.error('❌ Error seeding open orders:', error);
    throw error;
  }
}

/**
 * Seed tenant features for demo tenant
 */
async function seedTenantFeatures(tenantId: string) {
  console.log('🎯 Seeding tenant features...');
  
  const featureData: InsertTenantFeature[] = DEMO_TENANT_FEATURES.map(featureCode => ({
    tenantId,
    featureCode,
    source: 'plan_default' as const,
    isActive: true,
  }));
  
  await db.insert(tenantFeatures).values(featureData);
  
  console.log(`✅ Enabled ${DEMO_TENANT_FEATURES.length} features for demo tenant:`);
  DEMO_TENANT_FEATURES.forEach(code => console.log(`   - ${code}`));
}

/**
 * Seed INDONESIAN LAUNDRY tenant with realistic Indonesian services & pricing
 */
async function seedIndonesianLaundryTenant(createdOrderTypes: any[]) {
  console.log('\n🧺 Creating INDONESIAN LAUNDRY Demo Tenant...');
  
  const tenantData = {
    businessType: 'LAUNDRY_SERVICE',
    id: 'laundry-indo',
    name: 'Cucian Cepat Indonesia',
    slug: 'laundry-indo',
    businessName: 'PT Cucian Cepat Indonesia - Layanan Laundry Profesional',
    businessAddress: 'Jl. Merdeka No. 123, Jakarta Selatan 12345',
    businessPhone: '+62812-3456-7890',
    businessEmail: 'layanan@cucianc epat.id',
    planTier: 'professional',
    subscriptionStatus: 'active',
    timezone: 'Asia/Jakarta',
    currency: 'IDR',
    locale: 'id-ID',
    isActive: true,
  };
  
  const [tenant] = await db.insert(tenants).values(tenantData).returning();
  console.log(`✅ Tenant created: ${tenant.slug}`);
  
  // Enable laundry order types
  const laundryOrderTypes = ['DROPOFF', 'PICKUP_DELIVERY', 'EXPRESS'];
  const tenantOrderTypesData: InsertTenantOrderType[] = createdOrderTypes
    .filter(ot => laundryOrderTypes.includes(ot.code))
    .map(ot => ({
      tenantId: tenant.id,
      orderTypeId: ot.id,
      isEnabled: true,
    }));
  
  await db.insert(tenantOrderTypes).values(tenantOrderTypesData);
  console.log(`✅ Enabled ${tenantOrderTypesData.length} laundry order types`);
  
  // Seed Indonesian laundry services with realistic pricing
  const serviceProducts = [
    { 
      name: 'Cuci Satuan', 
      price: 9500, 
      desc: 'Layanan cuci biasa - Harga per kg, Waktu: 3-5 hari kerja' 
    },
    { 
      name: 'Cuci + Setrika', 
      price: 12000, 
      desc: 'Cuci dan setrika lengkap - Per kg, Waktu: 2-3 hari kerja' 
    },
    { 
      name: 'Cuci Kilat', 
      price: 18000, 
      desc: 'Layanan express - Per kg, Waktu: 1 hari kerja (order sebelum jam 10 pagi)' 
    },
    { 
      name: 'Setrika Saja', 
      price: 6000, 
      desc: 'Layanan setrika untuk kain yang sudah bersih - Per kg' 
    },
    { 
      name: 'Dry Cleaning', 
      price: 45000, 
      desc: 'Pembersihan profesional untuk gaun, jas, blazer - Per item' 
    },
    { 
      name: 'Cuci Sprai & Sarung Bantal', 
      price: 25000, 
      desc: 'Layanan khusus untuk sprai tempat tidur dan sarung bantal - Per set' 
    },
    { 
      name: 'Cuci Selimut & Bedcover', 
      price: 35000, 
      desc: 'Pembersihan dalam dan deep wash untuk selimut - Per item' 
    },
    { 
      name: 'Cuci Karpet & Tikar', 
      price: 50000, 
      desc: 'Pembersihan profesional karpet dan tikar - Per m²' 
    },
    { 
      name: 'Cuci Sofa & Mebel', 
      price: 75000, 
      desc: 'Layanan khusus pembersihan sofa dan furniture - Per kursi/bagian' 
    },
    { 
      name: 'Hapus Noda Membandel', 
      price: 15000, 
      desc: 'Layanan khusus hapus noda ekstrem (minyak, tinta, cat, dll) - Per item' 
    },
  ];
  
  for (const service of serviceProducts) {
    await db.insert(products).values({
      tenantId: tenant.id,
      name: service.name,
      description: service.desc,
      basePrice: service.price.toString(),
      category: 'Layanan Cuci',
      hasVariants: false,
      stockTrackingEnabled: false,
      isActive: true,
    } as InsertProduct);
  }
  
  console.log(`✅ Created ${serviceProducts.length} laundry services (Indonesia-specific)`);
  
  // Module config - delivery and appointments enabled for laundry
  await db.insert(tenantModuleConfigs).values({
    tenantId: tenant.id,
    enableTableManagement: false,
    enableKitchenTicket: false,
    enableLoyalty: true,
    enableDelivery: true,
    enableInventory: false,
    enableAppointments: true,
    enableMultiLocation: false,
  });
  
  console.log(`✅ Module configs set for laundry (Delivery & Appointments enabled)`);
  
  return tenant.id;
}

/**
 * Seed MINIMARKET tenant with retail products
 */
async function seedMinimarketTenant(createdOrderTypes: any[]) {
  console.log('\n🏪 Creating MINIMARKET Demo Tenant...');
  
  const tenantData = {
    businessType: 'RETAIL_MINIMARKET',
    id: 'minimarket-demo',
    name: 'Demo MiniMart 24',
    slug: 'minimarket-demo',
    businessName: 'MiniMart 24 Convenience Store',
    businessAddress: '789 Retail Plaza, City, Country',
    businessPhone: '+1555666777',
    businessEmail: 'sales@minimart24.com',
    planTier: 'professional',
    subscriptionStatus: 'active',
    timezone: 'UTC',
    currency: 'IDR',
    locale: 'id-ID',
    isActive: true,
  };
  
  const [tenant] = await db.insert(tenants).values(tenantData).returning();
  console.log(`✅ Tenant created: ${tenant.slug}`);
  
  // Enable retail order types
  const retailOrderTypes = ['WALK_IN', 'SELF_CHECKOUT', 'PICKUP_STORE'];
  const tenantOrderTypesData: InsertTenantOrderType[] = createdOrderTypes
    .filter(ot => retailOrderTypes.includes(ot.code))
    .map(ot => ({
      tenantId: tenant.id,
      orderTypeId: ot.id,
      isEnabled: true,
    }));
  
  await db.insert(tenantOrderTypes).values(tenantOrderTypesData);
  console.log(`✅ Enabled ${tenantOrderTypesData.length} retail order types`);
  
  // Seed retail products
  const retailProducts = [
    { name: 'Mineral Water 600ml', category: 'Beverages', price: 5500 },
    { name: 'Energy Drink 250ml', category: 'Beverages', price: 12000 },
    { name: 'Instant Noodles', category: 'Snacks', price: 3000 },
    { name: 'Potato Chips 100g', category: 'Snacks', price: 8500 },
    { name: 'Chocolate Bar', category: 'Snacks', price: 10000 },
    { name: 'Bread Loaf', category: 'Daily Essentials', price: 15000 },
    { name: 'Milk Carton 1L', category: 'Daily Essentials', price: 18000 },
    { name: 'Eggs (10 pcs)', category: 'Daily Essentials', price: 22000 },
    { name: 'Soap 200g', category: 'Beauty & Care', price: 8000 },
    { name: 'Toothpaste 150ml', category: 'Beauty & Care', price: 12000 },
    { name: 'Shampoo 250ml', category: 'Beauty & Care', price: 18000 },
    { name: 'Deodorant Stick', category: 'Beauty & Care', price: 15000 },
  ];
  
  for (const product of retailProducts) {
    await db.insert(products).values({
      tenantId: tenant.id,
      name: product.name,
      basePrice: product.price.toString(),
      category: product.category,
      hasVariants: false,
      stockTrackingEnabled: true,
      stockQty: Math.floor(Math.random() * 50) + 20,
      isActive: true,
    } as InsertProduct);
  }
  
  console.log(`✅ Created ${retailProducts.length} retail products`);
  
  // Module config - no table management or kitchen for retail
  await db.insert(tenantModuleConfigs).values({
    tenantId: tenant.id,
    enableTableManagement: false,
    enableKitchenTicket: false,
    enableLoyalty: true,
    enableDelivery: false,
    enableInventory: true,
    enableAppointments: false,
    enableMultiLocation: false,
  });
  
  console.log(`✅ Module configs set for minimarket`);
  
  return tenant.id;
}

/**
 * Main seed function
 */
async function seed() {
  console.log('🌱 Starting database seed...\n');
  
  try {
    // Clear existing data
    await clearDatabase();
    console.log('');
    
    // Seed business types (master data - MUST be first for FK constraint)
    await seedBusinessTypes();
    
    // Seed order types (master data)
    const createdOrderTypes = await seedOrderTypes();
    console.log('');
    
    // Seed tenant
    const tenantId = await seedTenant();
    console.log('');
    
    // Enable order types for demo tenant
    await seedTenantOrderTypes(tenantId, createdOrderTypes);
    console.log('');
    
    // Seed products with option groups
    await seedProducts(tenantId);
    console.log('');
    
    // Seed tenant module configs (feature flags)
    await seedTenantModuleConfigs(tenantId);
    console.log('');
    
    // Seed demo tables for floor plan
    await seedTables(tenantId);
    console.log('');
    
    // Seed open orders for Continue Order testing
    await seedOpenOrders(tenantId);
    console.log('');
    
    // Seed tenant features
    await seedTenantFeatures(tenantId);
    console.log('');
    
    // Seed INDONESIAN LAUNDRY tenant
    const laundryTenantId = await seedIndonesianLaundryTenant(createdOrderTypes);
    
    // Seed MINIMARKET tenant
    const minimarketTenantId = await seedMinimarketTenant(createdOrderTypes);
    
    console.log('\n✅ Database seed completed successfully! 🎉');
    console.log('');
    console.log('Summary:');
    console.log('- 3 tenants created');
    console.log('  • demo-tenant → Thamada Coffee Shop');
    console.log('  • laundry-indo → Cucian Cepat Indonesia');
    console.log('  • minimarket-demo → Minimarket Demo');
    console.log(`- ${createdOrderTypes.length} order types created`);
    console.log('- 23 menu items (Thamada Coffee Shop):');
    console.log('   • 7 Coffee (Espresso, Americano, Cappuccino, Caffe Latte, Flat White, Kopi Susu Gula Aren, Cold Brew, Vietnamese Iced Coffee)');
    console.log('   • 6 Non-Coffee (Matcha Latte, Teh Tarik, Dark Chocolate, Taro Milk Tea, Thai Tea, Strawberry Smoothie, Lemon Squash)');
    console.log('   • 5 Main Course (Nasi Goreng Spesial, Spaghetti Aglio e Olio, Chicken Sandwich, Avocado Toast, Big Breakfast)');
    console.log('   • 5 Snack (Croissant, Roti Bakar, Waffle, Chocolate Lava Cake, Kentang Goreng)');
    console.log('- 10 laundry services - Indonesia-specific (Laundry)');
    console.log('- 12 retail products (Minimarket)');
    console.log(`- ${DEMO_TENANT_FEATURES.length} features enabled for Thamada Coffee Shop`);
    console.log('');
    console.log('Tenant IDs:');
    console.log(`- Thamada Coffee Shop: ${tenantId}`);
    console.log(`- Laundry (Indonesia): ${laundryTenantId}`);
    console.log(`- Minimarket: ${minimarketTenantId}`);
    
  } catch (error) {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the seed
seed();
