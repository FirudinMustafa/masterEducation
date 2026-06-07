/**
 * Editorial pull-quote section — magazine-style oversized italic quote
 * with red accent word and signature footer.
 */
export function BigQuote() {
  return (
    <section className="relative isolate overflow-hidden bg-gradient-to-b from-white to-neutral-50 py-20 sm:py-28 md:py-32">
      {/* Decorative quote mark */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-4 top-8 select-none font-display text-[200px] font-black leading-none text-brand-gold-light/60 sm:left-12 sm:top-12 sm:text-[320px] md:text-[440px]"
      >
        &ldquo;
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-16 right-4 select-none font-display text-[200px] font-black leading-none text-brand-gold-light/60 sm:-bottom-24 sm:right-12 sm:text-[320px] md:text-[440px]"
      >
        &rdquo;
      </div>

      <div className="relative mx-auto max-w-5xl px-6 text-center sm:px-8">
        {/* Eyebrow */}
        <div className="mb-8 flex items-center justify-center gap-3 text-xs font-bold uppercase tracking-[0.3em] text-brand-gold-dark">
          <span className="h-px w-12 bg-neutral-300" />
          <span>Manifest</span>
          <span className="h-px w-12 bg-neutral-300" />
        </div>

        <blockquote
          className="font-display text-3xl font-black leading-[1.1] tracking-[-0.025em] text-neutral-950 sm:text-5xl md:text-6xl lg:text-7xl"
          style={{ fontFamily: "var(--font-jakarta)" }}
        >
          Eğitim materyali sadece bir{" "}
          <span
            className="italic"
            style={{
              background: "linear-gradient(120deg, #DC2626 0%, #F5B800 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontWeight: 900,
            }}
          >
            kitap
          </span>{" "}
          degildir —{" "}
          <span className="italic text-neutral-600">ogrenmenin hizini ve derinligini</span>{" "}
          belirleyen bir{" "}
          <span
            className="italic"
            style={{
              background: "linear-gradient(120deg, #F5B800 0%, #DC2626 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
              fontWeight: 900,
            }}
          >
            arac
          </span>
          .
        </blockquote>

        {/* Signature */}
        <div className="mt-12 flex flex-col items-center gap-2">
          <div className="h-px w-16 bg-neutral-300" />
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-neutral-700">
            Master Education
          </p>
          <p className="text-xs text-neutral-500">2026 — Eğitim Yayinciliginin Gelecegi</p>
        </div>
      </div>
    </section>
  );
}
