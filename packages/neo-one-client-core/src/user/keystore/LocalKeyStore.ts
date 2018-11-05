import {
  BufferString,
  common,
  crypto,
  decryptNEP2,
  encryptNEP2,
  NetworkType,
  privateKeyToPublicKey,
  publicKeyToAddress,
  UpdateAccountNameOptions,
  UserAccount,
  UserAccountID,
} from '@neo-one/client-common';
import { Monitor } from '@neo-one/monitor';
import { utils } from '@neo-one/utils';
import _ from 'lodash';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import * as args from '../../args';
import { LockedAccountError, UnknownAccountError } from '../../errors';

export interface LockedWallet {
  readonly type: 'locked';
  readonly account: UserAccount;
  readonly nep2: string;
}

export interface UnlockedWallet {
  readonly type: 'unlocked';
  readonly account: UserAccount;
  readonly privateKey: BufferString;
  readonly nep2?: string | undefined;
}

export type Wallet = LockedWallet | UnlockedWallet;
export type Wallets = { readonly [Network in string]?: { readonly [Address in string]?: Wallet } };

export interface Store {
  readonly getWallets: () => Promise<ReadonlyArray<Wallet>>;
  readonly getWalletsSync?: () => ReadonlyArray<Wallet>;
  readonly saveWallet: (wallet: Wallet, monitor?: Monitor) => Promise<void>;
  readonly deleteWallet: (account: Wallet, monitor?: Monitor) => Promise<void>;
}

const flattenWallets = (wallets: Wallets) =>
  _.flatten(
    Object.values(wallets)
      .filter(utils.notNull)
      .map((networkWallets) => Object.values(networkWallets)),
  ).filter(utils.notNull);

export class LocalKeyStore {
  public readonly currentUserAccount$: Observable<UserAccount | undefined>;
  public readonly userAccounts$: Observable<ReadonlyArray<UserAccount>>;
  public readonly wallets$: Observable<ReadonlyArray<Wallet>>;
  private readonly currentAccountInternal$: BehaviorSubject<UserAccount | undefined>;
  private readonly accountsInternal$: BehaviorSubject<ReadonlyArray<UserAccount>>;
  private readonly walletsInternal$: BehaviorSubject<Wallets>;
  private readonly store: Store;
  private readonly initPromise: Promise<void>;

  public constructor({ store }: { readonly store: Store }) {
    this.walletsInternal$ = new BehaviorSubject<Wallets>({});
    this.wallets$ = this.walletsInternal$.pipe(
      distinctUntilChanged((a, b) => _.isEqual(a, b)),
      map(flattenWallets),
    );

    this.accountsInternal$ = new BehaviorSubject([] as ReadonlyArray<UserAccount>);
    this.wallets$.pipe(map((wallets) => wallets.map(({ account }) => account))).subscribe(this.accountsInternal$);
    this.userAccounts$ = this.accountsInternal$;

    this.currentAccountInternal$ = new BehaviorSubject(undefined as UserAccount | undefined);
    this.currentUserAccount$ = this.currentAccountInternal$.pipe(distinctUntilChanged());

    this.store = store;

    if (store.getWalletsSync !== undefined) {
      this.initWithWallets(store.getWalletsSync());
    }
    this.initPromise = this.init();
  }

  public getCurrentUserAccount(): UserAccount | undefined {
    return this.currentAccountInternal$.getValue();
  }

  public getUserAccounts(): ReadonlyArray<UserAccount> {
    return this.accountsInternal$.getValue();
  }

  public get wallets(): ReadonlyArray<Wallet> {
    return flattenWallets(this.walletsObj);
  }

  public async sign({
    account,
    message,
    monitor,
  }: {
    readonly account: UserAccountID;
    readonly message: string;
    readonly monitor?: Monitor;
  }): Promise<string> {
    await this.initPromise;

    return this.capture(
      async () => {
        const privateKey = this.getPrivateKey(account);

        return crypto
          .sign({ message: Buffer.from(message, 'hex'), privateKey: common.stringToPrivateKey(privateKey) })
          .toString('hex');
      },
      'neo_sign',
      monitor,
    );
  }

