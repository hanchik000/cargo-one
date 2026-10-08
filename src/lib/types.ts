import type { PriceEstimate } from '@/shared/pricing.mjs';
// CARGO ONE domain models. Mock services and future real APIs share these types.

export type Lang = 'en' | 'ru' | 'tk';
export type Role = 'personal' | 'business' | 'admin' | 'supplier';
export type Currency = 'TMT' | 'CNY' | 'USD';
export type ID = string;

export interface User {
  id: ID; name: string; email: string; phone: string; role: Role;
  status: 'active' | 'suspended'; city: string; createdAt: string;
  businessId?: ID; supplierId?: ID; lastActiveAt: string;
}
export interface Profile { userId: ID; language: Lang; marketingOptIn: boolean; twoFactor: boolean }
export interface BusinessProfile { id: ID; userId: ID; companyName: string; taxId: string; city: string; industry: string; monthlyVolumeUSD: number; verified: boolean }
export interface SessionUser { id: ID; name: string; email: string; phone: string; role: Role; businessId?: ID; supplierId?: ID; companyName?: string }

export interface Address {
  id: ID; userId: ID; name: string; phone: string; city: string; district: string; street: string;
  building: string; apartment: string; info: string; isDefault: boolean;
}

export type CategoryId = 'electronics' | 'fashion' | 'home' | 'beauty' | 'kids' | 'auto' | 'tools' | 'industrial' | 'business';
export interface Category { id: CategoryId; icon: string; visible: boolean; order: number }

export interface ProductVariant { id: ID; name: string; priceDeltaCNY: number; stock: number }
export interface ProductImage { id: ID; tone: number; angle: 'front' | 'side' | 'detail' | 'pack'; /** Relative asset path of a studio render, when one exists. */ src?: string }
export interface ProductReview { id: ID; author: string; city: string; rating: number; text: string; date: string }
export interface Product {
  id: ID; title: string; categoryId: CategoryId; supplierId: ID; icon: string;
  priceCNY: number; oldPriceCNY?: number; images: ProductImage[]; variants: ProductVariant[];
  specs: [string, string][]; stock: number; moq: number; leadDays: number;
  weightKg: number; volumeM3: number; score: number; verified: boolean; published: boolean; featured: boolean;
  rating: number; reviews: ProductReview[]; tags: ('popular' | 'business' | 'price_drop')[];
  popularityAshgabat: number; createdAt: string; keywords: string[];
  /** Virtual try-on support (AR overlay type). */
  tryOn?: TryOnKind;
  // ---- W1 catalogue fields (filled by the catalogue API; optional so older local data still type-checks)
  description?: string | null; brand?: string | null; subcategoryId?: string | null;
  status?: 'draft' | 'published' | 'archived'; availability?: 'in_stock' | 'out_of_stock' | 'unknown'; updatedAt?: string;
  /** editorial = curated by CARGO ONE; imported = created from a source adapter. */
  origin?: 'editorial' | 'imported';
  /** demo = bundled demo data; sample = imported from the sample fixture adapter (not a live marketplace). */
  demo?: boolean; sample?: boolean;
  leadDaysKnown?: boolean; weightKnown?: boolean; weightEstimated?: boolean;
  localized?: { lang: string; titleLang: string | null; fallback: boolean; machine: boolean };
  source?: ProductSourceInfo | null;
  pricing?: PriceEstimate;
  seller?: { id: string; name: string; level: number; score: number | null; scoreBasis: string | null; demo: boolean; status: string } | null;
}
export interface ProductSourceInfo {
  name: string; label: string; productId: string; url: string | null;
  price: { amountMinor: number; currency: 'CNY' | 'USD' | 'TMT' } | null;
  syncedAt: string | null; sourceUpdatedAt?: string | null; syncStatus: 'ok' | 'error'; lastError: string | null; lastErrorAt?: string | null; stale: boolean;
}
export interface SupplierTrust {
  /** 0 = not verified, 1 = licence checked, 2 = licence + bank account checked, 3 = on-site audit (not in W1). */
  level: number; basis: { kind: string; document: string; at: string }[]; score: number | null; scoreBasis: string | null; demo: boolean; source: string | null;
}
export type TryOnKind = 'glasses' | 'earbuds' | 'headphones' | 'cap' | 'watch' | 'phonecase' | 'hoodie' | 'coat' | 'bag' | 'shoes';

