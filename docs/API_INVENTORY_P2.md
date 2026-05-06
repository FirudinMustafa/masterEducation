# API Inventory — Bölüm 2 (Admin)

> Kapsam: `src/app/api/admin/*` — 45 endpoint dosyası, 50+ HTTP handler.
> Public/Account/Dealer endpoint'leri **Bölüm 1** kapsamında (`docs/API_INVENTORY_P1.md`).
> Tarih: 2026-05-06.

## Özet

| Kategori | Dosya | Notlar |
|---|---:|---|
| Auth gate | 45/45 | hepsi `requireRole("ADMIN")` ilk satır + layout-level redirect (`/admin/layout.tsx:13`) |
| Bulk endpoint | 11 | hepsi MAX_AFFECTED + Zod array.max() |
| Audit | 43/45 | accounting/export ve products/template eksik |
| Rate-limit (admin) | 0/45 | admin yetki gateway zaten kontrolü; bulk image upload P3 |

---

## Endpoint matrisi (kategori bazlı)

### Bayi yönetimi (12)

| Endpoint | Method | Zod | Audit | Tx | MAX | DryRun | Idempot |
|---|---|---|---|---|---|---|---|
| `dealers` | GET | query | — | N | — | — | read-only |
| `dealers/[id]` | GET | — | — | N | — | — | read-only |
| `dealers/[id]` | PATCH | `dealerEditSchema` | `DEALER_UPDATE` | Y | — | — | merge |
| `dealers/[id]/approve` | POST | `dealerStatusUpdateSchema` | `DEALER_APPROVE` | N | — | — | status-guard |
| `dealers/[id]/reject` | POST | `dealerStatusUpdateSchema` | `DEALER_REJECT` | N | — | — | status-guard |
| `dealers/[id]/suspend` | POST | `dealerStatusUpdateSchema` | `DEALER_SUSPEND` | N | — | — | status-guard |
| `dealers/[id]/payments` | POST | `dealerPaymentSchema` | `DEALER_PAYMENT` | Y (ledger) | — | — | reference-key |
| `dealers/[id]/adjustments` | POST | `dealerAdjustmentSchema` | `DEALER_ADJUSTMENT` | Y (ledger) | — | — | note required |
| `dealers/[id]/documents` | GET | — | — | N | — | — | read-only |
| `dealers/[id]/documents/[docId]` | PATCH | review schema | `DEALER_DOCUMENT_REVIEW` | N | — | — | status |
| `dealers/bulk-approve` | POST | array+limits | `DEALER_BULK_APPROVE` | per-loop | 200 | — | PENDING-only |
| `dealers/bulk-adjust-credit` | POST | array+mode | `DEALER_BULK_CREDIT_ADJUST` | tx | 500 | ✓ | mode-arith |

### Ürün yönetimi (15)

| Endpoint | Method | Zod | Audit | Tx | MAX | DryRun | Idempot |
|---|---|---|---|---|---|---|---|
| `products` | GET | query | — | N | — | — | read-only |
| `products` | POST | `productCreateSchema` | `PRODUCT_CREATE` | N | — | — | — |
| `products/[id]` | GET | — | — | N | — | — | read-only |
| `products/[id]` | PATCH | `productUpdateSchema` | `PRODUCT_UPDATE` | N | — | — | partial |
| `products/[id]` | DELETE | — | `PRODUCT_DELETE` | Y | — | — | soft/hard logic |
| `products/[id]/images` | POST | formData | `PRODUCT_IMAGE_UPLOAD` | N | — | — | — |
| `products/[id]/images/[imageId]` | DELETE | — | `PRODUCT_IMAGE_DELETE` | N | — | — | productId match |
| `products/[id]/images/reorder` | PATCH | array | — | N | — | — | productId match |
| `products/search` | GET | query | — | N | — | — | read-only |
| `products/template` | GET | — | — | N | — | — | xlsx |
| `products/bulk-import` | POST | excel | `PRODUCT_BULK_IMPORT` | Y all-or-nothing | — | ✓ | mode=insert\|upsert |
| `products/bulk-update` | POST | `{productIds[],patch}` | `PRODUCT_BULK_UPDATE` | Y | 1000 | — | partial |
| `products/bulk-delete` | POST | `{productIds[]}` | `PRODUCT_BULK_DELETE` | Y | 500 | — | soft/hard logic |
| `products/bulk-price` | POST | filter+mode | `PRODUCT_BULK_PRICE_UPDATE` | bucket-tx | 50000 | ✓ | filter-spec |
| `products/bulk-upload-images` | POST | formData | `PRODUCT_BULK_IMAGE_UPLOAD` | per-file | 500 | ✓ | sku match |