  public async selectUserAccount(id?: UserAccountID, _monitor?: Monitor): Promise<void> {
    if (id === undefined) {
      this.currentAccountInternal$.next(undefined);
      this.newCurrentAccount();
    } else {
      const { account } = this.getWallet(id);
      this.currentAccountInternal$.next(account);
    }
  }

  public async updateUserAccountName({ id, name, monitor }: UpdateAccountNameOptions): Promise<void> {
    return this.capture(
      async (span) => {
        await this.initPromise;

        const wallet = this.getWallet(id);
        let newWallet: Wallet;
        const account = {
          id: wallet.account.id,
          name,
          publicKey: wallet.account.publicKey,
        };

        if (wallet.type === 'locked') {
          newWallet = {
            type: 'locked',
            account,
            nep2: wallet.nep2,
          };
        } else {
          newWallet = {
            type: 'unlocked',
            account,
            privateKey: wallet.privateKey,
            nep2: wallet.nep2,
          };
        }
        await this.capture(async (innerSpan) => this.store.saveWallet(newWallet, innerSpan), 'neo_save_wallet', span);

        this.updateWallet(newWallet);
      },
      'neo_update_account_name',
      monitor,
    );
  }

  public getWallet({ address, network }: UserAccountID): Wallet {
    const wallets = this.walletsObj[network];
    if (wallets === undefined) {
      throw new UnknownAccountError(address);
    }

    const wallet = wallets[address];
    if (wallet === undefined) {
      throw new UnknownAccountError(address);
    }

    return wallet;
  }

  public getWallet$({ address, network }: UserAccountID): Observable<Wallet | undefined> {
    return this.walletsInternal$.pipe(
      map((wallets) => {
        const networkWallets = wallets[network];
        if (networkWallets === undefined) {
          return undefined;
        }

        return networkWallets[address];
      }),
    );
  }

  public async addAccount({
    network,
    privateKey: privateKeyIn,
    name,
    password,
    nep2: nep2In,
    monitor,
  }: {
    readonly network: NetworkType;
    readonly privateKey?: BufferString;
    readonly name?: string;
    readonly password?: string;
    readonly nep2?: string;
    readonly monitor?: Monitor;
  }): Promise<Wallet> {
    await this.initPromise;

    return this.capture(
      async (span) => {
        let pk = privateKeyIn;
        let nep2 = nep2In;
        if (pk === undefined) {
          if (nep2 === undefined || password === undefined) {
            throw new Error('Expected private key or password and NEP-2 key');
          }
          pk = await decryptNEP2({ encryptedKey: nep2, password });
        }

        const privateKey = args.assertPrivateKey('privateKey', pk);
        const publicKey = privateKeyToPublicKey(privateKey);
        const address = publicKeyToAddress(publicKey);

        if (nep2 === undefined && password !== undefined) {
          nep2 = await encryptNEP2({ privateKey, password });
        }

        const account = {
          id: {
            network,
            address,
          },
          name: name === undefined ? address : name,
          publicKey,
        };

        const unlockedWallet: UnlockedWallet = {
          type: 'unlocked',
          account,
          nep2,
          privateKey,
        };

        let wallet: Wallet = unlockedWallet;
        if (nep2 !== undefined) {
          wallet = { type: 'locked', account, nep2 };
        }

        await this.capture(async (innerSpan) => this.store.saveWallet(wallet, innerSpan), 'neo_save_wallet', span);

        this.updateWallet(unlockedWallet);

        if (this.currentAccount === undefined) {
          this.currentAccountInternal$.next(wallet.account);
        }

        return unlockedWallet;
      },
      'neo_add_account',
      monitor,
    );
  }

