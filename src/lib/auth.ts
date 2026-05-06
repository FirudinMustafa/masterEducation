import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

// Constant-time decoy hash for timing equalization on missing-user path.
// Computed once at module load; bcrypt.compare against it costs the same as
// against any real user's hash, so attacker can't enumerate emails by latency.
const DECOY_HASH =
  "$2a$10$abcdefghijklmnopqrstuuJ6Qj3xZP7t2x5K6q9o2n1m0l9k8j7i6h5g4";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Sifre", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const emailKey = String(credentials.email).toLowerCase();

        // Per-email limit: hedefli brute-force bir tek kullaniciya yapilmasin.
        const emailRl = rateLimit(`login:email:${emailKey}`, 10, 15 * 60 * 1000);
        if (!emailRl.allowed) {
          throw new Error("Cok fazla giris denemesi. Biraz bekleyip tekrar deneyin.");
        }

        // Per-IP limit: password-spray (1 IP × N email × 10 deneme) bloklansin.
        // NextAuth v5 `req` Web Request — Headers API ile oku, defansif.
        const reqHeaders = (req as Request | undefined)?.headers;
        const xff = reqHeaders?.get("x-forwarded-for") ?? null;
        const realIp = reqHeaders?.get("x-real-ip") ?? null;
        const ip = (xff?.split(",")[0]?.trim() || realIp || "unknown") as string;
        const ipRl = rateLimit(`login:ip:${ip}`, 30, 15 * 60 * 1000);
        if (!ipRl.allowed) {
          throw new Error("Cok fazla giris denemesi. Biraz bekleyip tekrar deneyin.");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            dealer: { select: { status: true, id: true, paymentTerms: true } },
          },
        });

        // Timing-equalization: kullanici yoksa bile bcrypt.compare cagir
        // (yaklasik 70-100 ms CPU). Attacker latency farkindan email enumeration
        // yapamasin. Sonuc her halukarda fail.
        if (!user) {
          await bcrypt.compare(credentials.password as string, DECOY_HASH);
          return null;
        }

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!passwordMatch) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          dealerStatus: user.dealer?.status ?? null,
          dealerId: user.dealer?.id ?? null,
          dealerPaymentTerms: user.dealer?.paymentTerms ?? null,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.dealerStatus = user.dealerStatus;
        token.dealerId = user.dealerId;
        token.dealerPaymentTerms = user.dealerPaymentTerms;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;

        // Role + dealer fresh fetch — admin tarafindan rol/status/paymentTerms
        // degisikligi re-login olmadan anlik yansir.
        const u = await prisma.user.findUnique({
          where: { id: token.id },
          select: {
            role: true,
            dealer: {
              select: { id: true, status: true, paymentTerms: true },
            },
          },
        });
        session.user.role = u?.role ?? token.role;
        session.user.dealerId = u?.dealer?.id ?? null;
        session.user.dealerStatus = u?.dealer?.status ?? null;
        session.user.dealerPaymentTerms = u?.dealer?.paymentTerms ?? null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/giris",
  },
});
