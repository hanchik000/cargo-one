// Deterministic demo dataset (application data, not real companies/vehicles/inspections).
import type { TryOnKind,
  Address, AppNotification, BusinessProfile, CargoPackage, Car, CarInspection, CarInspectionItem, CarReservation, Category,
  ContentSettings, FaqItem, Favorite, GroupBuy, InspectionItemKey, Invoice, Order, Payment, PaymentMethod, Product, ProductReview,
  Promotion, QuoteRequest, Shipment, ShipmentEvent, ShipmentStage, Supplier, SupplierPayout, SupportTicket, User, VIPSubscription,
  Warehouse, CategoryId, PromotionEntry, AIRequest, SearchRequest,
} from '@/lib/types';
import { DEFAULT_SETTINGS, estimateLines } from '@/lib/pricing';

const DAY = 86_400_000;
const NOW = Date.now();
const ago = (d: number, h = 10) => new Date(NOW - d * DAY + (h - 12) * 3_600_000).toISOString();
const ahead = (d: number) => new Date(NOW + d * DAY).toISOString();

// Seeded PRNG so the dataset is stable.
let seed = 20261008;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];

export const categories: Category[] = (
  [['electronics', 'Smartphone'], ['fashion', 'Shirt'], ['home', 'Sofa'], ['beauty', 'Sparkles'], ['kids', 'Baby'], ['auto', 'Car'], ['tools', 'Wrench'], ['industrial', 'Factory'], ['business', 'Briefcase']] as [CategoryId, string][]
).map(([id, icon], i) => ({ id, icon, visible: true, order: i }));

export const warehouses: Warehouse[] = [
  { id: 'w1', name: 'CARGO ONE Yiwu Hub', city: 'Yiwu', country: 'CN' },
  { id: 'w2', name: 'CARGO ONE Guangzhou Hub', city: 'Guangzhou', country: 'CN' },
  { id: 'w3', name: 'CARGO ONE Urumqi Rail Hub', city: 'Urumqi', country: 'CN' },
  { id: 'w4', name: 'CARGO ONE Ashgabat Hub', city: 'Ashgabat', country: 'TM' },
];

const S = (id: string, name: string, nameCn: string, city: string, province: string, cats: CategoryId[], score: number, years: number, moq: number, rr: number, rh: number, certs: string[], verified: boolean, status: Supplier['status'], description: string): Supplier => ({
  id, name, nameCn, city, province, categories: cats, score, yearsActive: years, moq, responseRate: rr, responseHours: rh,
  certifications: certs, verified, status, complaints: Math.round((100 - score) / 6), ordersCount: Math.round(score * 14 + years * 30),
  disputeRate: Math.round((100 - score) / 4) / 10, onTimeRate: Math.min(99, score + 3), monogram: name.split(' ').slice(0, 2).map((w) => w[0]).join(''),
  description,
  documents: [
    { id: `${id}-d1`, name: 'Business license.pdf', kind: 'license', uploadedAt: ago(200), status: verified ? 'approved' : 'pending' },
    { id: `${id}-d2`, name: 'Bank account confirmation.pdf', kind: 'bank', uploadedAt: ago(190), status: verified ? 'approved' : 'pending' },
    ...(certs.length ? [{ id: `${id}-d3`, name: `${certs[0]} certificate.pdf`, kind: 'certificate' as const, uploadedAt: ago(120), status: 'approved' as const }] : []),
  ],
  reviews: [
    { id: `${id}-r1`, author: 'Merdan A.', rating: score > 88 ? 5 : 4, text: 'Samples matched the final batch. Packaging was solid for rail transit.', date: ago(40) },
    { id: `${id}-r2`, author: 'Ogulgerek B.', rating: score > 85 ? 5 : 3, text: 'Responded within a day and adjusted MOQ for a first order.', date: ago(75) },
    { id: `${id}-r3`, author: 'Dovlet K.', rating: 4, text: 'Production took two days longer than quoted, quality was fine.', date: ago(130) },
  ],
});

export const suppliers: Supplier[] = [
  S('s1', 'Shenzhen Lumen Electronics', '深圳流明电子有限公司', 'Shenzhen', 'Guangdong', ['electronics'], 94, 11, 50, 98, 3, ['CE', 'FCC', 'RoHS'], true, 'approved', 'Consumer audio, wearables and charging accessories. In-house QC line and export packaging.'),
  S('s2', 'Yiwu Everbright Trading', '义乌永明商贸有限公司', 'Yiwu', 'Zhejiang', ['home', 'kids', 'fashion'], 88, 8, 30, 95, 5, ['EN71', 'CE'], true, 'approved', 'General merchandise consolidator in Yiwu market. Toys, storage and everyday goods.'),
  S('s3', 'Guangzhou Silkroad Apparel', '广州丝路服饰有限公司', 'Guangzhou', 'Guangdong', ['fashion', 'beauty'], 91, 9, 20, 97, 4, ['BSCI'], true, 'approved', 'Leather goods, bags and outerwear for regional retailers.'),
  S('s4', 'Dongguan Precision Tools', '东莞精工工具有限公司', 'Dongguan', 'Guangdong', ['tools', 'industrial'], 89, 14, 10, 93, 6, ['ISO 9001', 'CE'], true, 'approved', 'Power tools, hand tools and industrial lighting.'),
  S('s5', 'Ningbo Harbor Home', '宁波港湾家居用品有限公司', 'Ningbo', 'Zhejiang', ['home'], 86, 7, 40, 92, 8, ['LFGB'], true, 'approved', 'Cookware, lighting and bedding for home retail.'),
  S('s6', 'Hangzhou Bloom Cosmetics', '杭州花漾化妆品有限公司', 'Hangzhou', 'Zhejiang', ['beauty'], 82, 5, 100, 90, 9, ['GMPC'], true, 'approved', 'Skincare OEM/ODM and small appliances for beauty.'),
  S('s7', 'Foshan Crown Furniture', '佛山皇冠家具有限公司', 'Foshan', 'Guangdong', ['home', 'business'], 90, 16, 5, 96, 4, ['ISO 9001', 'FSC'], true, 'approved', 'Upholstered and office furniture with flat-pack export.'),
  S('s8', 'Qingdao Northstar Industrial', '青岛北极星工业有限公司', 'Qingdao', 'Shandong', ['industrial', 'auto'], 85, 12, 20, 91, 7, ['ISO 9001'], true, 'approved', 'Storage systems, automotive accessories and steel products.'),
  S('s9', 'Xiamen Packwell Packaging', '厦门包润包装有限公司', 'Xiamen', 'Fujian', ['business'], 92, 10, 300, 99, 2, ['FSC', 'ISO 14001'], true, 'approved', 'Custom rigid boxes, magnetic gift boxes, shipping cartons and labels.'),
  S('s10', 'Wenzhou Stride Footwear', '温州步履鞋业有限公司', 'Wenzhou', 'Zhejiang', ['fashion', 'kids'], 78, 4, 60, 84, 14, [], false, 'pending', 'Sports and casual footwear. Verification documents under review.'),
];

