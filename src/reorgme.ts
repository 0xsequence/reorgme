import Dockerode, { DockerOptions } from "dockerode"
import * as fs from 'fs'
import { ethers } from 'ethers'
import { waitCondition, waitFor } from "./utils"
import { Lestr } from "./easylistr"
import chalk from "chalk"

export const CONTAINER_PREFIX = "reorgme_geth_child"
export const VOLUME_PREFIX = "reorgme_geth_child"
export const NETWORK_PREFIX = "reorgme_geth_network"

const colors = [
  chalk.blue,
  chalk.green,
  chalk.red
]

export const SAMPLE_GENESIS = {
  "config": {
    "chainId": 9999,
    "homesteadBlock": 0,
    "eip150Block": 0,
    "eip155Block": 0,
    "eip158Block": 0,
    "byzantiumBlock": 0,
    "constantinopleBlock": 0,
    "petersburgBlock": 0,
    "ethash": {}
  },
  "difficulty": "1",
  "gasLimit": "8000000",
  "alloc": {
    "7df9a875a174b3bc565e6424a0050ebc1b2d1d82": { "balance": "300000" },
    "f41c74c9ae680c1aa78f42e5647a62f353b7bdde": { "balance": "400000" }
  }
}

export type NodeKeys = {
  pub: string,
  pk: string,
}

export type ReorgmeOptions = {
  id?: number
  dockerOptions?: DockerOptions
}

export const ReorgmeDefaults = {
  id: 0,
}

export class Reorgme {
  public id: number

  public docker: Dockerode
  public image = "ethereum/client-go"

  public nodeKeys: NodeKeys[] = [{
    pk: "5a15d2e35fed8432f61d4e8b1a3cd0b4da90c614e58dac05530cbafb4f787058",
    pub: "e99bb0f05340ca93706d6a185236cfbd8270b4b9ee93b71c5c330edd4879dbf03869698d8e86ac76f6cca3808756e1605efa547ca9393c75bfde51e475d57992"
  }, {
    pk: "79621f477d0abc62ff0f1a7862f4b0ca1cfdfa0b5e277eee327d2a0d9dbcc8f5",
    pub: "9a7aba69d13cc95e85039d5cf36af4ea6d8eb0c30aa70dc550483524ea86aff1d19938f2ecdc793df821ceb3b6678da0324d39a1f613d8725cf1a2454268cf28"
  }, {
    pk: "4efa315cb0cecc240b8dac6ce06af8c43709e3b016836f5b7ae20fefeec7ef10",
    pub: "de2c0919fb6612aa6c50e36c28ff4767317c07987de9a4390f5044ae9d00946cd00db4bff13408957d798315598ebf9a3e62266c9506d27bc6d01470b7f8c070"
  }]

  constructor(options?: ReorgmeOptions) {
    const opts = { ...ReorgmeDefaults, ...options }

    this.id = opts.id
    this.docker = new Dockerode(opts.dockerOptions)
  }

  public containerName(index: number) {
    return `${this.containerPrefix()}_${index}`
  }

  public peerIds(index: number) {
    return [0, 1, 2].filter((v) => v !== index)
  }

  public containerNames(): string[] {
    return new Array(3).fill(0).map((_, i) => this.containerName(i))
  }

  public forkedContainer(): string {
    return this.containerName(0)
  }

  public tmpContainerName(): string {
    return `${this.containerPrefix()}_tmp`
  }

  public volumeName(index: number) {
    return `${this.volumePrefix()}_${index}`
  }

  public volumeGenesis() {
    return `${this.volumePrefix()}_genesis`
  }

  public volumeDag() {
    return `${this.volumePrefix()}_dag`
  }

  public tmpFolder() {
    return `/tmp/reorgme_${this.id}`
  }

  public mustExistTmpFolder() {
    if (!fs.existsSync(this.tmpFolder())) {
      fs.mkdirSync(this.tmpFolder())
    }
  }

  public containerPrefix() {
    return `${CONTAINER_PREFIX}_${this.id}`
  }

