/* @flow */
import {
  type DescribeTable,
  type PluginManager,
  type Progress,
  type ResourceAdapterReady,
  compoundName,
} from '@neo-one/server-plugin';
import { Observable } from 'rxjs/Observable';

import { concat } from 'rxjs/observable/concat';
import { concatAll } from 'rxjs/operators';
import { constants as networkConstants } from '@neo-one/server-plugin-network';
import { defer } from 'rxjs/observable/defer';
import { of as _of } from 'rxjs/observable/of';

import type { WalletClient } from './types';
import type WalletResourceType, {
  Wallet,
  WalletResourceOptions,
} from './WalletResourceType';
import WalletResource from './WalletResource';

export type WalletResourceAdapterInitOptions = {|
  client: WalletClient,
  pluginManager: PluginManager,
  resourceType: WalletResourceType,
  name: string,
  dataPath: string,
|};

export type WalletResourceAdapterStaticOptions = {|
  ...WalletResourceAdapterInitOptions,
|};

export type WalletResourceAdapterOptions = {|
  resourceType: WalletResourceType,
  walletResource: WalletResource,
|};

export default class WalletResourceAdapter {
  _resourceType: WalletResourceType;
  walletResource: WalletResource;

  resource$: Observable<Wallet>;

  constructor({ resourceType, walletResource }: WalletResourceAdapterOptions) {
    this._resourceType = resourceType;
    this.walletResource = walletResource;

    this.resource$ = walletResource.resource$;
  }

  static async init({
    client,
    pluginManager,
    resourceType,
    name,
    dataPath,
  }: WalletResourceAdapterInitOptions): Promise<WalletResourceAdapter> {
    const walletResource = await WalletResource.createExisting({
      client,
      pluginManager,
      resourceType,
      name,
      dataPath,
    });

    return new this({
      resourceType,
      walletResource,
    });
  }

  async destroy(): Promise<void> {
    // eslint-disable-next-line
  }

  static create$(
    {
      client,
      pluginManager,
      resourceType,
      name,
      dataPath,
    }: WalletResourceAdapterInitOptions,
    { privateKey, password }: WalletResourceOptions,
  ): Observable<
    Progress | ResourceAdapterReady<Wallet, WalletResourceOptions>,
  > {
    return concat(
      _of({
        type: 'progress',
        message: 'Creating wallet resource',
      }),
      defer(async () => {
        const walletResource = await WalletResource.createNew({
          client,
          pluginManager,
          resourceType,
          name,
          privateKey,
          password,
          dataPath,
        });
        const { names: [networkName] } = compoundName.extract(name);
        return concat(
          _of({
            type: 'progress',
            persist: true,
            message: 'Created wallet resource',
          }),
          _of({
            type: 'ready',
            resourceAdapter: new this({
              resourceType,
              walletResource,
            }),
            dependencies: [
              {
                plugin: networkConstants.PLUGIN,
                resourceType: networkConstants.NETWORK_RESOURCE_TYPE,
                name: networkName,
              },
            ],
          }),
        );
      }).pipe(concatAll()),
    );
  }

  // eslint-disable-next-line
  delete$(options: WalletResourceOptions): Observable<Progress> {
    return concat(
      _of({
        type: 'progress',
        message: 'Cleaning up local files',
      }),
      defer(async () => {
        try {
          await this.walletResource.delete();
          return {
            type: 'progress',
            persist: true,
            message: 'Cleaned up local files',
          };
        } catch (error) {
          this._resourceType.plugin.log({
            event: 'WALLET_RESOURCE_ADAPTER_DELETE_ERROR',
            error,
          });
          throw error;
        }
      }),
    );
  }

  start$({ password }: WalletResourceOptions): Observable<Progress> {
    if (this.walletResource.unlocked) {
      return _of({
        type: 'progress',
        persist: true,
        message: 'Wallet unlocked',
      });
    }

    return concat(
      _of({
        type: 'progress',
        message: 'Unlocking wallet',
      }),
      defer(async () => {
        if (password == null) {
          throw new Error('Password is required to unlock a wallet.');
        }
        try {
          await this.walletResource.unlock({ password });
        } catch (error) {
          this._resourceType.plugin.log({
            event: 'WALLET_RESOURCE_ADAPTER_START_ERROR',
            error,
          });
          throw error;
        }
        return {
          type: 'progress',
          persist: true,
          message: 'Wallet unlocked',
        };
      }),
    );
  }

  // eslint-disable-next-line
  stop$(options: WalletResourceOptions): Observable<Progress> {
    this.walletResource.lock();
    return _of({
      type: 'progress',
      persist: true,
      message: 'Wallet locked',
    });
  }

  getDebug(): DescribeTable {
    return this.walletResource.getDebug();
  }
}