type P = [string, CategoryId, string, number, number | undefined, string, number, number, Product['tags'], string[]];
const productRows: P[] = [
  ['Wireless Earbuds Pro ANC', 'electronics', 's1', 189, 229, 'Headphones', 0.2, 0.001, ['popular', 'price_drop'], ['earbuds', 'headphones', 'audio', 'наушники']],
  ['Smart Watch S9 AMOLED', 'electronics', 's1', 268, undefined, 'Watch', 0.25, 0.001, ['popular'], ['watch', 'smartwatch', 'часы']],
  ['65W GaN Fast Charger', 'electronics', 's1', 59, undefined, 'Plug', 0.15, 0.0005, [], ['charger', 'usb', 'зарядка']],
  ['Portable Bluetooth Speaker 20W', 'electronics', 's1', 145, 179, 'Speaker', 0.8, 0.003, ['price_drop'], ['speaker', 'bluetooth', 'колонка']],
  ['Mechanical Keyboard 75% Hot-swap', 'electronics', 's1', 239, undefined, 'Keyboard', 1.1, 0.006, [], ['keyboard', 'клавиатура']],
  ['4K Action Camera Waterproof', 'electronics', 's1', 399, undefined, 'Camera', 0.4, 0.002, ['popular'], ['camera', 'action', 'камера']],
  ['Leather Crossbody Bag', 'fashion', 's3', 168, undefined, 'ShoppingBag', 0.6, 0.004, ['popular'], ['bag', 'crossbody', 'leather', 'douyin', 'сумка']],
  ['Quilted Shoulder Bag Premium', 'fashion', 's3', 298, undefined, 'ShoppingBag', 0.7, 0.005, [], ['bag', 'shoulder', 'quilted', 'premium', 'сумка']],
  ['Canvas Mini Tote Bag', 'fashion', 's2', 49, undefined, 'ShoppingBag', 0.3, 0.002, [], ['bag', 'tote', 'canvas', 'сумка']],
  ['Wool Blend Overcoat', 'fashion', 's3', 420, undefined, 'Shirt', 1.4, 0.01, [], ['coat', 'overcoat', 'пальто']],
  ['Running Sneakers Air Mesh', 'fashion', 's10', 139, 169, 'Footprints', 0.9, 0.008, ['price_drop'], ['sneakers', 'shoes', 'кроссовки']],
  ['Polarized Sunglasses', 'fashion', 's3', 39, undefined, 'Glasses', 0.1, 0.0005, [], ['sunglasses', 'glasses', 'очки']],
  ['Ceramic Cookware Set 8 pcs', 'home', 's5', 356, undefined, 'CookingPot', 6.5, 0.04, ['popular'], ['cookware', 'pan', 'pot', 'посуда']],
  ['Nordic Floor Lamp', 'home', 's5', 189, undefined, 'Lamp', 4.2, 0.03, [], ['lamp', 'light', 'лампа']],
  ['Velvet Accent Armchair', 'home', 's7', 890, undefined, 'Armchair', 18, 0.35, [], ['armchair', 'chair', 'кресло']],
  ['Memory Foam Pillow (2 pcs)', 'home', 's5', 89, undefined, 'BedDouble', 1.6, 0.03, [], ['pillow', 'подушка']],
  ['Glass Storage Containers (10)', 'home', 's2', 69, undefined, 'Boxes', 3, 0.02, ['popular'], ['containers', 'storage', 'контейнеры']],
  ['Vitamin C Brightening Serum 30ml', 'beauty', 's6', 79, undefined, 'Droplet', 0.1, 0.0004, ['popular'], ['serum', 'skincare', 'сыворотка']],
  ['Ionic Hair Dryer 1800W', 'beauty', 's6', 159, 199, 'Sparkles', 0.9, 0.006, ['price_drop'], ['hair dryer', 'фен']],
  ['Skincare Gift Set', 'beauty', 's6', 229, undefined, 'Gift', 0.8, 0.005, [], ['gift', 'skincare', 'набор']],
  ['Building Blocks City Set 1200 pcs', 'kids', 's2', 199, undefined, 'Blocks', 1.8, 0.01, ['popular'], ['blocks', 'lego', 'toy', 'конструктор']],
  ['Kids Balance Bike', 'kids', 's2', 245, undefined, 'Bike', 4.5, 0.06, [], ['bike', 'velosiped', 'велосипед']],
  ['3D Educational Puzzle', 'kids', 's2', 45, undefined, 'Puzzle', 0.5, 0.003, [], ['puzzle', 'пазл']],
  ['4K Dual Dash Cam', 'auto', 's8', 219, undefined, 'Camera', 0.3, 0.002, ['popular'], ['dash cam', 'dashcam', 'видеорегистратор']],
  ['Car Jump Starter 2000A', 'auto', 's8', 265, undefined, 'BatteryCharging', 1, 0.004, [], ['jump starter', 'battery', 'пусковое']],
  ['Cordless Tire Inflator', 'auto', 's8', 129, undefined, 'Gauge', 0.7, 0.003, [], ['inflator', 'compressor', 'компрессор']],
  ['Cordless Drill 20V Kit', 'tools', 's4', 319, 369, 'Drill', 2.4, 0.012, ['price_drop', 'business'], ['drill', 'дрель']],
  ['Mechanic Tool Set 108 pcs', 'tools', 's4', 189, undefined, 'Wrench', 5.5, 0.015, [], ['tools', 'tool set', 'инструменты']],
  ['Laser Distance Meter 60m', 'tools', 's4', 99, undefined, 'Ruler', 0.3, 0.001, [], ['laser', 'meter', 'дальномер']],
  ['Industrial Shelving Unit 5-tier', 'industrial', 's8', 560, undefined, 'Warehouse', 32, 0.12, ['business'], ['shelving', 'rack', 'стеллаж']],
  ['Stainless Valve DN50 (lot of 10)', 'industrial', 's4', 780, undefined, 'Cog', 12, 0.03, ['business'], ['valve', 'клапан']],
  ['LED High Bay Light 150W', 'industrial', 's4', 168, undefined, 'Lightbulb', 2.2, 0.01, ['business'], ['led', 'light', 'светильник']],
  ['Magnetic Rigid Gift Box, Black (100)', 'business', 's9', 980, undefined, 'Package', 25, 0.4, ['business', 'popular'], ['box', 'boxes', 'magnetic', 'gift box', 'packaging', 'black', 'коробки']],
  ['Kraft Shipping Boxes (500)', 'business', 's9', 650, undefined, 'Boxes', 40, 0.6, ['business'], ['box', 'boxes', 'shipping', 'carton', 'коробки']],
  ['Thermal Label Printer', 'business', 's9', 289, undefined, 'Printer', 1.5, 0.008, ['business'], ['printer', 'label', 'принтер']],
  ['Ergonomic Office Chair', 'business', 's7', 560, undefined, 'Armchair', 14, 0.25, ['business'], ['chair', 'office', 'кресло']],
];

const REVIEW_TEXTS = [
  'Arrived in Ashgabat in 19 days, exactly as described.',
  'Good quality for the price. Final cost matched the estimate.',
  'Packaging was a bit dented but the product works perfectly.',
  'Bought a second one for my brother. Recommend.',
  'Supplier answered questions quickly through CARGO ONE support.',
  'Colour slightly different from photos, otherwise great.',
];
const NAMES = ['Aylar', 'Merdan', 'Gulnara', 'Serdar', 'Maral', 'Dovlet', 'Jeren', 'Batyr', 'Ogulgerek', 'Kerim', 'Selbi', 'Rustam'];
const CITIES = ['Ashgabat', 'Mary', 'Turkmenabat', 'Dashoguz', 'Balkanabat', 'Turkmenbashi'];

const SPEC_BY_CAT: Record<CategoryId, [string, string][]> = {
  electronics: [['Battery', '500 mAh'], ['Connectivity', 'Bluetooth 5.3'], ['Warranty', '12 months (supplier)'], ['Plug', 'EU type C']],
  fashion: [['Material', 'PU leather / cotton'], ['Sizes', 'S–XL'], ['Origin', 'Guangdong, CN']],
  home: [['Material', 'Ceramic / steel'], ['Care', 'Dishwasher safe'], ['Origin', 'Zhejiang, CN']],
  beauty: [['Volume', '30 ml'], ['Shelf life', '24 months'], ['Certification', 'GMPC']],
  kids: [['Age', '3+'], ['Certification', 'EN71'], ['Material', 'ABS plastic']],
  auto: [['Voltage', '12V'], ['Compatibility', 'Universal'], ['Warranty', '12 months']],
  tools: [['Voltage', '20V'], ['Battery', '2 × 2.0Ah Li-ion'], ['Warranty', '24 months']],
  industrial: [['Material', 'Steel Q235'], ['Load', '200 kg/shelf'], ['Standard', 'ISO 9001']],
  business: [['Material', '1200 gsm greyboard'], ['Customization', 'Logo printing available'], ['Lead time', '12–15 days']],
};
const VARIANTS_BY_CAT: Record<CategoryId, [string, number][]> = {
  electronics: [['Black', 0], ['White', 0], ['Graphite', 10]],
  fashion: [['Black', 0], ['Taupe', 0], ['Ivory', 12]],
  home: [['Standard', 0], ['Large', 40]],
  beauty: [['Standard', 0], ['Duo pack', 60]],
  kids: [['Standard', 0]],
  auto: [['Standard', 0], ['Pro', 45]],
  tools: [['Kit', 0], ['Tool only', -80]],
  industrial: [['Standard', 0]],
  business: [['Plain', 0], ['With logo', 180]],
};

function mkProduct(r: P, i: number, rnd: () => number, specs?: [string, string][]): Product {
  const pk = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const [title, categoryId, supplierId, priceCNY, oldPriceCNY, icon, weightKg, volumeM3, tags, keywords] = r;
  const sup = suppliers.find((s) => s.id === supplierId)!;
  const id = `p${i + 1}`;
  const reviews: ProductReview[] = Array.from({ length: 2 + (i % 3) }, (_, k) => ({
    id: `${id}-rv${k}`, author: `${pk(NAMES)} ${String.fromCharCode(65 + Math.floor(rnd() * 20))}.`, city: pk(CITIES),
    rating: 3 + Math.round(rnd() * 2), text: pk(REVIEW_TEXTS), date: ago(5 + Math.floor(rnd() * 120)),
  }));
  const rating = Math.round((reviews.reduce((s, x) => s + x.rating, 0) / reviews.length) * 10) / 10;
  const score = Math.round(sup.score * 0.6 + rating * 8);
  return {
    id, title, categoryId, supplierId, icon, priceCNY, oldPriceCNY,
    images: (['front', 'side', 'detail', 'pack'] as const).map((angle, k) => ({ id: `${id}-img${k}`, tone: (i * 37 + k * 11) % 100, angle, src: `img/products/${id}-${k}.webp` })),
    variants: VARIANTS_BY_CAT[categoryId].map(([name, d], k) => ({ id: `${id}-v${k}`, name, priceDeltaCNY: d, stock: 40 + Math.floor(rnd() * 500) })),
    specs: [...(specs || SPEC_BY_CAT[categoryId]), ['Weight', `${weightKg} kg`], ['Supplier SKU', `${sup.monogram}-${1000 + i * 7}`]],
    stock: 120 + Math.floor(rnd() * 3000), moq: categoryId === 'business' || categoryId === 'industrial' ? 1 : 1,
    leadDays: 2 + (i % 6), weightKg, volumeM3, score: Math.min(99, score), verified: sup.verified, published: true,
    featured: i % 7 === 0, rating, reviews, tags, popularityAshgabat: Math.round(rnd() * 1000), createdAt: ago(10 + i * 3), keywords,
    tryOn: TRY_ON[id],
  };
}