  public volumePrefix() {
    return `${VOLUME_PREFIX}_${this.id}`
  }

  public networkName() {
    return `${NETWORK_PREFIX}_${this.id}`
  }

  public internalNetworkName() {
    return `${NETWORK_PREFIX}_${this.id}_internal`
  }

  public async logs() {
    const containers = this.containerNames()
    const streams = await Promise.all(containers.map((c) => this.docker.getContainer(c).logs(
      { stdout: true, stderr: true, tail: 10, follow: true }
    )))

    containers.forEach((c, i) => {
      streams[i].on("data", (data) => {
        console.log(`${colors[i](c + ":")} ${data.slice(8).toString().replace('\n', '')}`)
      })
    })
  }

  public async enodeOf(index: number) {
    const container = await waitFor(async () => { try { return await this.docker.getContainer(this.containerName(index)) } catch {} })
    const netInfo = await waitFor(async () => (await container.inspect()).NetworkSettings.Networks[this.internalNetworkName()])
    return `enode://${this.nodeKeys[index].pub}@${netInfo.IPAddress}:30303`
    // return `enode://${this.nodeKeys[index].pub}@${this.volumeName(index)}:30303`
  }

  public async rpcUrl(index: number) {
    const container = this.docker.getContainer(this.containerName(index))
    return `http://${(await container.inspect()).NetworkSettings.Networks[this.networkName()].IPAddress}:8545/`
  }

  public async rpcProvider(index: number) {
    return new ethers.providers.JsonRpcProvider(await this.rpcUrl(index))
  }

  public async clearContainers() {
    // Find all existing containers of reorgme
    const [containers] = await Lestr({
      title: "Loading existing containers",
      task: async({ title }) => {
        const containers = await this.docker.listContainers({ all: true })
        const found = containers.filter((v) => v.Names.find((s) => s.replace('/', '').startsWith(this.containerPrefix())) !== undefined)
        title(`Found ${found.length} existing containers`)
        return found
      }
    })

    await Lestr(containers.map((c) => ({
      title: `Removing container ${c.Names[0]}`,
      task: async ({ title, output }) => {
        if (c.State === 'running') {
          output("Stopping container")
          await this.docker.getContainer(c.Id).stop({ t: 0 })
        }

        output("Removing container")
        await this.docker.getContainer(c.Id).remove({ t: 0, force: true })
        title(`Removed container ${c.Names[0]}`)
      }
    })))
  }

  public async clearVolumes() {
    // Find all volumes of reorgme
    const [volumes] = await Lestr({
      title: "Loading existing containers",
      task: async ({ title }) => {
        const volumes = (await this.docker.listVolumes()).Volumes.filter((v) => v.Name.startsWith(this.volumePrefix()))
        title(`Found ${volumes.length} existing volumes`)
        return volumes
      }
    })

    await Lestr(volumes.map((v) => ({
      title: `Removing volume ${v.Name}`,
      task: async ({ title }) => {
        await this.docker.getVolume(v.Name).remove()
        title(`Removed volume ${v.Name}`)
      }
    })))
  }

  public async clearNetwork(name: string) {
    // Find network and delete if found
    const found = (await this.docker.listNetworks()).filter((n) => n.Name === name)
    return Promise.all(found.map((n) => this.docker.getNetwork(n.Id).remove()))
  }

  public async clearAll() {
    await this.clearContainers()
    await this.clearVolumes()
    await this.clearNetwork(this.networkName())
    await this.clearNetwork(this.internalNetworkName())
  }

  public async mustNetwork(name: string) {
    return Lestr({
      title: `Creating network ${name}`,
      task: async ({ title, output }) => {
        output('Removing old network')
        await this.clearNetwork(name)
        output('Creating new network')
        const net = await this.docker.createNetwork({ Internal: true, Name: name, Driver: "bridge" })
        title(`Created network ${name} ${net.id.slice(0, 5)}`)
      }  
    })
  }

  public async stop() {
    await this.clearContainers()
    await this.clearVolumes()
  }