export interface SupplierDocument { id: ID; name: string; kind: 'license' | 'certificate' | 'bank' | 'other'; uploadedAt: string; status: 'pending' | 'approved' | 'rejected' }
export interface SupplierReview { id: ID; author: string; rating: number; text: string; date: string }
export interface Supplier {
  id: ID; name: string; nameCn: string; city: string; province: string; categories: CategoryId[];
  score: number; yearsActive: number; moq: number; responseRate: number; responseHours: number;
  certifications: string[]; verified: boolean; status: 'pending' | 'approved' | 'rejected' | 'suspended';
  documents: SupplierDocument[]; reviews: SupplierReview[]; complaints: number; ordersCount: number;
  disputeRate: number; onTimeRate: number; monogram: string; description: string;
  /** W1: verification derived from recorded documents only. Imported sellers carry nulls instead of invented metrics. */
  trust?: SupplierTrust;
}

export interface OrderItem { productId: ID; variantId?: ID; title: string; qty: number; unitPriceCNY: number; supplierId: ID }
export type OrderStatus = 'pending_payment' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export interface CostBreakdown { goodsTMT: number; cargoTMT: number; serviceTMT: number; dutiesTMT: number; totalTMT: number }
export interface Order {
  id: ID; number: string; userId: ID; items: OrderItem[]; status: OrderStatus; paymentId?: ID; shipmentId?: ID;
  addressId?: ID; addressText: string; delivery: 'standard' | 'express'; costs: CostBreakdown; createdAt: string;
  supplierStatus: 'awaiting' | 'accepted' | 'rejected'; documents: string[]; source: 'shop' | 'find' | 'ai_buyer' | 'group_buy' | 'repeat';
}

export interface CartItem { productId: ID; variantId?: ID; qty: number }
export interface Cart { items: CartItem[]; saved: CartItem[] }

export type PaymentStatus = 'pending' | 'authorized' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';
export interface Payment {
  id: ID; userId: ID; kind: 'order' | 'supplier_invoice' | 'vip' | 'auto_reservation' | 'group_buy'; refId: ID;
  amount: number; currency: Currency; feeTMT: number; status: PaymentStatus; methodLabel: string;
  createdAt: string; processedAt?: string; failureReason?: string;
}
export interface PaymentMethod { id: ID; userId: ID; type: 'card' | 'wallet' | 'partner' | 'settlement'; label: string; last4?: string; brand?: string; token: string; isDefault: boolean; expires?: string }

export type InvoiceStatus = 'draft' | 'under_review' | 'processing' | 'paid' | 'failed' | 'refunded';
export interface Invoice {
  id: ID; userId: ID; customerName: string; supplierName: string; invoiceNumber: string; invoiceDate: string;
  amount: number; currency: 'CNY' | 'USD'; beneficiary: string; bankName: string; account: string; swift: string;
  orderRef: string; fileName: string; status: InvoiceStatus; serviceFeeTMT: number; settlementCostTMT: number;
  totalTMT: number; createdAt: string; submittedAt?: string; processedAt?: string; failureReason?: string;
  kycConfirmed: boolean; paymentId?: ID; simulateProgress?: boolean;
}

export type ShipmentStage =
  | 'order_created' | 'payment_confirmed' | 'supplier_confirmed' | 'production' | 'china_warehouse' | 'consolidated'
  | 'departed_china' | 'in_transit' | 'customs' | 'arrived_tm' | 'local_hub' | 'out_for_delivery' | 'delivered';
export interface ShipmentEvent { id: ID; stage: ShipmentStage; at: string; location: string; note: string }
export interface Warehouse { id: ID; name: string; city: string; country: 'CN' | 'TM' }
export interface CargoPackage { id: ID; orderId: ID; userId: ID; label: string; weightKg: number; volumeM3: number; status: 'awaiting' | 'received' | 'consolidated'; warehouseId: ID; receivedAt?: string }
export interface CargoConsolidation { id: ID; userId: ID; packageIds: ID[]; shipmentId: ID; savingTMT: number; createdAt: string }
export interface Shipment {
  id: ID; trackingNumber: string; userId: ID; orderIds: ID[]; supplierName: string; warehouseId: ID;
  packages: CargoPackage[]; weightKg: number; volumeM3: number; eta: string; costTMT: number; stage: ShipmentStage;
  carrier: string; mode: 'rail' | 'truck' | 'air'; destination: string; documents: string[]; events: ShipmentEvent[];
  createdAt: string; kind: 'goods' | 'vehicle';
}

