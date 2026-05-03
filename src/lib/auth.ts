import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Sifre", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const emailKey = String(credentials.email).toLowerCase();
        const rl = rateLimit(`login:${emailKey}`, 10, 15 * 60 * 1000);
        if (!rl.allowed) {
          throw new Error("Cok fazla giris denemesi. Biraz bekleyip tekrar deneyin.");
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
          include: {
            dealer: { select: { status: true, id: true, paymentTerms: true } },
          },
        });

        if (!user) return null;

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
