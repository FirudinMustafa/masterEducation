// P2-PAGE-3: kargo-takip detay loading skeleton.
export default function Loading() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="animate-pulse">
        <div className="h-8 w-48 bg-gray-200 rounded mb-3" />
        <div className="h-4 w-64 bg-gray-100 rounded mb-6" />
        <div className="rounded-lg border border-gray-200 p-5 space-y-4">
          <div className="h-5 w-32 bg-gray-200 rounded" />
          <div className="h-4 w-3/4 bg-gray-100 rounded" />
          <div className="h-4 w-2/3 bg-gray-100 rounded" />
          <div className="border-t border-gray-100 pt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-3 w-3 rounded-full bg-gray-200 mt-1.5" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-1/2 bg-gray-200 rounded" />
                  <div className="h-3 w-1/3 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
