// P2-PAGE-4: siparis-takip form loading skeleton.
export default function Loading() {
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-12">
      <div className="animate-pulse">
        <div className="h-7 w-44 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-72 bg-gray-100 rounded mb-6" />
        <div className="space-y-3">
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-10 bg-gray-100 rounded" />
          <div className="h-11 w-full bg-gray-200 rounded" />
        </div>
      </div>
    </div>
  );
}
