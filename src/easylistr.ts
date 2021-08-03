import Listr from "listr"

export type LestrInput<T> = {
  title: string,
  task: (opts: { title: (title: string) => void, output: (output: string) => void, task: Listr.ListrTaskWrapper<any> }) => Promise<T>
}

export async function Lestr<T>(...tasks: LestrInput<T>[] | LestrInput<T>[][]): Promise<T[]> {
  const allTasks = (tasks as any).reduce((a: any, v: any) => a.concat(v), []) as LestrInput<T>[]

  const res = await (new Listr<any>(allTasks.map((t, i) => ({
    title: t.title,
    task: async (ctx, task) => {
      const title = (title: string) => { task.title = title }
      const output = (output: string) => { task.output = output }
      ctx[i] = await t.task({ title, output, task })
    }
  })), { concurrent: true, exitOnError: false })).run()

  return tasks.map((_, i) => res[i])
}
