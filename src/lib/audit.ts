import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AuditAction =
  | "DEALER_APPROVE"
  | "DEALER_REJECT"
  | "DEALER_SUSPEND"
  | "DEALER_UPDATE"
  | "DEALER_APPLY"
  | "DEALER_CREATE_ADMIN"
  | "ADMIN_SET_PASSWORD"
  | "DISCOUNT_CREATE"
  | "DISCOUNT_UPDATE"
  | "DISCOUNT_DELETE"
  | "DISCOUNT_BULK_IMPORT"
  | "DISCOUNT_BULK_ASSIGN"
  | "DISCOUNT_COPY"
  | "ORDER_STATUS_CHANGE"
  | "ORDER_BULK_STATUS_CHANGE"
  | "ORDER_CREATE"
  | "ORDER_DELETE"
  | "ORDER_BULK_DELETE"
  | "USER_ROLE_CHANGE"
  | "USER_DELETE"
  | "USER_ADMIN_DELETE"
  | "AUTH_LOGIN_FAIL"
  | "AUTH_REGISTER_ATTEMPT_EXISTING"
  | "PRODUCT_CREATE"
  | "PRODUCT_UPDATE"
  | "PRODUCT_DELETE"
  | "PRODUCT_IMAGE_UPLOAD"
  | "PRODUCT_IMAGE_DELETE"
  | "PRODUCT_BULK_IMPORT"
  | "PRODUCT_BULK_UPDATE"
  | "PRODUCT_BULK_DELETE"
  | "PRODUCT_BULK_PRICE_UPDATE"
  | "PRODUCT_BULK_IMAGE_UPLOAD"
  | "CATEGORY_CREATE"
  | "CATEGORY_UPDATE"
  | "CATEGORY_DELETE"
  | "PUBLISHER_CREATE"
  | "PUBLISHER_UPDATE"
  | "PUBLISHER_DELETE"
  | "DEALER_PAYMENT"
  | "DEALER_ADJUSTMENT"
  | "DEALER_DOCUMENT_UPLOAD"
  | "DEALER_DOCUMENT_DELETE"
  | "DEALER_DOCUMENT_REVIEW"
  | "DEALER_BULK_APPROVE"
  | "DEALER_BULK_CREDIT_ADJUST"
  | "DEALER_BULK_ORDER"
  | "ADDRESS_CREATE"
  | "ADDRESS_UPDATE"
  | "ADDRESS_DELETE"
  | "USER_SELF_DELETE"
  | "USER_PROFILE_UPDATE"
  | "USER_PASSWORD_CHANGE"
  | "CONTACT_FORM_SUBMIT"
  | "EMAIL_VERIFY_REQUEST"
  | "EMAIL_VERIFY_SUCCESS"
  | "REVIEW_CREATE"
  | "REVIEW_UPDATE"
  | "REVIEW_DELETE"
  | "DEALER_STATEMENT_EXPORT"
  | "ACCOUNTING_EXPORT"
  | "COUPON_VALIDATE"
  | "COUPON_BULK_CREATE"
  | "REVIEW_BULK_STATUS"
  | "USER_BULK_DELETE"
  | "INVOICE_CREATE"
  | "INVOICE_SEND"
  | "INVOICE_RETRY_BATCH"
  | "INVOICE_FAIL"
  | "KVKK_APPLICATION_SUBMITTED"
  | "USER_CONSENT_GIVEN"
  | "ORDER_CONTRACTS_ACCEPTED";

export type AuditEntity =
  | "dealer"
  | "discount"
  | "order"
  | "user"
  | "product"
  | "category"
  | "publisher"
  | "coupon"
  | "review"
  | "invoice"
  | "system"
  | "kvkk_application"
  | "consent";

export interface AuditInput {
  actorId: string | null;
  action: AuditAction;
  entityType: AuditEntity;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Hassas anahtarlar — yanlislikla audit metadata'ya yazilirsa "[REDACTED]"
 * ile maskelenir. Ihlal/log breach durumunda parola/token sizmaz.
 */
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /^pwd$/i,
  /secret/i,
  /token/i, // resetToken, accessToken vb.
  /^otp$/i,
  /\bcvv\b/i,
  /\bpin\b/i,
  /cardnumber/i,
  /card_number/i,
  /\bcard$/i,
  /api[_-]?key/i,
  /authorization/i,
  /bearer/i,
  // KolayBi'ye özel: Channel alanı da hassas (api.support'tan alınır, partner ID)
  /^channel$/i,
];

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
}

const REDACTED = "[REDACTED]";

/**
 * Recursive sanitize: object/array içindeki sensitive key'leri redact et.
 * Defansif — geliştirici metadata'ya `password: "..."` koysa bile DB'ye
 * gitmeden maskeyle değişir.
 *
 * P3-A09-1 (Bölüm 2): Cycle + depth guard. WeakSet ile zaten ziyaret edilen
 * objeleri "[CYCLIC]" ile değiştir; 8 seviyeden derin yapıları "[TOO_DEEP]"
 * ile keser. Saldırgan kontrollü prototype-pollution payload veya kazara
 * circular reference (Prisma'nın connect.obj.model.relation gibi) JSON.stringify'da
 * sonsuz döngü yaratmasın.
 */
const MAX_DEPTH = 8;
const CYCLIC = "[CYCLIC]";
const TOO_DEEP = "[TOO_DEEP]";

function sanitize(
  value: unknown,
  seen: WeakSet<object>,
  depth: number
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (depth > MAX_DEPTH) return TOO_DEEP;
  if (seen.has(value as object)) return CYCLIC;
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((v) => sanitize(v, seen, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(k)) {
      out[k] = REDACTED;
    } else {
      out[k] = sanitize(v, seen, depth + 1);
    }
  }
  return out;
}

export function sanitizeAuditMetadata(value: unknown): unknown {
  return sanitize(value, new WeakSet(), 0);
}

/**
 * Fire-and-forget audit write. We never want audit failure to break the
 * caller, so errors are logged and swallowed.
 *
 * Metadata recursive sanitize edilir — geliştirici hatasıyla password/token
 * gibi hassas değerler DB'ye yazılmaz.
 */
export function logAudit(input: AuditInput): void {
  const safeMetadata =
    input.metadata !== undefined
      ? (sanitizeAuditMetadata(input.metadata) as Prisma.InputJsonValue)
      : undefined;
  prisma.auditLog
    .create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: safeMetadata,
      },
    })
    .catch((err) => {
      console.error("[audit] write failed", err);
    });
}
