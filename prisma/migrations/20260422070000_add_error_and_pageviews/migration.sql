-- CreateTable: error_logs
CREATE TABLE "error_logs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "url" TEXT,
    "userId" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "error_logs_createdAt_idx" ON "error_logs"("createdAt");
CREATE INDEX "error_logs_source_idx" ON "error_logs"("source");

-- CreateTable: page_views
CREATE TABLE "page_views" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "referer" TEXT,
    "userId" TEXT,
    "sessionId" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "page_views_path_idx" ON "page_views"("path");
CREATE INDEX "page_views_createdAt_idx" ON "page_views"("createdAt");
