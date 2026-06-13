import Link from "next/link";

export interface ShowcaseCategory {
  slug: string;
  name: string;
  count: number;
}

// 8 ana kategori slug'ı → emoji/ikon + arkaplan tonu. Bilinmeyen slug nötr ton alır.
const STYLE: Record<string, { icon: string; tone: string }> = {
  "ders-kitabi": { icon: "📘", tone: "bg-blue-50 text-blue-700" },
  "yardimci-ders-kaynagi": { icon: "✏️", tone: "bg-amber-50 text-amber-700" },
  "hikaye-kitabi": { icon: "📖", tone: "bg-rose-50 text-rose-700" },
  "skills-kitabi": { icon: "🎯", tone: "bg-emerald-50 text-emerald-700" },
  dijital: { icon: "💻", tone: "bg-indigo-50 text-indigo-700" },
  "kultur-kitabi": { icon: "🌍", tone: "bg-teal-50 text-teal-700" },
  "ogretmen-kitabi": { icon: "🍎", tone: "bg-orange-50 text-orange-700" },
  sozluk: { icon: "🔤", tone: "bg-purple-50 text-purple-700" },
};

const DEFAULT_STYLE = { icon: "📚", tone: "bg-neutral-100 text-neutral-700" };

export function CategoryShowcase({ categories }: { categories: ShowcaseCategory[] }) {
  if (categories.length === 0) return null;
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand-gold-dark">
            Kategoriler
          </p>
          <h2 className="mt-1 text-2xl font-display font-bold text-brand-black">
            Ne arıyorsunuz?
          </h2>
        </div>
        <Link
          href="/urunler"
          className="text-sm font-medium text-brand-gold-dark hover:underline"
        >
          Tüm ürünler →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map((c) => {
          const st = STYLE[c.slug] ?? DEFAULT_STYLE;
          return (
            <Link
              key={c.slug}
              href={`/kategoriler/${c.slug}`}
              className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-brand-gold hover:shadow-sm"
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-2xl ${st.tone}`}
              >
                {st.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-brand-black group-hover:text-brand-gold-dark">
                  {c.name}
                </span>
                <span className="block text-xs text-gray-500">{c.count} ürün</span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
