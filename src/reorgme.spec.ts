
import { Reorgme } from './reorgme'
import { ethers } from 'ethers'
import { wait } from './utils'

async function commonHead(...providers: ethers.providers.Provider[]): Promise<ethers.providers.Block | undefined> {
  const blocksEqual = async (block: ethers.providers.Block, providers: ethers.providers.Provider[]) => {
    const allBlocks = await Promise.all(providers.map(async (p) => {
      try {
        const b = await p.getBlock(block.number)
        return b === null ? undefined : b
      } catch {}
    }))

    return allBlocks.reduce((c, v) => c && v?.hash === block.hash, true)
  }

  let cand = await providers[0].getBlock('latest')

  while (!(await blocksEqual(cand, providers.slice(1))) && cand.number != 0) {
    cand = await providers[0].getBlock(cand.number - 1)
  }

  return cand.number == 0 ? undefined : cand
}

test('Should start testnet, fork and join back', async () => {
  jest.setTimeout(45 * 60 * 1000) // 45 minutes timeout

  const reorgme = new Reorgme({ id: 1 })

  // Start blockchain
  await reorgme.start()

  // Get providers
  const provider0 = await reorgme.rpcProvider(0)
  const provider1 = await reorgme.rpcProvider(1)
  const provider2 = await reorgme.rpcProvider(1)

  // Blocks must be in sync
  const commonBlock = await commonHead(provider0, provider1, provider2)
  expect(commonBlock?.number).toBeDefined()
  expect(commonBlock?.number).toBeGreaterThan(0)

  // Fork the chain
  await reorgme.fork()

  const lastBlockForkCommon = await commonHead(provider0, provider1, provider2)
  const lastBlockFork1 = await commonHead(provider0)
  const lastBlockFork2 = await commonHead(provider1, provider2)

  expect(lastBlockForkCommon?.number).toBeDefined()
  expect(lastBlockForkCommon?.number).toBeGreaterThanOrEqual(commonBlock!.number)

  expect(lastBlockFork1?.number).toBeGreaterThan(lastBlockForkCommon!.number)
  expect(lastBlockFork2?.number).toBeGreaterThan(lastBlockForkCommon!.number)

  // Wait 10 seconds
  await wait(10 * 1000)

  // Rejoin the chain
  await reorgme.join()

  const rejoinedLastBlock = await commonHead(provider0, provider1, provider2)
  expect(rejoinedLastBlock?.number).toBeDefined()
  expect(rejoinedLastBlock?.number).toBeGreaterThan(lastBlockForkCommon!.number)
  expect(rejoinedLastBlock?.number).toBeGreaterThan(lastBlockFork1!.number)
  expect(rejoinedLastBlock?.number).toBeGreaterThan(lastBlockFork2!.number)
})
