#!/usr/bin/env node

import yargs from 'yargs/yargs'
import { hideBin } from 'yargs/helpers'
import { Reorgme, ReorgmeDefaults } from './reorgme'

export const command = yargs(hideBin(process.argv))
  .options({
    id: { type: 'number', default: ReorgmeDefaults.id }
  })
  .command("start", "creates and starts a new testnet blockchain", () => {}, async (args) => {
    await new Reorgme({ id: args.id }).start()
  })
  .command("stop", "stops and removes a testnet blockchain", () => {}, async (args) => {
    await new Reorgme({ id: args.id }).stop()
  })
  .command("pause", "pauses a testnet blockchain", () => {}, async (args) => {
    await new Reorgme({ id: args.id }).pause()
  })
  .command("resume", "resumes a testnet blockchain", () => {}, async (args) => {
    await new Reorgme({ id: args.id }).resume()
  })
  .command("fork", "forks the node 0 of the chain", () => {}, async (args) => {
    await new Reorgme({ id: args.id }).fork()
  })
  .command("join", "joins the node 0 after forking it", () => {}, async (args) => {
    await new Reorgme({ id: args.id }).join()
  })
  .command("logs", "show logs for all the nodes", () => {}, async (args) => {
    await new Reorgme({ id: args.id }).logs()
  })
  .command("node", "node related commands", (yargs) => yargs
    .options({
      index: { type: 'number', require: true }
    })
    .command("ip", "retrieve the ip of a node", () => {}, async (args) => {
      console.log(await new Reorgme({ id: args.id }).ipOf(args.index))
    }))
  .parse()