  public async pause() {
    return Lestr(this.containerNames().map((c) => ({
      title: `Pausing container ${c}`,
      task: async ({ title, output }) => {
        output('Get container information')
        const container = this.docker.getContainer(c)
        const inspect = await container.inspect()
        if (!inspect.State.Paused) {
          output('Pausing container')
          await container.pause()
          title(`Paused container ${c}`)
        } else {
          if (!inspect.State.Running) {
            throw new Error(`Container ${c} not found`)
          }

          title(`Container ${c} already paused`)
        }
      }
    })))
  }

  public async resume() {
    return Lestr(this.containerNames().map((c) => ({
      title: `Resuming container ${c}`,
      task: async ({ title, output }) => {
        output('Get container information')
        const container = this.docker.getContainer(c)
        const inspect = await container.inspect()

        if (inspect.State.Paused) {
          output('Resuming container')
          await container.unpause()
          title(`Resumed container ${c}`)
        } else {
          if (!inspect.State.Running) {
            throw new Error(`Container ${c} not found`)
          }

          title(`Container ${c} not paused`)
        }
      }
    })))
  }

  public async waitForContainer(index: number) {
    return waitCondition(async () => {
      try {
        const detail = await this.docker.getContainer(this.containerName(index)).inspect()
        return detail.State.Running
      } catch {}
    })
  }

  public async join() {
    return Lestr({
      title: `Joining ${this.forkedContainer()}`,
      task: async ({ title, output }) => {
        output(`Connecting to internal network`)
        await this.docker.getNetwork(this.internalNetworkName()).connect({ Container: this.forkedContainer() })

        output('Waiting for block sync')
        const provider = await this.rpcProvider(0)
        const altProvider = await this.rpcProvider(1)

        let lastBlock: ethers.providers.Block
        let lastAltBlock: ethers.providers.Block

        await waitCondition(async () => {
          const block = await provider.getBlock('latest')
          if (lastBlock && block.number === lastBlock?.number) return false
          lastBlock = block

          output(`Found block ${block.number}:${block.hash.slice(0, 5)} on ${this.forkedContainer()}`)
          lastAltBlock = await waitFor(async () => {
            try {
              const b = await altProvider.getBlock(block.number)
              return b === null ? undefined : b
            } catch {}
          })
          output(`Compare with other nodes ${block.number}:${block.hash.slice(0, 5)} vs ${lastAltBlock.number}:${lastAltBlock.hash.slice(0, 5)}`)
          return lastAltBlock.hash === block.hash
        })

        title(`Joined ${this.forkedContainer()}`)
      }
    })
  }

  public async fork() {
    return Lestr({
      title: `Forking ${this.forkedContainer()}`,
      task: async ({ title, output }) => {
        output(`Disconnecting from internal network`)
        await this.docker.getNetwork(this.internalNetworkName()).disconnect({ Container: this.forkedContainer() })

        output('Waiting for block split')
        const provider = await this.rpcProvider(0)
        const altProvider = await this.rpcProvider(1)

        let lastBlock: ethers.providers.Block
        let lastAltBlock: ethers.providers.Block

        await waitCondition(async () => {
          const block = await provider.getBlock('latest')
          if (lastBlock && block.number === lastBlock?.number) return false
          lastBlock = block

          output(`Found block ${block.number}:${block.hash.slice(0, 5)} on ${this.forkedContainer()}`)
          lastAltBlock = await waitFor(async () => {
            try {
              return await altProvider.getBlock(block.number)
            } catch {}
          })
          output(`Compare with other nodes ${block.number}:${block.hash.slice(0, 5)} vs ${lastAltBlock.number}:${lastAltBlock.hash.slice(0, 5)}`)
          return lastAltBlock.hash !== block.hash
        })

        title(`Forked ${this.forkedContainer()}`)
      }
    })
  }