### Sipariş yönetimi (3)

| Endpoint | Method | Zod | Audit | Tx | MAX | Notlar |
|---|---|---|---|---|---|---|
| `orders` | GET | query | — | N | — | — |
| `orders/[id]` | GET | — | — | N | — | — |
| `orders/[id]/status` | PATCH | `orderStatusUpdateSchema` | `ORDER_STATUS_CHANGE` | Y | — | stock rollback on cancel |
| `orders/bulk-status` | POST | array | `ORDER_BULK_STATUS_CHANGE` | per-loop | 500 | event cascade |

### İskonto (7)

| Endpoint | Method | Zod | Audit | Tx | MAX |
|---|---|---|---|---|---|
| `discounts` | GET/POST | `discountRuleSchema` | `DISCOUNT_CREATE` | N | — |
| `discounts/[id]` | PATCH/DELETE | partial | `DISCOUNT_UPDATE/DELETE` | N | — |
| `discounts/bulk` | POST | array | `DISCOUNT_BULK_ASSIGN` | upsert | 1000 |
| `discounts/copy` | POST | source/target dealerId | `DISCOUNT_COPY` | Y | — |
| `discounts/simulate` | POST | dealerId+products | — | N (read-only) | — |
| `discounts/template` | GET | — | — | N | — |
| `discounts/upload` | POST | excel | `DISCOUNT_BULK_IMPORT` | Y all-or-nothing | — |

### Diğer (8)

| Endpoint | Method | Zod | Audit | Notlar |
|---|---|---|---|---|
| `accounting/export` | GET | query | — **EKSIK** (P2-API-1) | csv\|xlsx |
| `categories[/id]` | GET/POST/PATCH/DELETE | `categoryCreate/UpdateSchema` | `CATEGORY_*` | tree |
| `publishers[/id]` | GET/POST/PATCH/DELETE | `publisherCreate/UpdateSchema` | `PUBLISHER_*` | — |
| `coupons[/id]` | GET/POST/PATCH/DELETE | `couponCreate/UpdateSchema` | — | unique code |
| `coupons/bulk-create` | POST | template+count | `COUPON_BULK_CREATE` | Y | 500 |
| `reviews[/id]` | GET/PATCH/DELETE | moderation | `REVIEW_*` | — |
| `reviews/bulk-status` | POST | array+action | `REVIEW_BULK_STATUS` | per-loop | 500 |
| `users[/id]` | GET/DELETE | — | `USER_DELETE/USER_ADMIN_DELETE` | Y (anonymize tx) | last-admin guard |
| `users/[id]/role` | PATCH | `userRoleUpdateSchema` | `USER_ROLE_CHANGE` | N | last-admin guard |
| `users/bulk-delete` | POST | array+mode | `USER_BULK_DELETE` | per-loop | 200 |
| `invoices[/id]` | GET/POST | retry | `INVOICE_*` | KolayBi atomic claim | — |

---

## MAX_AFFECTED özet tablosu

| Endpoint | Cap | Strateji |
|---|---:|---|
| `products/bulk-update` | 1000 | tek `updateMany` |
| `products/bulk-delete` | 500 | per-product soft/hard |
| `products/bulk-price` | 50000 | bucket-bazlı tx, dryRun zorunlu |
| `products/bulk-import` | dosya boyutu (10MB) | tek tx all-or-nothing |
| `products/bulk-upload-images` | 500 dosya × 5MB | per-file tx |
| `users/bulk-delete` | 200 | per-user soft/hard/anonymize |
| `dealers/bulk-approve` | 200 | per-dealer (PENDING filter) |
| `dealers/bulk-adjust-credit` | 500 | bucket tx (APPROVED+OPEN_ACCOUNT filter) |
| `orders/bulk-status` | 500 | per-order tx |
| `discounts/bulk` | 1000 | upsert |
| `coupons/bulk-create` | 500 | conflict skip |
| `reviews/bulk-status` | 500 | per-review |

✓ Tüm bulk endpoint'ler **filter-spec değil ID listesi** kabul ediyor → "tümünü seç" sayfaya değil seçime bağlı (UI tarafında filtre korunur).
✓ DryRun → Apply ayrımı: bulk-price + bulk-import + bulk-adjust-credit + bulk-upload-images.

## Bulgular

| Bölge | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| Admin endpoint | 0 | 0 | 1 | 4 |

Detay → `docs/PRODUCTION_AUDIT_P2.md`.
