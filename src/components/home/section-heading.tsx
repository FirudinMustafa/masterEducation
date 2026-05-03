import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/icons";

interface Props {
  /** Small uppercase label above title */
  eyebrow: string;
  title: string;
  /** Italic accent word inside title */
  italicWord?: string;
  subtitle?: string;
  link?: { href: string; label: string };
}

/**
 * Magazine-style numbered section header.
 * - Big light-gray background number
 * - Eyebrow with horizontal rule
 * - Display bold + serif italic accent word inline
 * - Optional CTA link on the right
 */
export function SectionHeading({
  eyebrow,
  title,
  italicWord,
  subtitle,
  link,
}: Props) {
  let parts: { text: string; italic: boolean }[] = [{ text: title, italic: false }];
  if (italicWord && title.includes(italicWord)) {
    const idx = title.indexOf(italicWord);
    parts = [
      { text: title.slice(0, idx), italic: false },
      { text: italicWord, italic: true },
      { text: title.slice(idx + italicWord.length), italic: false },
    ].filter((p) => p.text.length > 0);
  }

  return (
    <div className="mb-10 flex flex-col items-start justify-between gap-5 sm:mb-12 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        {/* Eyebrow — minimal, B&O hissi */}
        <div className="mb-4 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.3em] text-neutral-500">
          <span className="h-px w-10 bg-neutral-300" />
          <span>{eyebrow}</span>
        </div>

        {/* Title — bold display, isteğe göre italic accent */}
        <h2 className="font-display text-3xl font-black leading-[1.05] tracking-[-0.03em] text-neutral-950 sm:text-4xl md:text-5xl">
          {parts.map((p, i) =>
            p.italic ? (
              <span key={i} className="font-display italic text-brand-gold-dark">
                {p.text}
              </span>
            ) : (
              <span key={i}>{p.text}</span>
            )
          )}
        </h2>

        {subtitle && (
          <p className="mt-3 max-w-xl text-base text-neutral-600 sm:text-lg">{subtitle}</p>
        )}
      </div>

      {link && (
        <Link
          href={link.href}
          className="group inline-flex shrink-0 items-center gap-2 text-sm font-bold text-neutral-900 transition-colors hover:text-brand-gold-dark"
        >
          <span className="border-b-2 border-neutral-900 pb-0.5 transition-colors group-hover:border-brand-gold">
            {link.label}
          </span>
          <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}
