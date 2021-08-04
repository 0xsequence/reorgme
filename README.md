# Reorgme 

Reorgme is a simple tool for creating private geth networks for reorg testing purposes, it uses Docker to generate a private network composed by 3 mining nodes using PoW. The tool allows for easily disconnecting a node from the other two, making it fork away from the chain, the node can be later reconnected to the other two nodes, this causes the node to experience a reorg.

## Start a chain

This command downloads the docker images for alpine and geth, then it proceeds to create 3 docker containers for the 3 nodes.

```
$ reorgme start
```

### Start multiple chains at the same time

The `--id` flag can be use to interact with any of the blockchain instances.

```
$ reorgme start --id 0
$ reorgme start --id 1
```

## Fork the chain

This is the first step for triggering a reorg.

```
$ reorgme fork
```

After the execution of this command the node `0` will be disconnected but it will keep minning on its own copy of the blockchain, you can proceed to send transactions to the node `0` if you want to test a reorg that doesn't include your transaction, or you can send transaction to both `0` and `1-2` if you intent to test more complex reorg scenarios.

## Join the chain

This triggers the reorg.

```
$ reorgme join
```

> There is no way to ensure the reorg will happen in a determined amount of time when executing the command, this software uses real PoW and real "nodes" for testing, those elements come with a certain level of uncertainty.

## Stop the chain

This commands stops the chain and deletes the container and volumes of the nodes, docker images are not removed.

```
$ reorgme stop
```

> This command can't be reverted


# LICENSE

Apache-2.0

Copyright (c) 2017-present Horizon Blockchain Games Inc. / https://horizon.io