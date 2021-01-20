import {
  AccountContract,
  common,
  crypto,
  ECPoint,
  IOHelper,
  PrivateKey,
  ScriptBuilder,
  UInt256,
} from '@neo-one/client-common';
import {
  Blockchain,
  BlockchainStorage,
  ChangeViewConsensusMessage,
  CommitConsensusMessage,
  ConsensusContext,
  ContractParametersContext,
  getBlockScriptHashesForVerifying,
  getM,
  MerkleTree,
  Node,
  Transaction,
  TransactionVerificationContext,
  Witness,
} from '@neo-one/node-core';
import { utils } from '@neo-one/utils';
import { BN } from 'bn.js';
import _ from 'lodash';
import { Result } from '../types';
import { Transactions } from './types';

export const getExpectedBlockSizeWithoutTransactions = (context: ConsensusContext, expectedTransactions: number) => {
  const blockSizeInit =
    IOHelper.sizeOfUInt32LE +
    IOHelper.sizeOfUInt256 +
    IOHelper.sizeOfUInt256 +
    IOHelper.sizeOfUInt64LE +
    IOHelper.sizeOfUInt32LE +
    IOHelper.sizeOfUInt160 +
    IOHelper.sizeOfUInt8 +
    context.witnessSize;

  return (
    blockSizeInit + context.blockBuilder.getConsensusData().size + IOHelper.sizeOfVarUIntLE(expectedTransactions + 1)
  );
};

export const getExpectedBlockSize = (context: ConsensusContext) => {
  const transactionValues = Object.values(context.transactions);

  return (
    getExpectedBlockSizeWithoutTransactions(context, transactionValues.length) +
    transactionValues.reduce((acc, tx) => acc + (tx?.size ?? 0), 0)
  );
};

export const getExpectedBlockSystemFee = (context: ConsensusContext) =>
  Object.values(context.transactions).reduce((acc, tx) => acc.add(tx?.systemFee ?? new BN(0)), new BN(0));

const getPrimaryIndex = ({
  context,
  viewNumber,
}: {
  readonly context: ConsensusContext;
  readonly viewNumber: number;
}): number => {
  let primaryIndex = (utils.nullthrows(context.blockBuilder.index) - viewNumber) % context.validators.length;
  if (primaryIndex < 0) {
    primaryIndex += context.validators.length;
  }

  return primaryIndex;
};

export const createBlock = async (contextIn: ConsensusContext, storage: BlockchainStorage) => {
  let { context } = ensureHeader(contextIn);
  const contract = AccountContract.createMultiSigContract(context.M, context.validators);
  const scriptHashOptions = {
    previousHash: utils.nullthrows(context.blockBuilder.previousHash),
    witness: context.blockBuilder.witness,
  };
  const scriptHashes = await getBlockScriptHashesForVerifying(scriptHashOptions, storage);
  if (scriptHashes === [undefined]) {
    // getBlockScriptHashesForVerifying can only return this when prevHash = UINT256_ZERO, so on genesis block
    // when a witness SHOULD already be defined on the block.
    throw new Error();
  }
  const sc = new ContractParametersContext(scriptHashes.filter(utils.notNull));
  // tslint:disable-next-line: no-loop-statement
  for (let i = 0, j = 0; i < context.validators.length && j < context.M; i += 1) {
    const commitPayload = context.commitPayloads[i];
    if (commitPayload === undefined) {
      continue;
    }

    if (commitPayload.consensusMessage.viewNumber !== context.viewNumber) {
      continue;
    }

    const validator = context.validators[i];
    const signature = commitPayload.getDeserializedMessage<CommitConsensusMessage>().signature;
    sc.addSignature(contract, validator, signature);
    j += 1;
  }

  const witness = sc.getWitnesses()[0];
  const transactions = context.transactionHashes
    ?.map((p) => context.transactions[common.uInt256ToHex(p)])
    .filter(utils.notNull);
  if (transactions === undefined) {
    throw new Error('this should have already been defined');
  }
  context = context.clone({ blockOptions: { witness, transactions } });

  return { context, block: context.blockBuilder.getBlock() };
};

