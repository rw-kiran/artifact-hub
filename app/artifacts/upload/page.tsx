import { UploadForm } from '@/components/UploadForm'

export default function UploadPage() {
  return (
    <main className="container mx-auto px-4 py-8 max-w-xl">
      <h1 className="text-2xl font-bold mb-6">Upload Artifact</h1>
      <UploadForm />
    </main>
  )
}
