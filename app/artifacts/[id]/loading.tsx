export default function Loading() {
  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl animate-pulse">
      <div className="h-4 bg-gray-100 rounded w-20 mb-6" />
      <div className="h-8 bg-gray-100 rounded w-1/2 mb-4" />
      <div className="h-4 bg-gray-100 rounded w-3/4 mb-6" />
      <div className="h-[600px] bg-gray-100 rounded-lg mb-8" />
    </main>
  )
}
