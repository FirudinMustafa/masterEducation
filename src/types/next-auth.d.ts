import type { UserRole, DealerStatus, DealerPaymentTerms } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      dealerStatus: DealerStatus | null;
      dealerId: string | null;
      dealerPaymentTerms: DealerPaymentTerms | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: UserRole;
    dealerStatus: DealerStatus | null;
    dealerId: string | null;
    dealerPaymentTerms: DealerPaymentTerms | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    dealerStatus: DealerStatus | null;
    dealerId: string | null;
    dealerPaymentTerms: DealerPaymentTerms | null;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    dealerStatus: DealerStatus | null;
    dealerId: string | null;
    dealerPaymentTerms: DealerPaymentTerms | null;
  }
}