/** Products that can be previewed with the AR try-on (camera, photo or demo mannequin). */
export const TRY_ON: Record<string, TryOnKind> = {
  p1: 'earbuds', p2: 'watch', p7: 'bag', p10: 'coat', p11: 'shoes', p12: 'glasses', p37: 'headphones', p38: 'phonecase', p39: 'hoodie', p40: 'cap',
};
// Added later for the try-on (generated with their own seed so the rest of the demo data stays the same).
const extraRows: [P, [string, string][]][] = [
  [['Over-Ear Wireless Headphones ANC', 'electronics', 's1', 329, 389, 'Headphones', 0.45, 0.004, ['popular', 'price_drop'], ['headphones', 'over-ear', 'наушники', 'полноразмерные наушники', 'gulakçyn']],
    [['Battery', 'Up to 40 h (ANC off)'], ['Connectivity', 'Bluetooth 5.3, USB-C'], ['Noise cancelling', 'Hybrid ANC'], ['Warranty', '12 months (supplier)']]],
  [['Silicone Phone Case with MagSafe', 'electronics', 's1', 39, undefined, 'Smartphone', 0.06, 0.0004, [], ['phone case', 'case', 'чехол', 'чехол для телефона', 'telefon gaby']],
    [['Material', 'Liquid silicone, microfibre lining'], ['Fits', '6.1-inch phones'], ['MagSafe', 'Yes'], ['Drop protection', '1.5 m']]],
  [['Oversized Fleece Hoodie', 'fashion', 's3', 159, 189, 'Shirt', 0.7, 0.006, ['popular'], ['hoodie', 'sweatshirt', 'худи', 'толстовка', 'hudi']],
    [['Material', '80% cotton, 20% polyester fleece'], ['Sizes', 'S–XXL'], ['Fit', 'Oversized'], ['Origin', 'Guangdong, CN']]],
  [['Six-Panel Baseball Cap', 'fashion', 's3', 45, undefined, 'Shirt', 0.15, 0.003, [], ['cap', 'baseball cap', 'кепка', 'бейсболка', 'kepka']],
    [['Material', 'Cotton twill'], ['Size', 'Adjustable, 56–60 cm'], ['Origin', 'Guangdong, CN']]],
];
let seed2 = 9001;
const rnd2 = () => { seed2 = (seed2 * 1664525 + 1013904223) % 4294967296; return seed2 / 4294967296; };
export const products: Product[] = [
  ...productRows.map((r, i) => mkProduct(r, i, rnd)),
  ...extraRows.map(([r, specs], k) => mkProduct(r, productRows.length + k, rnd2, specs)),
];

// ---------- Users & businesses ----------
const U = (id: string, name: string, email: string, phone: string, role: User['role'], city: string, created: number, extra: Partial<User> = {}): User => ({
  id, name, email, phone, role, status: 'active', city, createdAt: ago(created), lastActiveAt: ago(Math.floor(created / 20)), ...extra,
});
export const users: User[] = [
  U('u1', 'Aylar Orazova', 'personal@cargo.one', '+99365000001', 'personal', 'Ashgabat', 210),
  U('u2', 'Merdan Atayev', 'business@cargo.one', '+99365000002', 'business', 'Ashgabat', 320, { businessId: 'b1' }),
  U('u3', 'Li Wei', 'supplier@cargo.one', '+8613800000003', 'supplier', 'Shenzhen', 400, { supplierId: 's1' }),
  U('u4', 'Operations Admin', 'admin@cargo.one', '+99365000004', 'admin', 'Ashgabat', 500),
  U('u5', 'Gulnara Hojayeva', 'gulnara@example.tm', '+99365112233', 'personal', 'Mary', 95),
  U('u6', 'Serdar Nurmuhammedov', 'serdar@altyn-trade.tm', '+99365223344', 'business', 'Turkmenabat', 180, { businessId: 'b2' }),
  U('u7', 'Maral Annayeva', 'maral@example.tm', '+99365334455', 'personal', 'Ashgabat', 60),
  U('u8', 'Batyr Gurbanov', 'batyr@ahal-build.tm', '+99365445566', 'business', 'Ashgabat', 240, { businessId: 'b3' }),
  U('u9', 'Jeren Saparova', 'jeren@example.tm', '+99365556677', 'personal', 'Dashoguz', 30, { status: 'suspended' }),
  U('u10', 'Kerim Berdiyev', 'kerim@lebap-auto.tm', '+99365667788', 'business', 'Turkmenabat', 150, { businessId: 'b4' }),
  U('u11', 'Selbi Amanova', 'selbi@beauty-house.tm', '+99365778899', 'business', 'Ashgabat', 75, { businessId: 'b5' }),
];
export const businesses: BusinessProfile[] = [
  { id: 'b1', userId: 'u2', companyName: 'Atayev Retail HJ', taxId: 'TM-1029384', city: 'Ashgabat', industry: 'Retail & packaging', monthlyVolumeUSD: 42000, verified: true },
  { id: 'b2', userId: 'u6', companyName: 'Altyn Trade', taxId: 'TM-2039485', city: 'Turkmenabat', industry: 'Electronics distribution', monthlyVolumeUSD: 68000, verified: true },
  { id: 'b3', userId: 'u8', companyName: 'Ahal Build Supply', taxId: 'TM-3048576', city: 'Ashgabat', industry: 'Construction tools', monthlyVolumeUSD: 55000, verified: true },
  { id: 'b4', userId: 'u10', companyName: 'Lebap Auto Parts', taxId: 'TM-4057667', city: 'Turkmenabat', industry: 'Auto parts', monthlyVolumeUSD: 23000, verified: false },
  { id: 'b5', userId: 'u11', companyName: 'Beauty House TM', taxId: 'TM-5066758', city: 'Ashgabat', industry: 'Cosmetics retail', monthlyVolumeUSD: 15000, verified: true },
];

export const addresses: Address[] = [
  { id: 'a1', userId: 'u1', name: 'Aylar Orazova', phone: '+99365000001', city: 'Ashgabat', district: 'Bagtyyarlyk', street: 'Atatürk street', building: '82', apartment: '14', info: 'Entrance from the courtyard', isDefault: true },
  { id: 'a2', userId: 'u1', name: 'Aylar Orazova', phone: '+99365000001', city: 'Mary', district: 'Center', street: 'Magtymguly avenue', building: '5', apartment: '', info: 'Parents’ house', isDefault: false },
  { id: 'a3', userId: 'u2', name: 'Atayev Retail HJ', phone: '+99365000002', city: 'Ashgabat', district: 'Berkararlyk', street: 'Garashsyzlyk avenue', building: '41', apartment: 'Office 3', info: 'Warehouse gate B, weekdays 9–18', isDefault: true },
];

export const paymentMethods: PaymentMethod[] = [
  { id: 'pm1', userId: 'u1', type: 'card', label: 'Altyn Asyr card', brand: 'Altyn Asyr', last4: '4417', token: 'tok_mock_aa_4417', isDefault: true, expires: '09/28' },
  { id: 'pm2', userId: 'u1', type: 'wallet', label: 'CARGO ONE Wallet', token: 'tok_mock_wallet_u1', isDefault: false },
  { id: 'pm3', userId: 'u2', type: 'card', label: 'Visa Business', brand: 'Visa', last4: '1881', token: 'tok_mock_visa_1881', isDefault: true, expires: '03/29' },
  { id: 'pm4', userId: 'u2', type: 'settlement', label: 'Partner bank settlement account', token: 'tok_mock_settle_b1', isDefault: false },
  { id: 'pm5', userId: 'u2', type: 'partner', label: 'Partner payment (bank transfer)', token: 'tok_mock_partner_b1', isDefault: false },
];

// ---------- Orders, payments, shipments ----------
export const STAGES: ShipmentStage[] = ['order_created', 'payment_confirmed', 'supplier_confirmed', 'production', 'china_warehouse', 'consolidated', 'departed_china', 'in_transit', 'customs', 'arrived_tm', 'local_hub', 'out_for_delivery', 'delivered'];
const STAGE_LOC: Record<ShipmentStage, string> = {
  order_created: 'CARGO ONE', payment_confirmed: 'CARGO ONE', supplier_confirmed: 'Supplier, CN', production: 'Supplier factory, CN',
  china_warehouse: 'Yiwu Hub, CN', consolidated: 'Yiwu Hub, CN', departed_china: 'Khorgos border, CN', in_transit: 'Almaty – Tashkent rail corridor',
  customs: 'Farap customs, TM', arrived_tm: 'Farap, TM', local_hub: 'Ashgabat Hub, TM', out_for_delivery: 'Ashgabat, TM', delivered: 'Recipient',
};
export const stageLocation = (s: ShipmentStage) => STAGE_LOC[s];
export function eventsUpTo(stage: ShipmentStage, startDaysAgo: number, idPrefix: string): ShipmentEvent[] {
  const idx = STAGES.indexOf(stage);
  const span = Math.max(1, startDaysAgo);
  return STAGES.slice(0, idx + 1).map((st, i) => ({
    id: `${idPrefix}-e${i}`, stage: st, at: ago(Math.max(0, span - (span * i) / Math.max(1, idx)), 9 + (i % 8)), location: STAGE_LOC[st], note: '',
  }));
}

const ORDER_ROWS: [string, string, [number, number][], Order['status'], ShipmentStage | null, number, Order['source']][] = [
  // [orderId, userId, [[productIndex, qty]], status, shipmentStage, daysAgo, source]
  ['o1', 'u1', [[1, 1], [12, 1]], 'delivered', 'delivered', 34, 'shop'],
  ['o2', 'u1', [[7, 1]], 'shipped', 'in_transit', 15, 'find'],
  ['o3', 'u1', [[18, 2], [21, 1]], 'processing', 'production', 4, 'shop'],
  ['o4', 'u1', [[24, 1]], 'paid', 'china_warehouse', 7, 'shop'],
  ['o5', 'u1', [[3, 1]], 'paid', 'china_warehouse', 6, 'shop'],
  ['o6', 'u1', [[10, 1]], 'cancelled', null, 50, 'shop'],
  ['o7', 'u2', [[33, 3], [35, 1]], 'shipped', 'customs', 20, 'ai_buyer'],
  ['o8', 'u2', [[34, 2]], 'delivered', 'delivered', 60, 'repeat'],
  ['o9', 'u2', [[27, 6], [28, 4]], 'shipped', 'departed_china', 12, 'shop'],
  ['o10', 'u2', [[30, 2]], 'processing', 'supplier_confirmed', 3, 'shop'],
  ['o11', 'u6', [[1, 40], [2, 20]], 'shipped', 'arrived_tm', 18, 'shop'],
  ['o12', 'u5', [[19, 1]], 'delivered', 'delivered', 45, 'shop'],
  ['o13', 'u8', [[29, 12], [32, 40]], 'paid', 'production', 5, 'shop'],
  ['o14', 'u7', [[14, 1]], 'pending_payment', null, 1, 'shop'],
  ['o15', 'u11', [[18, 60], [20, 20]], 'shipped', 'local_hub', 22, 'group_buy'],
  ['o16', 'u10', [[25, 10], [26, 10]], 'delivered', 'delivered', 70, 'shop'],
];