export type CarFuel = 'ev' | 'hybrid' | 'petrol' | 'diesel';
export type CarBody = 'sedan' | 'suv' | 'hatch' | 'van' | 'pickup';
export interface CarImage { id: ID; tone: number; view: 'front' | 'side' | 'rear' | 'interior'; /** Relative asset path of a studio render, when one exists. */ src?: string }
export interface Car {
  id: ID; brand: string; model: string; year: number; condition: 'new' | 'used'; fuel: CarFuel; body: CarBody;
  commercial: boolean; mileageKm: number; priceUSD: number; batteryKwh?: number; batteryHealth?: number; rangeKm?: number;
  drive: 'fwd' | 'rwd' | 'awd'; color: string; accident: 'none' | 'minor' | 'major'; owners: number;
  verification: 'verified' | 'pending' | 'rejected' | 'not_inspected'; inspectionId?: ID; published: boolean;
  location: string; images: CarImage[]; vin: string; createdAt: string; reservedBy?: ID;
}
export type InspectionItemKey =
  | 'vin' | 'documents' | 'ownership' | 'accident' | 'mileage' | 'body' | 'paint' | 'engine' | 'transmission'
  | 'suspension' | 'brakes' | 'electronics' | 'ac' | 'tires' | 'lights' | 'interior' | 'diagnostics'
  | 'ev_battery' | 'charging' | 'road_test';
export interface CarInspectionItem { key: InspectionItemKey; status: 'ok' | 'note' | 'fail' | 'na'; note?: string; points: number }
export interface CarInspection {
  id: ID; carId: ID; vin: string; date: string; inspector: string; inspectorId: string; score: number;
  result: 'passed' | 'passed_notes' | 'failed'; items: CarInspectionItem[]; photos: number; videoMinutes: number;
  paintMicrons: [number, number]; summary: string; location: string;
}
export const AUTO_FLOW = ['select', 'inspection_view', 'reserve', 'payment', 'china_docs', 'pre_ship_inspection', 'shipping', 'customs', 'arrived_tm', 'delivery'] as const;
export type AutoStep = (typeof AUTO_FLOW)[number];
export interface CarReservation { id: ID; number: string; carId: ID; userId: ID; depositUSD: number; paymentId?: ID; step: AutoStep; createdAt: string; history: { step: AutoStep; at: string }[] }

export interface Favorite { id: ID; userId: ID; kind: 'product' | 'supplier' | 'car' | 'search'; refId: ID; label?: string; createdAt: string }

export interface GroupBuyTier { qty: number; priceCNY: number }
export interface GroupBuyParticipant { userId: ID; name: string; qty: number; paymentId?: ID; joinedAt: string }
export interface GroupBuy {
  id: ID; productId: ID; title: string; tiers: GroupBuyTier[]; currentQty: number; targetQty: number; endsAt: string;
  status: 'open' | 'completed' | 'cancelled'; participants: GroupBuyParticipant[]; createdAt: string;
}

export interface VIPSubscription { userId: ID; status: 'active' | 'cancelled' | 'expired'; startedAt: string; renewsAt: string; priceTMT: number; autoRenew: boolean; paymentIds: ID[] }
export type PromotionKind = 'vip_campaign' | 'discount' | 'group_buy' | 'featured' | 'price_drop' | 'banner';
export interface Promotion {
  id: ID; kind: PromotionKind; name: string; prize?: string; prizeCount?: number; startsAt: string; endsAt: string;
  eligibility: string; rules: string; status: 'draft' | 'active' | 'ended'; discountPct?: number; productIds?: ID[]; headline?: string;
  /** Optional RU/TK versions of the text fields; English fields are the fallback. */
  i18n?: Partial<Record<Lang, PromotionText>>;
}
export type PromotionText = { name?: string; headline?: string; eligibility?: string; rules?: string };
export interface PromotionEntry { id: ID; promotionId: ID; userId: ID; entries: number; createdAt: string; source: 'vip_monthly' | 'order' | 'free_entry' }