  public async deleteUserAccount(id: UserAccountID, monitor?: Monitor): Promise<void> {
    await this.initPromise;

    return this.capture(
      async (span) => {
        const { walletsObj: wallets } = this;
        const networkWalletsIn = wallets[id.network];
        if (networkWalletsIn === undefined) {
          return;
        }

        const { [id.address]: wallet, ...networkWallets } = networkWalletsIn;
        if (wallet === undefined) {
          return;
        }

        await this.capture(async (innerSpan) => this.store.deleteWallet(wallet, innerSpan), 'neo_delete_wallet', span);

        this.walletsInternal$.next({
          ...wallets,
          [id.network]: networkWallets,
        });

        if (
          this.currentAccount !== undefined &&
          this.currentAccount.id.network === id.network &&
          this.currentAccount.id.address === id.address
        ) {
          this.newCurrentAccount();
        }
      },
      'neo_delete_account',
      monitor,
    );
  }

  public async unlockWallet({
    id,
    password,
    monitor,
  }: {
    readonly id: UserAccountID;
    readonly password: string;
    readonly monitor?: Monitor;
  }): Promise<void> {
    await this.initPromise;

    return this.capture(
      async () => {
        const wallet = this.getWallet(id);
        if (wallet.type === 'unlocked') {
          return;
        }

        const privateKey = await decryptNEP2({
          encryptedKey: wallet.nep2,
          password,
        });

        this.updateWallet({
          type: 'unlocked',
          account: wallet.account,
          privateKey,
          nep2: wallet.nep2,
        });
      },
      'neo_unlock_wallet',
      monitor,
    );
  }

  public async lockWallet(id: UserAccountID): Promise<void> {
    await this.initPromise;

    const wallet = this.getWallet(id);
    if (wallet.type === 'locked' || wallet.nep2 === undefined) {
      return;
    }

    this.updateWallet({
      type: 'locked',
      account: wallet.account,
      nep2: wallet.nep2,
    });
  }

  private async init(): Promise<void> {
    const walletsList = await this.store.getWallets();
    this.initWithWallets(walletsList);
  }

  private initWithWallets(walletsList: ReadonlyArray<Wallet>): void {
    const wallets = walletsList.reduce<Wallets>(
      (acc, wallet) => ({
        ...acc,
        [wallet.account.id.network]: {
          ...(acc[wallet.account.id.network] === undefined ? {} : acc[wallet.account.id.network]),
          [wallet.account.id.address]: wallet,
        },
      }),
      {},
    );
    this.walletsInternal$.next(wallets);
    this.newCurrentAccount();
  }

  private getPrivateKey(id: UserAccountID): BufferString {
    const wallet = this.getWallet({
      network: id.network,
      address: id.address,
    });

    if (wallet.type === 'locked') {
      throw new LockedAccountError(id.address);
    }

    return wallet.privateKey;
  }

  private updateWallet(wallet: Wallet): void {
    const { walletsObj: wallets } = this;
    this.walletsInternal$.next({
      ...wallets,
      [wallet.account.id.network]: {
        ...(wallets[wallet.account.id.network] === undefined ? {} : wallets[wallet.account.id.network]),
        [wallet.account.id.address]: wallet,
      },
    });
  }

  private newCurrentAccount(): void {
    const allAccounts = this.wallets.map(({ account: value }) => value);

    const account = allAccounts[0];
    this.currentAccountInternal$.next(account);
  }

  private async capture<T>(func: (monitor?: Monitor) => Promise<T>, name: string, monitor?: Monitor): Promise<T> {
    if (monitor === undefined) {
      return func();
    }

    return monitor.at('local_key_store').captureSpanLog(func, {
      name,
      level: { log: 'verbose', span: 'info' },
      trace: true,
    });
  }

  private get walletsObj(): Wallets {
    return this.walletsInternal$.getValue();
  }

  private get currentAccount(): UserAccount | undefined {
    return this.currentAccountInternal$.getValue();
  }
}