export const orders: Order[] = [];
export const payments: Payment[] = [];
export const shipments: Shipment[] = [];
export const packages: CargoPackage[] = [];

const userAddressText = (uid: string) => {
  const a = addresses.find((x) => x.userId === uid && x.isDefault);
  return a ? `${a.city}, ${a.street} ${a.building}${a.apartment ? ', ' + a.apartment : ''}` : 'Ashgabat, Hub pickup';
};

ORDER_ROWS.forEach(([oid, uid, lines, status, stage, days, source], idx) => {
  const items = lines.map(([pi, qty]) => { const p = products[pi - 1]; return { productId: p.id, variantId: p.variants[0].id, title: p.title, qty, unitPriceCNY: p.priceCNY, supplierId: p.supplierId }; });
  const costs = estimateLines(lines.map(([pi, qty]) => ({ unitCNY: products[pi - 1].priceCNY, qty, weightKg: products[pi - 1].weightKg, volumeM3: products[pi - 1].volumeM3 })), DEFAULT_SETTINGS, {});
  const number = `CO-${10021 + idx * 7}`;
  const order: Order = {
    id: oid, number, userId: uid, items, status, addressText: userAddressText(uid), addressId: addresses.find((a) => a.userId === uid && a.isDefault)?.id,
    delivery: idx % 5 === 0 ? 'express' : 'standard', costs, createdAt: ago(days), supplierStatus: status === 'pending_payment' || status === 'cancelled' ? 'awaiting' : 'accepted',
    documents: status === 'pending_payment' ? [] : [`Commercial invoice ${number}.pdf`, `Packing list ${number}.pdf`], source,
  };
  if (status !== 'pending_payment') {
    const pay: Payment = {
      id: `pay-${oid}`, userId: uid, kind: 'order', refId: oid, amount: costs.totalTMT, currency: 'TMT', feeTMT: costs.serviceTMT,
      status: status === 'cancelled' ? 'refunded' : 'succeeded', methodLabel: uid === 'u1' ? 'Altyn Asyr •••• 4417' : 'Visa •••• 1881', createdAt: ago(days), processedAt: ago(days - 0.01),
    };
    payments.push(pay); order.paymentId = pay.id;
  }
  if (stage) {
    const shId = `sh${shipments.length + 1}`;
    const pkgs: CargoPackage[] = items.map((it, k) => {
      const p = products.find((x) => x.id === it.productId)!;
      return { id: `${shId}-pk${k}`, orderId: oid, userId: uid, label: it.title, weightKg: Math.round(p.weightKg * it.qty * 10) / 10, volumeM3: Math.round(p.volumeM3 * it.qty * 1000) / 1000, status: STAGES.indexOf(stage) >= 5 ? 'consolidated' : 'received', warehouseId: 'w1', receivedAt: ago(days - 2) };
    });
    const weightKg = Math.round(pkgs.reduce((s, p) => s + p.weightKg, 0) * 10) / 10;
    const sh: Shipment = {
      id: shId, trackingNumber: `C1TM${(820450 + idx * 1311).toString()}`, userId: uid, orderIds: [oid],
      supplierName: suppliers.find((s) => s.id === items[0].supplierId)!.name, warehouseId: 'w1', packages: pkgs,
      weightKg, volumeM3: Math.round(pkgs.reduce((s, p) => s + p.volumeM3, 0) * 1000) / 1000,
      eta: stage === 'delivered' ? ago(days - 21) : ahead(Math.max(2, 22 - (STAGES.indexOf(stage) * 2))), costTMT: costs.cargoTMT, stage,
      carrier: idx % 3 === 0 ? 'TransCaspian Rail' : idx % 3 === 1 ? 'Silk Way Trucking' : 'Turkmen Cargo Lines', mode: idx % 5 === 0 ? 'air' : idx % 3 === 1 ? 'truck' : 'rail',
      destination: order.addressText, documents: ['Commercial invoice.pdf', 'Packing list.pdf', ...(STAGES.indexOf(stage) >= 8 ? ['Customs declaration.pdf'] : [])],
      events: eventsUpTo(stage, days, shId), createdAt: ago(days), kind: 'goods',
    };
    shipments.push(sh); packages.push(...pkgs); order.shipmentId = shId;
  }
  orders.push(order);
});

// Packages received in Yiwu awaiting consolidation (for the consolidation flow).
['o4', 'o5'].forEach((oid) => {
  const o = orders.find((x) => x.id === oid)!;
  const sh = shipments.find((s) => s.id === o.shipmentId)!;
  sh.packages.forEach((p) => (p.status = 'received'));
});
const extraOrder: Order = {
  id: 'o17', number: 'CO-10140', userId: 'u1', items: [{ productId: 'p17', variantId: 'p17-v0', title: products[16].title, qty: 1, unitPriceCNY: products[16].priceCNY, supplierId: 's2' }],
  status: 'paid', addressText: userAddressText('u1'), addressId: 'a1', delivery: 'standard', costs: estimateLines([{ unitCNY: products[16].priceCNY, qty: 1, weightKg: 3, volumeM3: 0.02 }], DEFAULT_SETTINGS),
  createdAt: ago(5), supplierStatus: 'accepted', documents: ['Commercial invoice CO-10140.pdf'], source: 'shop', paymentId: 'pay-o17',
};
orders.push(extraOrder);
payments.push({ id: 'pay-o17', userId: 'u1', kind: 'order', refId: 'o17', amount: extraOrder.costs.totalTMT, currency: 'TMT', feeTMT: extraOrder.costs.serviceTMT, status: 'succeeded', methodLabel: 'Altyn Asyr •••• 4417', createdAt: ago(5), processedAt: ago(5) });
packages.push({ id: 'pk-o17', orderId: 'o17', userId: 'u1', label: products[16].title, weightKg: 3, volumeM3: 0.02, status: 'received', warehouseId: 'w1', receivedAt: ago(2) });

// ---------- Supplier invoices ----------
export const invoices: Invoice[] = [
  { id: 'inv1', userId: 'u2', customerName: 'Atayev Retail HJ', supplierName: 'Xiamen Packwell Packaging', invoiceNumber: 'PW-2026-0918', invoiceDate: ago(12).slice(0, 10), amount: 48600, currency: 'CNY', beneficiary: 'Xiamen Packwell Packaging Co., Ltd.', bankName: 'Bank of China, Xiamen Branch', account: '•••• •••• 7781', swift: 'BKCHCNBJ73A', orderRef: 'PO-ATR-3391', fileName: 'PW-2026-0918.pdf', status: 'paid', serviceFeeTMT: 476.28, settlementCostTMT: 235.51, totalTMT: 24525.79, createdAt: ago(12), submittedAt: ago(12), processedAt: ago(10), kycConfirmed: true },
  { id: 'inv2', userId: 'u2', customerName: 'Atayev Retail HJ', supplierName: 'Foshan Crown Furniture', invoiceNumber: 'FC-88213', invoiceDate: ago(3).slice(0, 10), amount: 6200, currency: 'USD', beneficiary: 'Foshan Crown Furniture Co., Ltd.', bankName: 'ICBC Foshan', account: '•••• •••• 0042', swift: 'ICBKCNBJGDG', orderRef: 'PO-ATR-3402', fileName: 'FC-88213.pdf', status: 'under_review', serviceFeeTMT: 434, settlementCostTMT: 218.6, totalTMT: 22352.6, createdAt: ago(1), submittedAt: ago(1), kycConfirmed: true },
  { id: 'inv3', userId: 'u2', customerName: 'Atayev Retail HJ', supplierName: 'Dongguan Precision Tools', invoiceNumber: 'DPT-5520', invoiceDate: ago(30).slice(0, 10), amount: 19800, currency: 'CNY', beneficiary: 'Dongguan Precision Tools Co., Ltd.', bankName: 'China Construction Bank', account: '•••• •••• 3310', swift: 'PCBCCNBJGDX', orderRef: 'PO-ATR-3315', fileName: 'DPT-5520.pdf', status: 'failed', serviceFeeTMT: 194.04, settlementCostTMT: 122.62, totalTMT: 10018.66, createdAt: ago(30), submittedAt: ago(30), processedAt: ago(29), failureReason: 'Beneficiary name did not match bank records. Please upload a corrected invoice.', kycConfirmed: true },
  { id: 'inv4', userId: 'u6', customerName: 'Altyn Trade', supplierName: 'Shenzhen Lumen Electronics', invoiceNumber: 'SLE-77120', invoiceDate: ago(8).slice(0, 10), amount: 124000, currency: 'CNY', beneficiary: 'Shenzhen Lumen Electronics Co., Ltd.', bankName: 'China Merchants Bank', account: '•••• •••• 9902', swift: 'CMBCCNBS', orderRef: 'AT-PO-1180', fileName: 'SLE-77120.pdf', status: 'processing', serviceFeeTMT: 1215.2, settlementCostTMT: 531.08, totalTMT: 62506.28, createdAt: ago(2), submittedAt: ago(2), kycConfirmed: true },
  { id: 'inv5', userId: 'u8', customerName: 'Ahal Build Supply', supplierName: 'Qingdao Northstar Industrial', invoiceNumber: 'QN-4410', invoiceDate: ago(40).slice(0, 10), amount: 8800, currency: 'USD', beneficiary: 'Qingdao Northstar Industrial Co., Ltd.', bankName: 'Bank of Qingdao', account: '•••• •••• 6620', swift: 'QCCBCNBQ', orderRef: 'AB-771', fileName: 'QN-4410.pdf', status: 'refunded', serviceFeeTMT: 616, settlementCostTMT: 291.4, totalTMT: 31707.4, createdAt: ago(40), submittedAt: ago(40), processedAt: ago(38), failureReason: 'Supplier cancelled the order; funds returned.', kycConfirmed: true },
];
for (const inv of invoices) {
  payments.push({
    id: `pay-${inv.id}`, userId: inv.userId, kind: 'supplier_invoice', refId: inv.id, amount: inv.amount, currency: inv.currency, feeTMT: inv.serviceFeeTMT,
    status: inv.status === 'paid' ? 'succeeded' : inv.status === 'failed' ? 'failed' : inv.status === 'refunded' ? 'refunded' : 'processing',
    methodLabel: 'Partner settlement', createdAt: inv.createdAt, processedAt: inv.processedAt, failureReason: inv.failureReason,
  });
  inv.paymentId = `pay-${inv.id}`;
}

