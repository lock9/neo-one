import { utils } from '@neo-one/utils';
import ts from 'typescript';
import { Context } from '../../Context';
import { BuiltIns, BuiltInSymbols } from '../builtins';
import { Helper, Helpers } from '../helper';
import { ResolvedScope } from '../scope';
import { BaseScriptBuilder } from './BaseScriptBuilder';
import { ScriptBuilder } from './ScriptBuilder';

export interface EmittingScriptBuilderOptions {
  readonly context: Context;
  readonly sourceFile: ts.SourceFile;
  readonly scopes: Map<ts.Node, Map<number, ResolvedScope>>;
  readonly helpers: Helpers;
  readonly builtIns: BuiltIns;
  readonly builtInSymbols: BuiltInSymbols;
  readonly allHelpers: ReadonlyArray<Helper>;
}

export class EmittingScriptBuilder extends BaseScriptBuilder<ResolvedScope> implements ScriptBuilder {
  private readonly scopes: Map<ts.Node, Map<number, ResolvedScope>>;

  public constructor({
    context,
    scopes,
    helpers,
    builtIns,
    builtInSymbols,
    sourceFile,
    allHelpers,
  }: EmittingScriptBuilderOptions) {
    super(context, helpers, builtIns, builtInSymbols, sourceFile, allHelpers);
    this.scopes = scopes;
  }

  protected createScope(node: ts.Node, index: number): ResolvedScope {
    return utils.nullthrows(utils.nullthrows(this.scopes.get(node)).get(index));
  }
}
