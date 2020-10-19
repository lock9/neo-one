import { common, OpCode, SysCallName, UInt160, VMState } from '@neo-one/client-common';
import { Block, ExecutionAction, ScriptContainer, TriggerType, VMListeners, WriteBlockchain } from '@neo-one/node-core';
import { BN } from 'bn.js';
import { StackItem } from './stackItem';

export const MAX_SHL_SHR = 65535;
export const MIN_SHL_SHR = -MAX_SHL_SHR;
export const MAX_SIZE_BIG_INTEGER = 32;
export const MAX_STACK_SIZE = 2 * 1024;
export const MAX_ITEM_SIZE = 1024 * 1024;
export const MAX_INVOCATION_STACK_SIZE = 1024;
export const MAX_ARRAY_SIZE = 1024;
export const MAX_ARRAY_SIZE_BN = new BN(1024);
export const BLOCK_HEIGHT_YEAR = 2000000;
export const BLOCK_HEIGHT_MAX_SIZE_CHECKS = Number.MAX_SAFE_INTEGER;
const ratio = 100000;
export const FEES = {
  ONE: new BN(ratio * 1),
  TEN: new BN(ratio * 10),
  TWENTY: new BN(ratio * 20),
  ONE_HUNDRED: new BN(ratio * 100),
  TWO_HUNDRED: new BN(ratio * 200),
  FOUR_HUNDRED: new BN(ratio * 400),
  FIVE_HUNDRED: new BN(ratio * 500),
  ONE_THOUSAND: new BN(ratio * 1000),
};

export type ExecutionStack = readonly StackItem[];
export interface ExecutionInit {
  readonly scriptContainer: ScriptContainer;
  readonly triggerType: TriggerType;
  readonly action: ExecutionAction;
  readonly listeners: VMListeners;
  readonly skipWitnessVerify: boolean;
  readonly persistingBlock?: Block;
}

export interface CreatedContracts {
  readonly [hash: string]: UInt160;
}
export interface Options {
  readonly depth: number;
  readonly stack: ExecutionStack;
  readonly stackAlt: ExecutionStack;
  readonly createdContracts: CreatedContracts;
  readonly scriptHashStack: readonly UInt160[];
  readonly scriptHash: UInt160 | undefined;
  readonly entryScriptHash: UInt160;
  readonly returnValueCount: number;
  readonly stackCount: number;
  readonly pc?: number;
}
export interface ExecutionContext {
  readonly state: VMState;
  readonly errorMessage?: string;
  readonly blockchain: WriteBlockchain;
  readonly init: ExecutionInit;
  readonly engine: {
    readonly run: (input: { readonly context: ExecutionContext }) => Promise<ExecutionContext>;
    readonly executeScript: (input: {
      readonly code: Buffer;
      readonly blockchain: WriteBlockchain;
      readonly init: ExecutionInit;
      readonly gasLeft: BN;
      readonly options?: Options;
    }) => Promise<ExecutionContext>;
  };
  readonly code: Buffer;
  readonly scriptHashStack: readonly UInt160[];
  readonly scriptHash: UInt160;
  readonly callingScriptHash: UInt160 | undefined;
  readonly entryScriptHash: UInt160;
  readonly pc: number;
  readonly depth: number;
  readonly stack: ExecutionStack;
  readonly stackAlt: ExecutionStack;
  readonly gasLeft: BN;
  readonly createdContracts: CreatedContracts;
  readonly returnValueCount: number;
  readonly stackCount: number;
}

export interface OpResult {
  readonly context: ExecutionContext;
  readonly results?: readonly StackItem[];
  readonly resultsAlt?: readonly StackItem[];
}
export interface OpInvokeArgs {
  readonly context: ExecutionContext;
  readonly args: readonly StackItem[];
  readonly argsAlt: readonly StackItem[];
}
export type OpInvoke = (input: OpInvokeArgs) => Promise<OpResult> | OpResult;
export interface Op {
  readonly name: OpCode;
  readonly in: number;
  readonly inAlt: number;
  readonly out: number;
  readonly outAlt: number;
  readonly invocation: number;
  readonly fee: BN;
  readonly invoke: OpInvoke;
}
export interface SysCall {
  readonly name: SysCallName;
  readonly in: number;
  readonly inAlt: number;
  readonly out: number;
  readonly outAlt: number;
  readonly invocation: number;
  readonly fee: BN;
  readonly invoke: OpInvoke;
  readonly context: ExecutionContext;
}