// ---------- Vehicles & inspections ----------
const BASE_POINTS: Record<InspectionItemKey, number> = {
  vin: 1, documents: 2, ownership: 1, accident: 2, mileage: 1, body: 4, paint: 3, engine: 4, transmission: 3, suspension: 3, brakes: 3,
  electronics: 3, ac: 2, tires: 2, lights: 2, interior: 2, diagnostics: 2, road_test: 2, ev_battery: 3, charging: 2,
};
export const INSPECTION_KEYS = Object.keys(BASE_POINTS) as InspectionItemKey[];
export const inspectionPoints = (k: InspectionItemKey) => BASE_POINTS[k];

export function buildInspectionItems(isEv: boolean, notes: Partial<Record<InspectionItemKey, string>>, fails: Partial<Record<InspectionItemKey, string>> = {}): CarInspectionItem[] {
  return INSPECTION_KEYS.map((key) => {
    const applicable = isEv || (key !== 'ev_battery' && key !== 'charging');
    if (!applicable) return { key, status: 'na' as const, points: BASE_POINTS[key] };
    if (fails[key]) return { key, status: 'fail' as const, note: fails[key], points: BASE_POINTS[key] };
    if (notes[key]) return { key, status: 'note' as const, note: notes[key], points: BASE_POINTS[key] };
    return { key, status: 'ok' as const, points: BASE_POINTS[key] };
  });
}
const CRITICAL: InspectionItemKey[] = ['vin', 'documents', 'accident', 'engine', 'transmission', 'ev_battery'];
export function scoreInspection(items: CarInspectionItem[]): { score: number; result: CarInspection['result']; checks: number } {
  const applicable = items.filter((i) => i.status !== 'na');
  const max = applicable.reduce((s, i) => s + i.points, 0);
  const got = applicable.reduce((s, i) => s + (i.status === 'ok' ? i.points : i.status === 'note' ? i.points * 0.6 : 0), 0);
  const score = Math.round((got / max) * 100);
  const criticalFail = applicable.some((i) => i.status === 'fail' && CRITICAL.includes(i.key));
  const result = criticalFail || score < 70 ? 'failed' : applicable.some((i) => i.status !== 'ok') ? 'passed_notes' : 'passed';
  return { score, result, checks: max };
}

type CarRow = [string, string, string, number, Car['condition'], Car['fuel'], Car['body'], number, number, Car['drive'], string, Car['accident'], number, Car['verification'], boolean, number?, number?, number?];
const CAR_ROWS: CarRow[] = [
  ['c1', 'BYD', 'Seal AWD Performance', 2024, 'used', 'ev', 'sedan', 18500, 23900, 'awd', 'Arctic Blue', 'none', 1, 'verified', false, 82.5, 97, 520],
  ['c2', 'BYD', 'Song Plus DM-i', 2023, 'used', 'hybrid', 'suv', 31000, 18400, 'fwd', 'Graphite Grey', 'minor', 1, 'verified', false],
  ['c3', 'Geely', 'Galaxy E5', 2025, 'new', 'ev', 'suv', 0, 19800, 'fwd', 'Pearl White', 'none', 0, 'not_inspected', false, 60.2, 100, 440],
  ['c4', 'Zeekr', '001 Long Range', 2023, 'used', 'ev', 'hatch', 42000, 29500, 'awd', 'Matte Black', 'none', 1, 'verified', false, 100, 94, 620],
  ['c5', 'Li Auto', 'L7 Pro', 2023, 'used', 'hybrid', 'suv', 38000, 27800, 'awd', 'Silver', 'none', 1, 'verified', false],
  ['c6', 'Chery', 'Tiggo 8 Pro', 2022, 'used', 'petrol', 'suv', 61000, 12900, 'fwd', 'Black', 'minor', 2, 'verified', false],
  ['c7', 'Changan', 'UNI-V 1.5T', 2023, 'used', 'petrol', 'sedan', 27000, 13500, 'fwd', 'Red', 'none', 1, 'verified', false],
  ['c8', 'NIO', 'ET5 75 kWh', 2023, 'used', 'ev', 'sedan', 35000, 24200, 'awd', 'Cloud White', 'none', 1, 'verified', false, 75, 92, 500],
  ['c9', 'Haval', 'H6 2.0T', 2021, 'used', 'petrol', 'suv', 89000, 9800, 'fwd', 'White', 'major', 3, 'rejected', false],
  ['c10', 'Great Wall', 'Poer Diesel 4×4', 2022, 'used', 'diesel', 'pickup', 54000, 14600, 'awd', 'Sand', 'none', 1, 'verified', true],
  ['c11', 'Wuling', 'Hongguang Cargo Van', 2023, 'used', 'petrol', 'van', 22000, 7900, 'rwd', 'White', 'none', 1, 'verified', true],
  ['c12', 'BYD', 'Dolphin 44.9 kWh', 2024, 'used', 'ev', 'hatch', 9000, 11900, 'fwd', 'Coral Pink', 'none', 1, 'pending', false, 44.9, 99, 340],
  ['c13', 'BYD', 'Atto 3 Extended', 2025, 'new', 'ev', 'suv', 0, 21500, 'fwd', 'Surf Blue', 'none', 0, 'not_inspected', false, 60.5, 100, 420],
  ['c14', 'Toyota', 'bZ3 Elite', 2024, 'used', 'ev', 'sedan', 15000, 17200, 'fwd', 'Platinum', 'none', 1, 'verified', false, 65.3, 96, 480],
];
const INSPECTORS = [['Arslan Myradov', 'INS-014'], ['Zhang Hao', 'INS-021'], ['Wang Jie', 'INS-009']];
const INSPECTION_NOTES: Record<string, [Partial<Record<InspectionItemKey, string>>, Partial<Record<InspectionItemKey, string>>?]> = {
  c1: [{ tires: 'Rear tyres at 5 mm tread, replace within 15,000 km.' }],
  c2: [{ paint: 'Rear bumper repainted (180 µm). Minor parking damage repaired.', accident: 'Minor rear impact recorded 2024, repaired at dealer.', interior: 'Light wear on driver seat bolster.' }],
  c4: [{ tires: 'Front tyres at 4 mm tread.', interior: 'Small scratch on centre console trim.' }],
  c5: [{ ac: 'Cabin filter due for replacement.', suspension: 'Front stabiliser link bushing worn, replace at next service.' }],
  c6: [{ paint: 'Front left door repainted (210 µm).', accident: 'Minor side contact 2023, repaired.', brakes: 'Front pads at 30%.', tires: 'Mixed tyre brands on rear axle.' }],
  c7: [{ lights: 'Rear fog lamp bulb replaced during inspection.', tires: 'Tyres 4 years old.' }],
  c8: [{ ev_battery: 'Battery SOH 92% — within expected range for age.', interior: 'Headliner mark near rear door.' }],
  c9: [{ body: 'Corrosion on rear wheel arches.', interior: 'Heavy wear on seats.' }, { accident: 'Structural damage: right chassis rail repaired after frontal collision.', transmission: 'Harsh 2→3 shift, DCT clutch slip detected.' }],
  c10: [{ body: 'Bed liner scratches from use.', suspension: 'Rear leaf spring bushings worn.' }],
  c11: [{ interior: 'Cargo area floor scuffs.', tires: 'Spare tyre missing.' }],
  c14: [{}],
};
export const cars: Car[] = [];
export const inspections: CarInspection[] = [];
CAR_ROWS.forEach(([id, brand, model, year, condition, fuel, body, mileageKm, priceUSD, drive, color, accident, owners, verification, commercial, batteryKwh, batteryHealth, rangeKm], i) => {
  const vin = `LGX${['C', 'D', 'E', 'F'][i % 4]}${(4471000 + i * 1337).toString(36).toUpperCase().padEnd(6, '0')}${2020 + (year % 10)}${(10000 + i * 731).toString().slice(-5)}`.slice(0, 17).padEnd(17, '0');
  const car: Car = {
    id, brand, model, year, condition, fuel, body, commercial, mileageKm, priceUSD, batteryKwh, batteryHealth, rangeKm, drive, color, accident, owners,
    verification, published: true, location: ['Guangzhou', 'Shanghai', 'Hefei', 'Ningbo', 'Shenzhen', 'Chengdu'][i % 6], vin,
    images: (['front', 'side', 'rear', 'interior'] as const).map((view, k) => ({ id: `${id}-im${k}`, tone: (i * 23 + k * 7) % 100, view, src: `img/cars/${id}-${k}.webp` })), createdAt: ago(3 + i * 4),
  };
  const notes = INSPECTION_NOTES[id];
  if (notes) {
    const items = buildInspectionItems(fuel === 'ev', notes[0], notes[1] || {});
    const { score, result } = scoreInspection(items);
    const [inspector, inspectorId] = INSPECTORS[i % 3];
    const insp: CarInspection = {
      id: `i-${id}`, carId: id, vin, date: ago(4 + i * 3).slice(0, 10), inspector, inspectorId, score, result, items,
      photos: 64 + (i % 5) * 12, videoMinutes: 6 + (i % 4), paintMicrons: notes[0].paint ? [95, 210] : [92, 128],
      summary: result === 'failed' ? 'Vehicle does not meet CARGO ONE verification standard.' : result === 'passed_notes' ? 'Passed with notes. Items listed below are disclosed in full.' : 'Passed. No material issues found.',
      location: `${car.location} inspection bay`,
    };
    inspections.push(insp);
    car.inspectionId = insp.id;
    if (result === 'failed') car.verification = 'rejected';
  }
  cars.push(car);
});