export type NotificationType = 'order' | 'payment' | 'supplier' | 'cargo' | 'customs' | 'delivery' | 'price_drop' | 'group_buy' | 'vip' | 'promotion' | 'security';
export interface AppNotification { id: ID; userId: ID; type: NotificationType; key: string; params: Record<string, string | number>; link?: string; read: boolean; createdAt: string }

export interface SupportMessage { from: 'user' | 'agent'; text: string; at: string }
export interface SupportTicket { id: ID; number: string; userId: ID; category: 'order' | 'payment' | 'cargo' | 'vehicle' | 'account' | 'other'; subject: string; message: string; attachments: string[]; status: 'open' | 'in_progress' | 'resolved'; createdAt: string; messages: SupportMessage[]; refId?: string }
export type Localized = Record<Lang, string>;
export interface FaqItem { id: ID; category: 'orders' | 'payments' | 'cargo' | 'auto' | 'account'; q: Localized; a: Localized; order: number }

export interface SearchRequest { id: ID; userId?: ID; query: string; mode: 'text' | 'image' | 'url' | 'video' | 'voice'; createdAt: string; resultIds: ID[] }
export interface QuoteOption {
  supplierId: ID; productId?: ID; title: string; unitPriceUSD: number; moq: number; productionDays: number;
  quality: 'standard' | 'premium' | 'economy'; shippingDays: number; shippingUSD: number; totalUSD: number;
  recommendation: 'best_value' | 'fastest' | 'premium' | 'lowest_price'; fitScore: number; reasons: string[];
}
export interface AIRequest { id: ID; userId?: ID; prompt: string; parsed: { quantity?: number; budgetUSD?: number; keywords: string[]; categoryId?: CategoryId }; options: QuoteOption[]; createdAt: string }
export interface QuoteRequest {
  id: ID; userId: ID; supplierId: ID; productTitle: string; qty: number; targetPriceUSD?: number; notes: string; kind: 'quote' | 'sample';
  status: 'sent' | 'responded' | 'accepted' | 'declined'; response?: { unitPriceUSD: number; leadDays: number; message: string }; createdAt: string;
}
export interface SupplierPayout { id: ID; supplierId: ID; amountCNY: number; status: 'scheduled' | 'paid'; date: string; orders: number }

export interface HomeSection { key: 'trending' | 'new_arrivals' | 'popular' | 'best_value' | 'fast_delivery' | 'verified_suppliers' | 'recommended' | 'price_drops' | 'group_buy' | 'verified_auto' | 'business_picks'; visible: boolean; order: number }
export interface PromoBannerText { eyebrow?: string; title?: string; subtitle?: string; cta?: string }
/** A first-party promo banner on the home screen (managed in Admin → Content → Promo banners). */
export interface PromoBanner {
  id: ID; enabled: boolean; order: number; tone: 'ink' | 'accent' | 'sand' | 'paper';
  eyebrow: string; title: string; subtitle: string; cta: string; link: string;
  /** Up to 3 images: an asset path ("img/…") or an uploaded image (data URL). */
  images: string[];
  i18n?: Partial<Record<Lang, PromoBannerText>>;
}
export type PartnerKind = 'logistics' | 'payments' | 'manufacturing' | 'customs' | 'auto' | 'insurance' | 'marketplace';
/** A company shown in "Trusted by" on the home screen. `demo` marks placeholder partners from the seed data. */
export interface Partner { id: ID; name: string; kind: PartnerKind; mark?: string; logo?: string; url?: string; visible: boolean; order: number; demo?: boolean }
export interface ContentSettings {
  homeSections: HomeSection[];
  promoBanners: PromoBanner[];
  partners: Partner[];
  banner: { enabled: boolean; text: string; link: string; i18n?: Partial<Record<Lang, string>> };
  translationOverrides: Partial<Record<Lang, Record<string, string>>>;
  settings: { serviceFeePct: number; vipFeePct: number; cargoRateTMTPerKg: number; expressRateTMTPerKg: number; usdToTmt: number; cnyToTmt: number; dutyEstimatePct: number; simulateErrors: boolean };
}

export interface Page<T> { items: T[]; total: number; page: number; pageSize: number; hasMore: boolean }