export const ensureHeader = (contextIn: ConsensusContext) => {
  let context = contextIn;
  if (context.transactionHashes === undefined) {
    return { context, block: undefined };
  }

  if (context.blockBuilder.merkleRoot === undefined) {
    const consensusData = context.blockBuilder.getConsensusData();
    const merkleRoot = MerkleTree.computeRoot([consensusData.hash].concat(context.transactionHashes));
    context = context.clone({ blockOptions: { merkleRoot } });
  }

  return { context, block: context.blockBuilder };
};

export const ensureMaxBlockLimitation = async (
  node: Node,
  context: ConsensusContext,
  transactionsIn: readonly Transaction[],
) => {
  const [maxBlockSize, maxBlockSystemFee, maxTransactionsPerBlock] = await Promise.all([
    node.blockchain.getMaxBlockSize(),
    node.blockchain.getMaxBlockSystemFee(),
    node.blockchain.getMaxTransactionsPerBlock(),
  ]);

  const txs = transactionsIn.slice(0, maxTransactionsPerBlock);
  const newVerificationContext = node.getNewVerificationContext();

  const { hashes, transactions } = txs.reduce<{
    readonly hashes: readonly UInt256[];
    readonly transactions: Transactions;
    readonly blockSize: number;
    readonly blockSystemFee: BN;
  }>(
    (acc, transaction) => {
      const newBlockSize = acc.blockSize + transaction.size;
      if (newBlockSize > maxBlockSize) {
        return {
          ...acc,
          blockSize: newBlockSize,
        };
      }

      const newBlockSystemFee = acc.blockSystemFee.add(transaction.systemFee);
      if (newBlockSystemFee.gt(maxBlockSystemFee)) {
        return {
          ...acc,
          blockSize: newBlockSize,
          blockSystemFee: newBlockSystemFee,
        };
      }

      newVerificationContext.addTransaction(transaction);

      return {
        hashes: acc.hashes.concat([transaction.hash]),
        transactions: {
          ...acc.transactions,
          [transaction.hashHex]: transaction,
        },
        blockSize: newBlockSize,
        blockSystemFee: newBlockSystemFee,
      };
    },
    {
      hashes: [],
      transactions: {},
      blockSize: getExpectedBlockSizeWithoutTransactions(context, txs.length),
      blockSystemFee: new BN(0),
    },
  );

  return {
    context: context.clone({
      transactionHashes: hashes,
      transactions,
      verificationContext: newVerificationContext,
    }),
  };
};

const validatorsChanged = (blockchain: Blockchain) => {
  if (blockchain.currentBlockIndex === 0) {
    return false;
  }

  const currentBlock = blockchain.currentBlock;
  const prevBlock = blockchain.previousBlock;

  if (prevBlock === undefined) {
    throw new Error('expected previous block');
  }

  return !currentBlock.nextConsensus.equals(prevBlock.nextConsensus);
};