  validateDockerImageTask(image: string) {
    return {
      title: `Validating docker image: ${image}`,
      task: async ({ title, output }: { title: (s: string) => void, output: (s: string) => void }) => {
        const exists = async () => {
          try {
            return (await this.docker.getImage(image).inspect()) !== undefined
          } catch {}
          return false
        }
  
        output('Checking if image is locally available')
        if (await exists()) {
          title(`Using locally found docker image for ${image}`)
          return
        }
  
        output(`Downloading image`)
        await this.docker.pull(image)
  
        await waitCondition(() => exists())
  
        title(`Downloaded docker image: ${image}`)
      }
    }
  }

  public async start() {
    await this.clearContainers()
    await this.clearVolumes()

    await Lestr(
      this.validateDockerImageTask(this.image),
      this.validateDockerImageTask("alpine")
    )

    await this.mustNetwork(this.networkName())
    await this.mustNetwork(this.internalNetworkName())

    // Copy genesis block to container
    await Lestr({
      title: 'Writing genesis block',
      task: async({ title }) => {
        this.mustExistTmpFolder()
        fs.writeFileSync(`${this.tmpFolder()}/genesis.json`, JSON.stringify(SAMPLE_GENESIS))
        title('Written genesis block file')
      }
    })

    // Generating a single DAG
    // then copying to the other nodes
    // this saves reduces the total CPU usage to only 1/3
    await Lestr({
      title: 'Generating DAG',
      task: async ({ title, output }) => {
        const volume = this.volumeDag()
        const name = this.containerName(0)

        output(`Creating volume ${volume}`)
        await this.docker.createVolume({ name: volume })

        // Init network data using genesis
        output('Creating initialization database container')
        const initContainer = await this.docker.createContainer({
          Image: this.image,
          name: `${name}_tmp`,
          Cmd: [
            'init',
            '--datadir',
            '/data',
            '/genesis/genesis.json'
          ],
          Tty: true,
          AttachStdin: false,
          AttachStdout: true,
          AttachStderr: true,
          OpenStdin: false,
          StdinOnce: false,
          HostConfig: {
            NetworkMode: `${this.networkName()}`,
            Binds: [
              `${this.tmpFolder()}:/genesis`,
              `${volume}:/data`
            ],
            AutoRemove: true
          }
        })

        output('Starting initialization database container')
        await initContainer.start()

        output('Waiting for geth database initialization')
        await waitCondition(async () => {
          return !((await this.docker.listContainers({ all: true })).find((c) => c.Names.find((n) => n.replace('/', '').startsWith(name)) !== undefined) !== undefined)
        })

        output('Creating container')
        const container = await this.docker.createContainer({
          Image: this.image,
          name: name,
          Cmd: [
            '--nocompaction',
            '--nousb',
            '--datadir',
            '/data',
            '--mine',
            '--miner.threads',
            '1',
            '--miner.etherbase',
            '0x646b186c9ccAD43a0b9c8E4efd1d9F4a2D20c358',
            '--ethash.dagdir',
            '/data/.ethash'
          ],
          HostConfig: {
            NetworkMode: `${this.networkName()}`,
            Binds: [
              `${volume}:/data`
            ]
          }
        })

        output('Starting node')
        await container.start()

        output('Generating DAG')
        await waitCondition(async () => {
          const logs = await container.logs({ stdout: true, stderr: true, follow: false }) as unknown as Buffer
          if (logs.includes("Generating DAG in progress")) {
            const logs2 = await container.logs({ tail: 16, stdout: true, stderr: true, follow: false }) as unknown as Buffer
            return !logs2.includes("Generating DAG in progress")
          }
        }, 1000)

        output('Stopping container')
        await this.docker.getContainer(name).stop({ t: 60000 })

        output('Removing container')
        await this.docker.getContainer(name).remove()

        title('Generated DAG')
      }
    })

    // Create containers
    await Lestr(this.containerNames().map((name, i) => ({
      title: `Starting node ${name}`,
      task: async ({ title, output }) => {
        const volume = this.volumeName(i)

        output(`Creating volume ${volume}`)
        await this.docker.createVolume({ name: volume })

        // Init network data using genesis
        output('Copy DAG and init database')
        const copyContainer = await this.docker.createContainer({
          Image: 'alpine',
          name: name,
          Cmd: [
            'cp',
            '-a',
            '-v',
            '/data1/.',
            '/data2'
          ],
          Tty: true,
          AttachStdin: false,
          AttachStdout: true,
          AttachStderr: true,
          OpenStdin: false,
          StdinOnce: false,
          HostConfig: {
            Binds: [
              `${this.volumeDag()}:/data1`,
              `${volume}:/data2`
            ],
            AutoRemove: true
          }
        })

        output('Starting copy DAG')
        await copyContainer.start()

        output('Waiting DAG copy')
        await waitCondition(async () => {
          return !((await this.docker.listContainers({ all: true })).find((c) => c.Names.find((n) => n.replace('/', '').startsWith(name)) !== undefined) !== undefined)
        })

        output('Creating container')
        const container = await this.docker.createContainer({
          Image: this.image,
          name: name,
          Cmd: [
            '--nocompaction',
            '--nousb',
            '--datadir',
            '/data',
            '--nodekeyhex',
            this.nodeKeys[i].pk,
            '--mine',
            '--miner.threads',
            '1',
            '--miner.etherbase',
            '0x646b186c9ccAD43a0b9c8E4efd1d9F4a2D20c358',
            '--ethash.dagdir',
            '/data/.ethash',
            '--http',
            '--http.addr',
            '0.0.0.0',
            '--http.port',
            '8545',
            '--http.corsdomain',
            '*',
            '--http.vhosts',
            '*',
            '--rpc',
            '--rpcport',
            '8545',
            '--rpcaddr',
            '0.0.0.0',
            '--http.api',
            'admin,personal,eth,net,web3',
            '--miner.extradata',
            name,
          ],
          HostConfig: {
            NetworkMode: `${this.networkName()}`,
            Binds: [
              `${volume}:/data`
            ]
          }
        })

        output('Starting node')
        await container.start()

        output('Waiting other nodes')
        await Promise.all(this.peerIds(i).map((i) => this.waitForContainer(i)))

        output('Connecting to internal network')
        await this.docker.getNetwork(this.internalNetworkName()).connect({ Container: container.id })

        output('Retrieving provider')
        const provider = await this.rpcProvider(i)

        output('Waiting for RPC')
        await waitCondition(async () => {
          try {
            const res = await provider.getBlock(0)
            return res !== null
          } catch {}
        })

        output('Registering other peers')
        await Promise.all(this.peerIds(i).map(async (pi) => {
          await provider.send('admin_addPeer', [await this.enodeOf(pi)])
        }))

        output('Waiting for block generation')
        await waitCondition(async () => {
          try {
            // Wait until we see a block generated by this child
            // we look for the block in a different node, so we validate that nodes are connected
            const lastBlock = await provider.getBlock("latest")
            return ethers.utils.toUtf8String(lastBlock.extraData) === name
          } catch {}
        })

        output('Throttling')
        await this.docker.getContainer(container.id).update({
          CpuPeriod: 100000,
          CpuQuota: [25000, 20000, 30000][i], // Use only 0.25 core per instance
        })

        output('Waiting for other nodes')
        const providerRight = await this.rpcProvider((i + 1) % 3)

        output('Waiting for block propagation')
        await waitCondition(async () => {
          try {
            // Wait until we see a block generated by this child
            // we look for the block in a different node, so we validate that nodes are connected
            const lastBlock = await providerRight.getBlock("latest")
            for (let i = lastBlock.number; i >= Math.max(0, lastBlock.number - 32); i--) {
              const block = await provider.getBlock(i)
              if (ethers.utils.toUtf8String(block.extraData) === name) {
                return true
              }
            }
          } catch  {}
        })

        title(`Started node ${name}`)  
      }
    })))

    // Clean unused volumes
    await Lestr({
      title: "Removing DAG volume",
      task: async ({ title }) => {
        await this.docker.getVolume(this.volumeDag()).remove()
        title('Removed DAG volume')
      }
    })
  }
}
