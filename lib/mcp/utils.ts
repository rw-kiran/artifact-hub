export function isFkViolation(msg: string): boolean {
  return msg.includes('violates foreign key constraint')
}

// ponytail: fastmcp/edge doesn't run Zod validation on inputs — guard manually where it matters
export function assertUuid(val: unknown, name: string): asserts val is string {
  if (typeof val !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)) {
    throw new Error(`Invalid ${name}: "${val}". Expected a UUID (e.g. from list_artifacts()).`)
  }
}