export const reservations: CarReservation[] = [
  { id: 'r1', number: 'AUTO-5012', carId: 'c2', userId: 'u1', depositUSD: 1000, paymentId: 'pay-r1', step: 'shipping', createdAt: ago(16), history: (['select', 'inspection_view', 'reserve', 'payment', 'china_docs', 'pre_ship_inspection', 'shipping'] as const).map((step, k) => ({ step, at: ago(16 - k * 2) })) },
];
cars.find((c) => c.id === 'c2')!.reservedBy = 'u1';
payments.push({ id: 'pay-r1', userId: 'u1', kind: 'auto_reservation', refId: 'r1', amount: 1000, currency: 'USD', feeTMT: 0, status: 'succeeded', methodLabel: 'Altyn Asyr •••• 4417', createdAt: ago(14), processedAt: ago(14) });
shipments.push({
  id: 'sh-auto1', trackingNumber: 'C1AUTO5012', userId: 'u1', orderIds: [], supplierName: 'BYD dealer, Guangzhou', warehouseId: 'w2', packages: [], weightKg: 1940, volumeM3: 12.4,
  eta: ahead(9), costTMT: 2200 * 3.5, stage: 'departed_china', carrier: 'TransCaspian Rail (car carrier)', mode: 'rail', destination: 'Ashgabat Hub, TM',
  documents: ['Vehicle export certificate.pdf', 'Inspection report i-c2.pdf', 'Bill of lading.pdf'], events: eventsUpTo('departed_china', 14, 'sh-auto1'), createdAt: ago(14), kind: 'vehicle',
});

// ---------- Group buys ----------
const GB = (id: string, pi: number, tiers: [number, number][], current: number, target: number, endsInDays: number, status: GroupBuy['status']): GroupBuy => ({
  id, productId: `p${pi}`, title: products[pi - 1].title, tiers: tiers.map(([qty, priceCNY]) => ({ qty, priceCNY })), currentQty: current, targetQty: target,
  endsAt: ahead(endsInDays), status, createdAt: ago(10), participants: Array.from({ length: Math.min(12, Math.ceil(current / 4)) }, (_, k) => ({ userId: `ext${k}`, name: `${NAMES[k % NAMES.length]} ${String.fromCharCode(65 + k)}.`, qty: Math.max(1, Math.round(current / Math.ceil(current / 4))), joinedAt: ago(9 - k * 0.6) })),
});
export const groupBuys: GroupBuy[] = [
  GB('g1', 1, [[1, 189], [10, 165], [50, 142], [100, 128]], 63, 100, 4, 'open'),
  GB('g2', 21, [[1, 199], [10, 176], [50, 158], [100, 145]], 38, 50, 6, 'open'),
  GB('g3', 13, [[1, 356], [10, 318], [30, 289]], 12, 30, 9, 'open'),
  GB('g4', 18, [[1, 100], [10, 85], [50, 72], [100, 65]], 104, 100, -2, 'completed'),
  GB('g5', 27, [[1, 319], [20, 279], [60, 249]], 9, 60, 12, 'open'),
];

// ---------- VIP & promotions ----------
export const vipSubscriptions: VIPSubscription[] = [
  { userId: 'u2', status: 'active', startedAt: ago(70), renewsAt: ahead(20), priceTMT: 150, autoRenew: true, paymentIds: [] },
  { userId: 'u6', status: 'active', startedAt: ago(30), renewsAt: ahead(0.5), priceTMT: 150, autoRenew: true, paymentIds: [] },
  { userId: 'u11', status: 'cancelled', startedAt: ago(45), renewsAt: ahead(15), priceTMT: 150, autoRenew: false, paymentIds: [] },
];
const month = new Date(NOW).toLocaleString('en', { month: 'long' });
export const promotions: Promotion[] = [
  { id: 'pr1', kind: 'vip_campaign', name: `VIP ${month} Campaign`, prize: 'iPhone 17 Pro 256 GB', prizeCount: 3, startsAt: ago(7), endsAt: ahead(23), eligibility: 'Active VIP members aged 18+ residing in Turkmenistan.', rules: '1. Active VIP members receive one entry for the month automatically.\n2. Each completed order adds one extra entry (max 5 per month).\n3. A free entry is available on request through Support without purchase.\n4. Winners are selected by a recorded random draw within 5 days after the end date and announced in the app.\n5. Prizes are delivered to the Ashgabat Hub. No cash alternative.\n6. Subject to applicable promotion laws; CARGO ONE may cancel the campaign if required.', status: 'active', headline: 'Win the latest iPhone this month',
    i18n: {
      ru: { name: `VIP-кампания месяца`, headline: 'Выиграйте новый iPhone в этом месяце', eligibility: 'Активные VIP-участники от 18 лет, проживающие в Туркменистане.', rules: '1. Активные VIP-участники получают одно участие в месяц автоматически.\n2. Каждый завершённый заказ добавляет ещё одно участие (максимум 5 в месяц).\n3. Бесплатное участие без покупки доступно по запросу в поддержку.\n4. Победители определяются записанным случайным розыгрышем в течение 5 дней после окончания и объявляются в приложении.\n5. Призы выдаются на складе в Ашхабаде. Денежная замена не предусмотрена.\n6. Кампания проводится в соответствии с законодательством; CARGO ONE может отменить её при необходимости.' },
      tk: { name: `Aýyň VIP kampaniýasy`, headline: 'Şu aý iň täze iPhone utuň', eligibility: 'Türkmenistanda ýaşaýan 18 ýaşdan uly işjeň VIP agzalary.', rules: '1. Işjeň VIP agzalary her aý awtomatik bir gatnaşyk alýar.\n2. Her tamamlanan sargyt ýene bir gatnaşyk goşýar (aýda iň köp 5).\n3. Satyn almazdan mugt gatnaşmak goldaw arkaly elýeterli.\n4. Ýeňijiler gutarandan soň 5 günüň dowamynda ýazga alnan tötänleýin bijeleşik bilen saýlanýar we programmada yglan edilýär.\n5. Baýraklar Aşgabat ammarynda berilýär. Pul görnüşinde çalşylmaýar.\n6. Kampaniýa kanunçylyga laýyklykda geçirilýär; CARGO ONE zerur bolsa ony ýatyryp biler.' },
    } },
  { id: 'pr2', kind: 'vip_campaign', name: 'VIP Summer Campaign', prize: 'MacBook Air 13"', prizeCount: 1, startsAt: ago(100), endsAt: ago(70), eligibility: 'Active VIP members.', rules: 'Ended. Winner announced in app.', status: 'ended' },
  { id: 'pr3', kind: 'vip_campaign', name: 'VIP New Year Campaign', prize: 'Geely Galaxy E5 voucher (USD 2,000)', prizeCount: 2, startsAt: ahead(60), endsAt: ahead(90), eligibility: 'Active VIP members.', rules: 'Draft rules — to be confirmed by legal.', status: 'draft' },
  { id: 'pr4', kind: 'price_drop', name: 'Audio week', discountPct: 15, productIds: ['p1', 'p4'], startsAt: ago(3), endsAt: ahead(4), eligibility: 'All customers', rules: 'Discount applied at checkout.', status: 'active' },
  { id: 'pr5', kind: 'banner', name: 'Rail cargo every Tuesday', headline: 'Rail consolidation departs every Tuesday from Yiwu', startsAt: ago(30), endsAt: ahead(60), eligibility: 'All', rules: '', status: 'active' },
  { id: 'pr6', kind: 'discount', name: 'First order −10% service fee', discountPct: 10, startsAt: ago(30), endsAt: ahead(30), eligibility: 'New customers', rules: 'Applies to service fee on first order.', status: 'active' },
];
export const promotionEntries: PromotionEntry[] = [
  { id: 'pe1', promotionId: 'pr1', userId: 'u2', entries: 3, createdAt: ago(6), source: 'vip_monthly' },
  { id: 'pe2', promotionId: 'pr1', userId: 'u6', entries: 2, createdAt: ago(5), source: 'vip_monthly' },
];

