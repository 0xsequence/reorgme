import yargs from 'yargs/yargs'
import { hideBin } from 'yargs/helpers'
import { Reorgme } from './index'

yargs(hideBin(process.argv))
  .options({
    id: { type: 'number', default: 0 }
  })
  .command("create", "creates a new testnet blockchain", () => {}, async (args) => {
    await new Reorgme({ id: args.id }).bootstrap()
  })
  .parse()
