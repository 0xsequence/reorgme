
export function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export async function waitCondition(promise: () => Promise<boolean | undefined>, sleep = 100): Promise<void> {
  while (true) {
    const res = await promise()
    if (!res) {
      await wait(sleep)
    } else {
      return
    }
  }
}

export async function waitFor<T>(promise: () => Promise<T | undefined>, sleep = 100): Promise<T> {
  while (true) {
    const res = await promise()
    if (res === undefined) {
      await wait(sleep)
    } else {
      return res
    }
  }
}

export function parseDockerReason(err: Error | string): string {
  const str = err.toString()
  const split = str.split(' - ')

  if (split.length > 1) {
    return split[1]
  }

  return str
}