// ---------- Notifications ----------
const N = (id: string, userId: string, type: AppNotification['type'], key: string, params: AppNotification['params'], link: string | undefined, days: number, read: boolean): AppNotification => ({ id, userId, type, key, params, link, read, createdAt: ago(days) });
export const notifications: AppNotification[] = [
  N('n1', 'u1', 'cargo', 'cargo_stage', { tracking: 'C1TM821761', stage: 'in_transit' }, '/track?q=C1TM821761', 0.1, false),
  N('n2', 'u1', 'order', 'order_supplier_confirmed', { number: 'CO-10035' }, '/orders/o3', 0.4, false),
  N('n3', 'u1', 'price_drop', 'price_drop', { title: 'Wireless Earbuds Pro ANC', pct: 17 }, '/shop/p1', 1, false),
  N('n4', 'u1', 'group_buy', 'group_buy_progress', { title: 'Wireless Earbuds Pro ANC', left: 37 }, '/group-buy/g1', 1.5, true),
  N('n5', 'u1', 'delivery', 'delivered', { number: 'CO-10021' }, '/orders/o1', 12, true),
  N('n6', 'u1', 'payment', 'payment_succeeded', { amount: '1 186.42 TMT', number: 'CO-10049' }, '/orders/o4', 7, true),
  N('n7', 'u1', 'security', 'security_login', { device: 'Chrome · Ashgabat' }, '/profile?section=security', 2, false),
  N('n8', 'u1', 'cargo', 'cargo_warehouse', { count: 3 }, '/cargo/consolidate', 2.2, false),
  N('n9', 'u1', 'customs', 'auto_step', { number: 'AUTO-5012', step: 'shipping' }, '/auto/reservations/r1', 3, true),
  N('n10', 'u1', 'vip', 'vip_offer', {}, '/vip', 5, true),
  N('n11', 'u1', 'promotion', 'promo_campaign', { name: `VIP ${month} Campaign` }, '/vip/promotion', 6, true),
  N('n12', 'u1', 'supplier', 'supplier_reply', { supplier: 'Guangzhou Silkroad Apparel' }, '/suppliers/s3', 8, true),
  N('n13', 'u2', 'payment', 'invoice_status', { number: 'FC-88213', status: 'under_review' }, '/pay/inv2', 0.2, false),
  N('n14', 'u2', 'customs', 'cargo_stage', { tracking: 'C1TM828316', stage: 'customs' }, '/track?q=C1TM828316', 0.6, false),
  N('n15', 'u2', 'supplier', 'quote_received', { supplier: 'Xiamen Packwell Packaging' }, '/business?tab=quotes', 1, false),
  N('n16', 'u2', 'payment', 'invoice_status', { number: 'DPT-5520', status: 'failed' }, '/pay/inv3', 29, true),
  N('n17', 'u2', 'vip', 'vip_renewal', { date: ahead(20).slice(0, 10) }, '/vip', 3, true),
  N('n18', 'u2', 'order', 'order_delivered_b2b', { number: 'CO-10070' }, '/orders/o8', 40, true),
  N('n19', 'u3', 'order', 'supplier_new_order', { number: 'CO-10140' }, '/supplier?tab=orders', 0.5, false),
  N('n20', 'u4', 'security', 'admin_review', { count: 2 }, '/admin/payments', 0.3, false),
  N('n21', 'u4', 'supplier', 'admin_supplier_pending', { supplier: 'Wenzhou Stride Footwear' }, '/admin/suppliers', 1, false),
];

// ---------- Support, FAQ, quotes ----------
export const faqs: FaqItem[] = [
  { id: 'f1', category: 'orders', order: 1, q: { en: 'How is the final price calculated?', ru: 'Как рассчитывается итоговая цена?', tk: 'Jemi baha nähili hasaplanýar?' }, a: { en: 'Product price + service fee + cargo (by chargeable weight) + estimated mandatory costs. Anything not fixed is labelled ESTIMATED and confirmed before shipping.', ru: 'Цена товара + сервисный сбор + карго (по расчётному весу) + ориентировочные обязательные платежи. Всё, что не фиксировано, помечено как ОЦЕНКА и подтверждается до отправки.', tk: 'Haryt bahasy + hyzmat tölegi + ýük (hasaplanan agram boýunça) + çak edilýän hökmany tölegler. Kesgitlenmedik zatlar ÇAKLAMA diýip bellenýär we ugradylmazdan öň tassyklanýar.' } },
  { id: 'f2', category: 'cargo', order: 2, q: { en: 'How long does delivery from China take?', ru: 'Сколько идёт доставка из Китая?', tk: 'Hytaýdan eltip bermek näçe wagt alýar?' }, a: { en: 'Rail/truck: typically 16–24 days after the goods reach our China hub. Express air: 7–11 days.', ru: 'Ж/д/авто: обычно 16–24 дня после поступления на наш склад в Китае. Экспресс авиа: 7–11 дней.', tk: 'Demir ýol/awtoulag: harytlar Hytaýdaky merkezimize gelenden soň adatça 16–24 gün. Ekspress howa: 7–11 gün.' } },
  { id: 'f3', category: 'payments', order: 3, q: { en: 'How do supplier payments work?', ru: 'Как работает оплата поставщикам?', tk: 'Üpjün edijilere töleg nähili işleýär?' }, a: { en: 'You upload the supplier invoice, we verify it and settle with the supplier through licensed partner banks. KYC/AML checks apply. You see each status from review to “supplier paid”.', ru: 'Вы загружаете инвойс поставщика, мы проверяем его и проводим расчёт через лицензированные банки-партнёры. Применяются проверки KYC/AML. Вы видите каждый статус — от проверки до «поставщик оплачен».', tk: 'Siz üpjün edijiniň hasap-fakturasyny ýükleýärsiňiz, biz ony barlap, ygtyýarly hyzmatdaş banklar arkaly hasaplaşýarys. KYC/AML barlaglary ulanylýar. Barlagdan «üpjün ediji tölendi» çenli her ýagdaýy görýärsiňiz.' } },
  { id: 'f4', category: 'auto', order: 4, q: { en: 'What does CARGO ONE VERIFIED mean for a car?', ru: 'Что значит CARGO ONE VERIFIED для автомобиля?', tk: 'Awtoulag üçin CARGO ONE VERIFIED näme aňladýar?' }, a: { en: 'A used car is shown as verified only when it has a CARGO ONE inspection record that passed. The full report — every item, note, score, inspector and date — is on the car page.', ru: 'Подержанный автомобиль отмечается как проверенный только при наличии пройденного осмотра CARGO ONE. Полный отчёт — каждый пункт, замечание, балл, инспектор и дата — на странице авто.', tk: 'Ulanylan awtoulag diňe CARGO ONE barlagyndan geçen ýazgysy bar bolsa barlanan diýip görkezilýär. Doly hasabat — her bölüm, bellik, bal, barlagçy we sene — awtoulag sahypasynda.' } },
  { id: 'f5', category: 'cargo', order: 5, q: { en: 'What is consolidation?', ru: 'Что такое консолидация?', tk: 'Birleşdirmek näme?' }, a: { en: 'Several purchases wait at our China hub and ship as one parcel, which lowers the minimum charge per shipment.', ru: 'Несколько покупок ожидают на нашем складе в Китае и отправляются одной посылкой — это снижает минимальную стоимость отправки.', tk: 'Birnäçe satyn alyş Hytaýdaky merkezimizde garaşýar we bir ýük bolup ugradylýar, bu her ugratma üçin iň az tölegi azaldýar.' } },
  { id: 'f6', category: 'account', order: 6, q: { en: 'What do I get with VIP?', ru: 'Что даёт VIP?', tk: 'VIP bilen näme alýaryn?' }, a: { en: 'No ads, faster processing and delivery, a lower service fee (3% instead of 5%), priority support and member offers. The monthly campaign is an extra.', ru: 'Без рекламы, быстрее обработка и доставка, сниженный сервисный сбор (3% вместо 5%), приоритетная поддержка и предложения для участников. Ежемесячная акция — дополнительно.', tk: 'Mahabatsyz, has çalt işleýiş we eltip bermek, pes hyzmat tölegi (5% ýerine 3%), ileri tutulýan goldaw we agzalar üçin teklipler. Aýlyk kampaniýa goşmaça.' } },
  { id: 'f7', category: 'orders', order: 7, q: { en: 'Can I cancel an order?', ru: 'Можно ли отменить заказ?', tk: 'Sargydy ýatyryp bolarmy?' }, a: { en: 'Yes, until the supplier confirms it. After that, contact support — cancellation depends on the supplier.', ru: 'Да, до подтверждения поставщиком. После — обратитесь в поддержку, отмена зависит от поставщика.', tk: 'Hawa, üpjün ediji tassyklaýança. Ondan soň goldawa ýüz tutuň — ýatyrmak üpjün edijä bagly.' } },
  { id: 'f8', category: 'payments', order: 8, q: { en: 'Which payment methods are supported?', ru: 'Какие способы оплаты поддерживаются?', tk: 'Haýsy töleg usullary goldanýar?' }, a: { en: 'Bank cards, CARGO ONE Wallet, partner bank transfer and, for businesses, supplier settlement. In this MVP all payments run through a mock adapter.', ru: 'Банковские карты, кошелёк CARGO ONE, перевод через банк-партнёр и, для бизнеса, расчёты с поставщиками. В этом MVP все платежи идут через тестовый адаптер.', tk: 'Bank kartlary, CARGO ONE gapjygy, hyzmatdaş bank geçirimi we telekeçiler üçin üpjün ediji hasaplaşygy. Bu MVP-de ähli tölegler synag adapteri arkaly geçýär.' } },
];

