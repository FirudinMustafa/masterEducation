/**
 * Admin listeleme sayfalarinda kullanilan standart search bar.
 * URL query param `ara=...` ile calisir — sunucu tarafi sayfada filtre uygular.
 */

interface Props {
  /** Mevcut arama degeri (URL'den). */
  defaultValue?: string;
  /** Input placeholder. */
  placeholder: string;
  /** Form submit'inde korunacak diger query paramlari. */
  hiddenParams?: Record<string, string | undefined>;
}

export function AdminSearchBar({ defaultValue, placeholder, hiddenParams }: Props) {
  return (
    <form className="mb-4 flex gap-2" method="get">
      <div className="relative flex-1 max-w-md">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          />
        </svg>
        <input
          type="search"
          name="ara"
          defaultValue={defaultValue ?? ""}
          placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-gold/30 focus:border-brand-gold"
        />
      </div>
      {hiddenParams &&
        Object.entries(hiddenParams)
          .filter(([, v]) => v !== undefined && v !== "")
          .map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button
        type="submit"
        className="px-4 py-2 bg-brand-gold text-brand-black text-sm font-semibold rounded-lg hover:bg-brand-gold-dark cursor-pointer"
      >
        Ara
      </button>
      {defaultValue && (
        <a
          href="?"
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 cursor-pointer"
          title="Aramayi temizle"
        >
          Temizle
        </a>
      )}
    </form>
  );
}
