'use client'

export function SearchBar({ defaultValue }: { defaultValue?: string }) {
  return (
    <form method="GET" action="/" className="flex gap-2">
      <input
        name="q"
        type="search"
        defaultValue={defaultValue}
        placeholder="Search artifacts..."
        className="flex-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-black"
      />
      <button
        type="submit"
        className="px-4 py-2 text-sm font-medium bg-black text-white rounded-md hover:bg-gray-800"
      >
        Search
      </button>
    </form>
  )
}