export const reset = async ({
  blockchain,
  privateKey,
  context,
  viewNumber,
}: {
  readonly blockchain: Blockchain;
  readonly privateKey: PrivateKey;
  readonly context: ConsensusContext;
  readonly viewNumber: number;
}): Promise<Result> => {
  if (viewNumber === 0) {
    const [validators, nextValidators] = await Promise.all([
      blockchain.getValidators(),
      blockchain.getNextBlockValidators(),
    ]);

    const initialBlockOptions = {
      previousHash: blockchain.currentBlock.hash,
      index: blockchain.currentBlockIndex + 1,
      nextConsensus: crypto.getConsensusAddress(blockchain.shouldRefreshCommittee(1) ? validators : nextValidators),
      merkleRoot: undefined,
      messageMagic: blockchain.settings.messageMagic,
    };

    const previousValidators = context.validators;
    let witnessSize = context.witnessSize;
    if (witnessSize === 0 || previousValidators.length !== nextValidators.length) {
      const builder = new ScriptBuilder();
      _.range(getM(nextValidators.length)).forEach(() => {
        builder.emitPush(Buffer.alloc(64));
      });

      witnessSize = new Witness({
        invocation: builder.build(),
        verification: crypto.createMultiSignatureRedeemScript(getM(nextValidators.length), nextValidators),
      }).size;
    }

    const changeViewPayloads = _.range(nextValidators.length).map(() => undefined);
    const lastChangeViewPayloads = _.range(nextValidators.length).map(() => undefined);
    const commitPayloads = _.range(nextValidators.length).map(() => undefined);
    const prevLastSeenMessage = context.lastSeenMessage;
    let lastSeenMessage = prevLastSeenMessage;
    if (validatorsChanged(blockchain) || Object.values(context.lastSeenMessage).length === 0) {
      lastSeenMessage = nextValidators.reduce<{ readonly [k: string]: number | undefined }>((acc, validator) => {
        const validatorHex = common.ecPointToHex(validator);
        const prevIndex = prevLastSeenMessage[validatorHex];
        if (prevIndex !== undefined) {
          return {
            ...acc,
            validatorHex: prevIndex,
          };
        }

        return {
          ...acc,
          validatorHex: blockchain.currentBlockIndex,
        };
      }, {});
    }

    const publicKey = crypto.privateKeyToPublicKey(privateKey);
    const myIndex = nextValidators.findIndex((validator) => validator.equals(publicKey));

    return {
      context: context.clone({
        blockOptions: initialBlockOptions,
        validators: nextValidators,
        witnessSize,
        myIndex,
        changeViewPayloads,
        lastChangeViewPayloads,
        commitPayloads,
        lastSeenMessage,
      }),
    };
  }
  const mutableLastChangeViewPayloads = [...context.lastChangeViewPayloads];
  _.range(mutableLastChangeViewPayloads.length).forEach((i) => {
    // tslint:disable-next-line: prefer-conditional-expression
    if (
      (context.changeViewPayloads[i]?.getDeserializedMessage<ChangeViewConsensusMessage>().newViewNumber ?? -1) >=
      viewNumber
    ) {
      mutableLastChangeViewPayloads[i] = context.changeViewPayloads[i];
    } else {
      mutableLastChangeViewPayloads[i] = undefined;
    }
  });

  const primaryIndex = getPrimaryIndex({ context, viewNumber });
  const newBlockOptions = {
    consensusData: {
      primaryIndex,
    },
    merkleRoot: undefined,
    timestamp: new BN(0),
    transactions: undefined,
  };

  const preparationPayloads = _.range(context.validators.length).map(() => undefined);

  const mutableLastSeenMessage = { ...context.lastSeenMessage };
  if (context.myIndex >= 0) {
    mutableLastSeenMessage[context.myIndex] = utils.nullthrows(context.blockBuilder?.index);
  }

  return {
    context: context.clone({
      viewNumber,
      lastChangeViewPayloads: mutableLastChangeViewPayloads,
      blockOptions: newBlockOptions,
      transactionHashes: undefined,
      preparationPayloads,
      lastSeenMessage: mutableLastSeenMessage,
    }),
  };
};

export const saveContext = async (_context: ConsensusContext) => {
  throw new Error('not implemented');
};

export const getInitialContext = ({
  blockchain,
  publicKey,
  validators,
  verificationContext,
}: {
  readonly blockchain: Blockchain;
  readonly publicKey: ECPoint;
  readonly validators: readonly ECPoint[];
  readonly verificationContext: TransactionVerificationContext;
}): ConsensusContext => {
  const blockIndex = blockchain.currentBlock.index + 1;
  const primaryIndex = blockIndex % validators.length;
  const myIndex = _.findIndex(validators, (validator) => common.ecPointEqual(validator, publicKey));

  const blockOptions = {
    version: 0,
    index: blockIndex,
    consensusData: { primaryIndex },
  };

  return new ConsensusContext({
    myIndex,
    verificationContext,
    viewNumber: 0,
    blockOptions,
    validators,
    witnessSize: 0,
    blockReceivedTimeMS: Date.now(),
  });
};
