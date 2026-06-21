export default function Loading() {
  return (
    <main className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="h-10 bg-gray-100 rounded-lg animate-pulse mb-6" />
      <div className="flex gap-2 mb-6">
        {[80, 60, 70, 56].map((w) => (
          <div key={w} className={`h-8 w-${w} bg-gray-100 rounded-md animate-pulse`} />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-white animate-pulse">
            <div className="h-36 bg-gray-100 rounded-t-lg" />
            <div className="p-4 space-y-3">
              <div className="h-4 bg-gray-100 rounded w-3/4" />
              <div className="h-3 bg-gray-100 rounded w-full" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}