export const tickets: SupportTicket[] = [
  { id: 't1', number: 'SUP-3021', userId: 'u1', category: 'cargo', subject: 'Package weight looks higher than expected', message: 'Order CO-10049 shows 1.2 kg but the product is 0.3 kg.', attachments: [], status: 'in_progress', createdAt: ago(3), refId: 'CO-10049', messages: [{ from: 'user', text: 'Order CO-10049 shows 1.2 kg but the product is 0.3 kg.', at: ago(3) }, { from: 'agent', text: 'Thanks Aylar — the supplier added an outer carton. We are re-weighing at the Yiwu hub today and will update the cargo cost.', at: ago(2.8) }] },
  { id: 't2', number: 'SUP-2987', userId: 'u2', category: 'payment', subject: 'Invoice DPT-5520 failed', message: 'Why did the supplier payment fail?', attachments: ['DPT-5520.pdf'], status: 'resolved', createdAt: ago(28), refId: 'DPT-5520', messages: [{ from: 'user', text: 'Why did the supplier payment fail?', at: ago(28) }, { from: 'agent', text: 'The beneficiary name on the invoice differs from the bank record. Please ask the supplier for a corrected invoice and resubmit.', at: ago(27.9) }] },
];

export const quotes: QuoteRequest[] = [
  { id: 'q1', userId: 'u2', supplierId: 's9', productTitle: 'Magnetic rigid boxes, black, 25×20×8 cm, logo foil', qty: 500, targetPriceUSD: 4.2, notes: 'Matte black, gold foil logo on lid.', kind: 'quote', status: 'responded', response: { unitPriceUSD: 3.85, leadDays: 14, message: 'We can do 3.85 USD/pc incl. foil logo. Sample in 4 days.' }, createdAt: ago(2) },
  { id: 'q2', userId: 'u2', supplierId: 's1', productTitle: 'Wireless earbuds, private label', qty: 300, notes: 'Need CE + FCC documents.', kind: 'quote', status: 'sent', createdAt: ago(0.5) },
  { id: 'q3', userId: 'u6', supplierId: 's1', productTitle: '65W GaN charger EU plug', qty: 1000, targetPriceUSD: 6.5, notes: '', kind: 'quote', status: 'sent', createdAt: ago(1) },
];

export const payouts: SupplierPayout[] = [
  { id: 'po1', supplierId: 's1', amountCNY: 48210, status: 'paid', date: ago(28), orders: 14 },
  { id: 'po2', supplierId: 's1', amountCNY: 61880, status: 'paid', date: ago(14), orders: 19 },
  { id: 'po3', supplierId: 's1', amountCNY: 23940, status: 'scheduled', date: ahead(3), orders: 8 },
];

export const favorites: Favorite[] = [
  { id: 'fv1', userId: 'u1', kind: 'product', refId: 'p8', createdAt: ago(4) },
  { id: 'fv2', userId: 'u1', kind: 'product', refId: 'p2', createdAt: ago(9) },
  { id: 'fv3', userId: 'u1', kind: 'supplier', refId: 's3', createdAt: ago(12) },
  { id: 'fv4', userId: 'u1', kind: 'car', refId: 'c1', createdAt: ago(3) },
  { id: 'fv5', userId: 'u1', kind: 'search', refId: 'black crossbody bag under 200', label: 'black crossbody bag under 200', createdAt: ago(6) },
  { id: 'fv6', userId: 'u2', kind: 'supplier', refId: 's9', createdAt: ago(20) },
  { id: 'fv7', userId: 'u2', kind: 'search', refId: 'magnetic boxes 500', label: 'magnetic boxes 500', createdAt: ago(15) },
];

export const aiRequests: AIRequest[] = [];
export const searchRequests: SearchRequest[] = [];

// Marketplace-first order (W1): discovery rails first, auto and logistics later.
export const HOME_SECTION_ORDER = ['trending', 'popular', 'new_arrivals', 'best_value', 'business_picks', 'recommended', 'group_buy', 'price_drops', 'fast_delivery', 'verified_suppliers', 'verified_auto'] as const;
export const content: ContentSettings = {
  homeSections: (HOME_SECTION_ORDER).map((key, order) => ({ key, visible: true, order })),
  banner: { enabled: true, text: 'Rail consolidation departs every Tuesday from Yiwu', link: '/cargo/consolidate', i18n: { ru: 'Ж/д консолидация отправляется из Иу каждый вторник', tk: 'Demir ýol birleşdirmesi her sişenbe Iuden ugraýar' } },
  translationOverrides: {},
  settings: { ...DEFAULT_SETTINGS },
  promoBanners: [
    { id: 'pb5', enabled: true, order: 0, tone: 'accent', link: '/try-on', images: ['img/tryon/banner-1.webp', 'img/tryon/banner-2.webp', 'img/tryon/banner-3.webp'],
      eyebrow: 'New · AR try-on', title: 'Try it on with your camera.', subtitle: 'Glasses, headphones, caps, hoodies, watches, phone cases. Runs on your device.', cta: 'Try on now',
      i18n: { ru: { eyebrow: 'Новое · AR-примерка', title: 'Примерьте через камеру.', subtitle: 'Очки, наушники, кепки, худи, часы, чехлы. Работает прямо на устройстве.', cta: 'Примерить' },
        tk: { eyebrow: 'Täze · AR synap görmek', title: 'Kamera arkaly synap görüň.', subtitle: 'Äýnekler, gulakçynlar, kepkalar, hudiler, sagatlar, gaplar. Enjamyňyzda işleýär.', cta: 'Synap gör' } } },
    { id: 'pb1', enabled: true, order: 1, tone: 'sand', link: '/shop/category/electronics', images: ['img/products/p1-0.webp', 'img/products/p2-1.webp', 'img/products/p4-0.webp'],
      eyebrow: 'Electronics week', title: 'Shenzhen gadgets at factory prices', subtitle: 'Earbuds, watches, chargers. The full landed price is shown before you pay.', cta: 'Shop electronics',
      i18n: { ru: { eyebrow: 'Неделя электроники', title: 'Гаджеты из Шэньчжэня по ценам фабрики', subtitle: 'Наушники, часы, зарядки. Полная цена с доставкой видна до оплаты.', cta: 'В электронику' },
        tk: { eyebrow: 'Elektronika hepdesi', title: 'Şençžen gajetleri zawod bahasyndan', subtitle: 'Gulakçynlar, sagatlar, zarýad berijiler. Doly baha tölegden öň görkezilýär.', cta: 'Elektronika' } } },
    { id: 'pb2', enabled: true, order: 2, tone: 'ink', link: '/cargo/consolidate', images: ['img/hero/cargo-wide.webp'],
      eyebrow: 'Rail consolidation · every Tuesday', title: 'Combine parcels. Pay for one shipment.', subtitle: 'Orders from different suppliers travel together from our Yiwu hub.', cta: 'Consolidate',
      i18n: { ru: { eyebrow: 'Ж/д консолидация · каждый вторник', title: 'Объедините посылки. Платите за одну.', subtitle: 'Заказы от разных поставщиков едут вместе с нашего склада в Иу.', cta: 'Объединить' },
        tk: { eyebrow: 'Demir ýol birleşdirmesi · her sişenbe', title: 'Bukjalary birleşdiriň. Bir ugradyş üçin töläň.', subtitle: 'Dürli üpjün edijileriň sargytlary Iu merkezimizden bile gelýär.', cta: 'Birleşdir' } } },
    { id: 'pb3', enabled: true, order: 3, tone: 'paper', link: '/group-buy', images: ['img/products/p21-0.webp', 'img/products/p11-0.webp', 'img/products/p27-0.webp'],
      eyebrow: 'Group buy', title: 'More buyers, lower price.', subtitle: 'Join an open group. You only pay if the group reaches its target.', cta: 'See open groups',
      i18n: { ru: { eyebrow: 'Совместная покупка', title: 'Больше покупателей, ниже цена.', subtitle: 'Присоединяйтесь к открытой группе. Оплата списывается, только если группа соберётся.', cta: 'Открытые группы' },
        tk: { eyebrow: 'Bilelikdäki satyn alyş', title: 'Alyjy köp bolsa, baha arzan.', subtitle: 'Açyk topara goşulyň. Topar maksadyna ýetse töleýärsiňiz.', cta: 'Açyk toparlar' } } },
    { id: 'pb4', enabled: true, order: 4, tone: 'ink', link: '/auto', images: ['img/hero/auto-hero.webp'],
      eyebrow: 'CARGO ONE Auto', title: 'Cars from China with an inspection report.', subtitle: 'Every verified car comes with a full report and a landed price estimate.', cta: 'Browse cars',
      i18n: { ru: { eyebrow: 'CARGO ONE Auto', title: 'Авто из Китая с отчётом об осмотре.', subtitle: 'У каждого проверенного авто есть полный отчёт и оценка цены с доставкой.', cta: 'Смотреть авто' },
        tk: { eyebrow: 'CARGO ONE Auto', title: 'Barlag hasabatly Hytaý awtoulaglary.', subtitle: 'Her barlanan awtoulagyň doly hasabaty we eltip berlen baha çaklamasy bar.', cta: 'Awtoulaglar' } } },
  ],
  // Placeholder partners for the demo (fictional companies, original marks). Replace with real partners in Admin → Content → Partners.
  partners: ([
    ['pt1', 'Silkline Rail', 'logistics', 'rails'], ['pt2', 'Hanlu Freight', 'logistics', 'seal'], ['pt3', 'Karawan Express', 'logistics', 'dunes'],
    ['pt4', 'Yuntai Manufacturing', 'manufacturing', 'hex'], ['pt5', 'Merw Trade House', 'marketplace', 'gul'], ['pt6', 'PayBridge', 'payments', 'bridge'],
    ['pt7', 'Northgate Motors', 'auto', 'gate'], ['pt8', 'Lianfa Pack', 'manufacturing', 'box'], ['pt9', 'Amu Customs Brokers', 'customs', 'river'], ['pt10', 'Bluedune Insurance', 'insurance', 'shield'],
  ] as const).map(([id, name, kind, mark], order) => ({ id, name, kind, mark, visible: true, order, demo: true })),
};
