export async function mockDelay(ms = 300): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export function clone<T>(value: T): T {
  return structuredClone(value)
}
