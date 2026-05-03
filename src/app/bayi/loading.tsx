export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-7 w-40 bg-gray-200 rounded mb-6" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-16 bg-white border border-gray-200 rounded-lg"
          />
        ))}
      </div>
    </div>
  );
}
