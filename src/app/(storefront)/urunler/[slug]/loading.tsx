export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="aspect-[3/4] bg-gray-100 rounded-lg" />
        <div className="space-y-4">
          <div className="h-8 w-3/4 bg-gray-200 rounded" />
          <div className="h-4 w-1/2 bg-gray-100 rounded" />
          <div className="h-10 w-32 bg-gray-200 rounded" />
          <div className="space-y-2 pt-4">
            <div className="h-3 bg-gray-100 rounded" />
            <div className="h-3 bg-gray-100 rounded" />
            <div className="h-3 w-3/4 bg-gray-100 rounded" />
          </div>
          <div className="h-12 w-full bg-gray-200 rounded mt-6" />
        </div>
      </div>
    </div>
  );
}
