export type ArtifactType = 'html' | 'image' | 'pdf'
export type Visibility = 'public' | 'private'

export interface Artifact {
  id: string
  title: string
  description: string
  tags: string[]
  type: ArtifactType
  blob_url: string
  blob_pathname: string
  created_by: string | null
  creator_name: string | null
  creator_email: string | null
  visibility: Visibility
  feedback_summary: string | null
  index_status: 'pending' | 'indexed' | 'failed'
  created_at: string
  updated_at: string
}


export interface Feedback {
  id: string
  artifact_id: string
  author_email: string
  author_name: string | null
  content: string
  rating: number | null
  created_at: string
}

export interface ShareToken {
  id: string
  artifact_id: string
  token: string
  expires_at: string
  created_at: string
}

// API response shapes
export interface ApiError {
  error: string
  code: string
}

export interface McpApiKey {
  id: string
  name: string
  key_prefix: string
  key_raw?: string | null  // only present immediately after creation (POST response)
  created_at: string
  last_used_at: string | null
}

