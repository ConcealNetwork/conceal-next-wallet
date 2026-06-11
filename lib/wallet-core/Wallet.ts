// @ts-nocheck
/*
 * Copyright (c) 2018 Gnock
 * Copyright (c) 2018-2019 The Masari Project
 * Copyright (c) 2018-2020 The Karbo developers
 * Copyright (c) 2018-2025 Conceal Community, Conceal.Network & Conceal Devs
 *
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import { prepareWalletConversationData } from "./wallet-conversation-persistence";
import {
  indexSentMessageRecords,
  normalizeSentMessagesFromRaw,
  type RawSentMessageRecord,
} from "./sent-messages";
import {
  Transaction,
  TransactionIn,
  type TransactionOut,
  Deposit,
  Withdrawal,
} from "./Transaction";
import { DependencyInjectorInstance } from "./numbersLab/DependencyInjector";
import type { BlockchainExplorer, RawDaemon_Out } from "./blockchain/BlockchainExplorer";
import { TransactionsExplorer } from "./TransactionsExplorer";
import { KeysRepository, type UserKeys } from "./KeysRepository";
import { Observable } from "./numbersLab/Observable";
import { Cn, CnNativeBride, CnTransactions } from "./Cn";
import { Constants } from "./Constants";
import { MathUtil } from "./MathUtil";
import { Currency } from "./Currency";

type RawOutForTx = {
  keyImage: string;
  amount: number;
  public_key: string;
  index: number;
  global_index: number;
  tx_pub_key: string;
  keys: string[];
};

interface IOptimizeInfo {
  numOutputs: number;
  isNeeded: boolean;
}

export type RawWalletOptions = {
  checkMinerTx?: boolean;
  readSpeed: number;
  customNode?: boolean;
  nodeUrl: string;
};

export class WalletOptions {
  checkMinerTx: boolean = false;
  readSpeed: number = 50;
  customNode: boolean = false;
  nodeUrl: string = "https://explorer.conceal.network/daemon/";

  static fromRaw(raw: RawWalletOptions) {
    const options = new WalletOptions();

    if (typeof raw.checkMinerTx !== "undefined") options.checkMinerTx = raw.checkMinerTx;
    if (typeof raw.readSpeed !== "undefined") options.readSpeed = raw.readSpeed;
    if (typeof raw.customNode !== "undefined") options.customNode = raw.customNode;
    if (typeof raw.nodeUrl !== "undefined") options.nodeUrl = raw.nodeUrl;

    return options;
  }

  exportToJson(): RawWalletOptions {
    const data: RawWalletOptions = {
      readSpeed: this.readSpeed,
      checkMinerTx: this.checkMinerTx,
      customNode: this.customNode,
      nodeUrl: this.nodeUrl,
    };
    return data;
  }
}

export type RawAddressEntry = {
  id: string;
  label: string;
  address: string;
  paymentId?: string;
  avatar?: string;
};

export type RawWallet = {
  deposits: any[];
  withdrawals: any[];
  transactions: any[];
  txPrivateKeys?: any;
  lastHeight: number;
  encryptedKeys?: string | Array<number>;
  nonce: string;
  keys?: UserKeys;
  creationHeight?: number;
  options?: RawWalletOptions;
  coinAddressPrefix?: any;
  /**
   * v3 only — saved contacts for conversations (optional; omitted in v1 backups).
   * v1 `loadFromRaw` never reads this key, so v1 → v3 and v3 → v1 file import stay compatible.
   */
  addressBook?: RawAddressEntry[];
  /**
   * v3 only — sender copies of outgoing message bodies (optional; omitted in v1 backups).
   * On-chain payload is only decryptable by the receiver; the sender must keep local copies.
   */
  sentMessages?: RawSentMessageRecord[];
};
export type RawFullyEncryptedWallet = {
  data: number[];
  nonce: string;
};

export type { RawSentMessageRecord } from "./sent-messages";

export class Wallet extends Observable {
  private _lastHeight: number = 0;

  private transactions: Transaction[] = [];
  private withdrawals: Withdrawal[] = [];
  private deposits: Deposit[] = [];
  private keyLookupMap: Map<string, Transaction> = new Map<string, Transaction>();
  private txLookupMap: Map<string, Transaction> = new Map<string, Transaction>();
  txsMem: Transaction[] = [];
  private modified = true;
  private modifiedTS: Date = new Date();
  creationHeight: number = 0;
  txPrivateKeys: { [id: string]: string } = {};
  coinAddressPrefix: any = config.addressPrefix;

  keys!: UserKeys;

  private _options: WalletOptions = new WalletOptions();
  private addressBook: RawAddressEntry[] = [];
  /** Outgoing message records keyed by tx hash — persisted in wallet blob, not on chain. */
  private sentMessageRecords = new Map<string, RawSentMessageRecord>();
  private pendingMessageTargets = new Map<string, { remoteAddress: string; paymentId?: string }>();

  signalChanged = () => {
    this.modifiedTS = new Date();
    this.modified = true;
  };

  exportToRaw = (): RawWallet => {
    const deposits: any[] = [];
    const withdrawals: any[] = [];
    const transactions: any[] = [];

    for (const deposit of this.deposits) {
      deposits.push(deposit.export());
    }
    for (const withdrawal of this.withdrawals) {
      withdrawals.push(withdrawal.export());
    }
    const pushExportedTransaction = (transaction: Transaction) => {
      const exported = transaction.export();
      // Keep sender message bodies out of tx entries so wallet v1 is unaffected.
      if (transaction.hash && this.sentMessageRecords.has(transaction.hash) && exported.message) {
        delete exported.message;
      }
      transactions.push(exported);
    };

    const seenHashes = new Set<string>();
    const seenPubKeys = new Set<string>();

    for (const transaction of this.transactions) {
      if (transaction.hash) seenHashes.add(transaction.hash);
      if (transaction.txPubKey) seenPubKeys.add(transaction.txPubKey);
      pushExportedTransaction(transaction);
    }

    for (const transaction of this.txsMem) {
      if (transaction.hash && seenHashes.has(transaction.hash)) continue;
      if (transaction.txPubKey && seenPubKeys.has(transaction.txPubKey)) continue;
      pushExportedTransaction(transaction);
    }

    const data: RawWallet = {
      deposits: deposits,
      withdrawals: withdrawals,
      transactions: transactions,
      txPrivateKeys: this.txPrivateKeys,
      lastHeight: this._lastHeight,
      nonce: "",
      options: this._options,
      coinAddressPrefix: this.coinAddressPrefix,
    };

    data.keys = this.keys;

    if (this.creationHeight !== 0) {
      data.creationHeight = this.creationHeight;
    }

    if (this.addressBook.length > 0) {
      data.addressBook = this.addressBook.slice();
    }

    if (this.sentMessageRecords.size > 0) {
      const persistable = Array.from(this.sentMessageRecords.values()).filter((record) => {
        const tx = this.txsMem.find((t) => t.hash === record.txHash);
        return !tx || tx.ttl === 0 || tx.blockHeight !== 0;
      });
      if (persistable.length > 0) data.sentMessages = persistable;
    }

    return data;
  };

  static loadFromRaw(raw: RawWallet): Wallet {
    const wallet = new Wallet();
    wallet.transactions = [];
    wallet.withdrawals = [];
    wallet.deposits = [];
    wallet.keyLookupMap.clear();
    wallet.txLookupMap.clear();

    if (raw.deposits) {
      for (const rawDeposit of raw.deposits) {
        const deposit = Deposit.fromRaw(rawDeposit);
        wallet.deposits.push(deposit);
      }
    }

    if (raw.withdrawals) {
      for (const rawWithdrawal of raw.withdrawals) {
        const withdrawal = Withdrawal.fromRaw(rawWithdrawal);
        wallet.withdrawals.push(withdrawal);
      }
    }

    if (raw.transactions) {
      for (const rawTransac of raw.transactions) {
        const transaction = Transaction.fromRaw(rawTransac);
        wallet.transactions.push(transaction);
        wallet.txLookupMap.set(transaction.hash, transaction);
        wallet.keyLookupMap.set(transaction.txPubKey, transaction);
      }
    }

    wallet._lastHeight = raw.lastHeight;
    if (typeof raw.encryptedKeys === "string" && raw.encryptedKeys !== "") {
      if (raw.encryptedKeys.length === 128) {
        const privView = raw.encryptedKeys.substr(0, 64);
        const privSpend = raw.encryptedKeys.substr(64, 64);
        wallet.keys = KeysRepository.fromPriv(privSpend, privView);
      } else {
        const privView = raw.encryptedKeys.substr(0, 64);
        const pubViewKey = raw.encryptedKeys.substr(64, 64);
        const pubSpendKey = raw.encryptedKeys.substr(128, 64);

        wallet.keys = {
          pub: {
            view: pubViewKey,
            spend: pubSpendKey,
          },
          priv: {
            view: privView,
            spend: "",
          },
        };
      }
    } else if (typeof raw.keys !== "undefined") {
      wallet.keys = KeysRepository.normalizeKeys(raw.keys) ?? raw.keys;
    }
    if (typeof raw.creationHeight !== "undefined") wallet.creationHeight = raw.creationHeight;

    if (typeof raw.options !== "undefined") wallet._options = WalletOptions.fromRaw(raw.options);
    if (typeof raw.txPrivateKeys !== "undefined") wallet.txPrivateKeys = raw.txPrivateKeys;

    if (typeof raw.coinAddressPrefix !== "undefined")
      wallet.coinAddressPrefix = raw.coinAddressPrefix;
    else wallet.coinAddressPrefix = config.addressPrefix;

    if (typeof raw.addressBook !== "undefined") {
      wallet.addressBook = raw.addressBook.slice();
    }

    if (typeof raw.sentMessages !== "undefined") {
      wallet.sentMessageRecords = indexSentMessageRecords(
        normalizeSentMessagesFromRaw(raw.sentMessages),
      );
    }

    prepareWalletConversationData(wallet);

    wallet.recalculateKeyImages();
    return wallet;
  }

  isViewOnly = () => {
    return this.keys.priv.spend === "";
  };

  get lastHeight(): number {
    return this._lastHeight;
  }

  set lastHeight(value: number) {
    const modified = value !== this._lastHeight;
    this._lastHeight = value;
    if (modified) {
      this.notify();
    }
  }

  get options(): WalletOptions {
    return this._options;
  }

  set options(value: WalletOptions) {
    this._options = value;
    this.signalChanged();
  }

  listAddressBook = (): RawAddressEntry[] => {
    return this.addressBook.slice();
  };

  createAddressEntry = (entry: RawAddressEntry): RawAddressEntry => {
    this.addressBook.push(entry);
    this.signalChanged();
    this.notify();
    return entry;
  };

  updateAddressEntry = (id: string, input: Omit<RawAddressEntry, "id">): RawAddressEntry | null => {
    const index = this.addressBook.findIndex((entry) => entry.id === id);
    if (index === -1) return null;
    const updated: RawAddressEntry = { id, ...input };
    this.addressBook[index] = updated;
    this.signalChanged();
    this.notify();
    return updated;
  };

  deleteAddressEntry = (id: string): boolean => {
    const index = this.addressBook.findIndex((entry) => entry.id === id);
    if (index === -1) return false;
    this.addressBook.splice(index, 1);
    this.signalChanged();
    this.notify();
    return true;
  };

  setPendingMessageTarget = (
    hash: string,
    remoteAddress: string,
    paymentId?: string,
    body?: string,
  ): void => {
    this.pendingMessageTargets.set(hash, { remoteAddress, paymentId });
    if (body) {
      this.saveSentMessageRecord({
        txHash: hash,
        messageBody: body,
        receiver: remoteAddress,
        paymentIdTo: paymentId || undefined,
      });
    }
    for (const tx of this.txsMem.concat(this.transactions)) {
      if (tx.hash === hash) this.applyPendingMessageTarget(tx);
    }
    this.signalChanged();
    this.notify();
  };

  saveSentMessageRecord = (record: RawSentMessageRecord): void => {
    if (!record.txHash || !record.messageBody.trim()) return;
    this.sentMessageRecords.set(record.txHash, { ...record });
    for (const tx of this.txsMem.concat(this.transactions)) {
      if (tx.hash === record.txHash) this.hydrateSentMessageBody(tx);
    }
    this.signalChanged();
    this.notify();
  };

  getSentMessageRecord = (hash: string): RawSentMessageRecord | undefined => {
    return hash ? this.sentMessageRecords.get(hash) : undefined;
  };

  listSentMessageRecords = (): RawSentMessageRecord[] => {
    return Array.from(this.sentMessageRecords.values());
  };

  hydrateSentMessageBody = (transaction: Transaction): void => {
    if (!transaction.hash) return;
    const record = this.sentMessageRecords.get(transaction.hash);
    if (!record) return;
    if (!transaction.message) transaction.message = record.messageBody;
    if (!transaction.remoteAddress && record.receiver) {
      transaction.remoteAddress = record.receiver;
    }
  };

  private applyPendingMessageTarget = (transaction: Transaction): void => {
    if (!transaction.hash) return;
    const pending = this.pendingMessageTargets.get(transaction.hash);
    if (pending) {
      if (!transaction.remoteAddress) transaction.remoteAddress = pending.remoteAddress;
      if (pending.paymentId && !transaction.paymentId) transaction.paymentId = pending.paymentId;
    }
    this.hydrateSentMessageBody(transaction);
  };

  private preserveMessageTransactionMeta = (next: Transaction, previous: Transaction): void => {
    if (previous.message && !next.message) next.message = previous.message;
    if (!next.message) this.hydrateSentMessageBody(next);
    if (previous.messageViewed) next.messageViewed = previous.messageViewed || next.messageViewed;
    if (previous.remoteAddress && !next.remoteAddress) next.remoteAddress = previous.remoteAddress;
    if (previous.paymentId && !next.paymentId) next.paymentId = previous.paymentId;
  };

  getAll = (forceReload = false): Transaction[] => {
    return this.transactions.slice();
  };

  getAllOuts = (): TransactionOut[] => {
    const alls = this.getAll();
    const outs: TransactionOut[] = [];
    for (const tr of alls) {
      outs.push.apply(outs, tr.outs);
    }
    return outs;
  };

  addNew = (transaction: Transaction | null, replace = true) => {
    if (transaction) {
      this.applyPendingMessageTarget(transaction);
      const exist = this.findWithTxPubKey(transaction.txPubKey);

      if (!exist || replace) {
        if (!exist) {
          this.keyLookupMap.set(transaction.txPubKey, transaction);
          this.txLookupMap.set(transaction.hash, transaction);
          this.transactions.push(transaction);
        } else {
          for (let tr = 0; tr < this.transactions.length; ++tr) {
            if (this.transactions[tr].txPubKey === transaction.txPubKey) {
              // Preserve fusion flag when replacing
              transaction.fusion = this.transactions[tr].fusion;
              // Preserve messageViewed flag when replacing
              transaction.messageViewed =
                this.transactions[tr].messageViewed || transaction.messageViewed;
              this.preserveMessageTransactionMeta(transaction, this.transactions[tr]);
              this.keyLookupMap.set(transaction.txPubKey, transaction);
              this.txLookupMap.set(transaction.hash, transaction);
              this.transactions[tr] = transaction;
            }
          }
        }

        // remove from unconfirmed and preserve fusion flag and messageViewed flag
        const existMem = this.findMemWithTxPubKey(transaction.txPubKey);
        if (existMem) {
          // Preserve fusion flag from mempool
          transaction.fusion = existMem.fusion;
          // Preserve messageViewed flag from mempool
          transaction.messageViewed = existMem.messageViewed || transaction.messageViewed;
          this.preserveMessageTransactionMeta(transaction, existMem);
          const trIndex = this.txsMem.indexOf(existMem);
          if (trIndex != -1) {
            this.txsMem.splice(trIndex, 1);
          }
        }

        // finalize the add tx function
        this.recalculateKeyImages();
        this.signalChanged();
        this.notify();
      }
    }
  };

  /**
   * Update a flag on an existing transaction by txPubKey or hash.
   * Only updates the specified fields, does not replace the transaction object.
   */
  updateTransactionFlags = (
    txPubKeyOrHash: string,
    flags: Partial<Pick<Transaction, "fusion" | "messageViewed">>,
  ) => {
    const tx = this.findWithTxPubKey(txPubKeyOrHash) || this.findWithTxHash(txPubKeyOrHash);
    if (tx) {
      if (typeof flags.fusion !== "undefined") tx.fusion = flags.fusion;
      if (typeof flags.messageViewed !== "undefined") tx.messageViewed = flags.messageViewed;
      this.signalChanged();
      this.notify();
      return true;
    }
    return false;
  };

  addDeposits = (deposits: Deposit[]) => {
    for (let i = 0; i < deposits.length; ++i) {
      this.addDeposit(deposits[i]);
    }
  };

  addDeposit = (deposit: Deposit) => {
    let foundMatch = false;

    for (let i = 0; i < this.deposits.length; ++i) {
      if (this.deposits[i].txHash == deposit.txHash) {
        // only check txHash
        this.deposits[i] = deposit;
        foundMatch = true;
        break;
      }
    }

    if (!foundMatch) {
      this.deposits.push(deposit);
    }

    this.signalChanged();
    this.notify();
  };

  updateDepositFlags = (
    txHashOrPubKey: string,
    flags: Partial<Pick<Deposit, "withdrawPending">>,
  ) => {
    const deposit = this.deposits.find(
      (d) => d.txHash === txHashOrPubKey || d.txPubKey === txHashOrPubKey,
    );
    if (deposit) {
      if (typeof flags.withdrawPending !== "undefined")
        deposit.withdrawPending = flags.withdrawPending;
      this.signalChanged();
      this.notify();
      return true;
    }
    return false;
  };

  addWithdrawals = (withdrawals: Withdrawal[]) => {
    for (let i = 0; i < withdrawals.length; ++i) {
      this.addWithdrawal(withdrawals[i]);
    }
  };

  addWithdrawal = (withdrawal: Withdrawal) => {
    let foundMatchDeposit = false;
    let foundMatchWithdrawal = false;

    // 1. First Priority: Match deposits with withdrawPending=true AND matching amount and outputIndex
    for (let i = 0; i < this.deposits.length; ++i) {
      if (
        this.deposits[i].withdrawPending === true &&
        this.deposits[i].amount === withdrawal.amount &&
        this.deposits[i].globalOutputIndex === withdrawal.globalOutputIndex
      ) {
        this.deposits[i].spentTx = withdrawal.txHash;
        this.deposits[i].withdrawPending = false; // Clear the flag
        foundMatchDeposit = true;
        break;
      }
    }

    // 2. Second Priority: Match by amount and outputIndex (fallback)
    if (!foundMatchDeposit) {
      for (let i = 0; i < this.deposits.length; ++i) {
        if (
          this.deposits[i].amount === withdrawal.amount &&
          this.deposits[i].globalOutputIndex === withdrawal.globalOutputIndex &&
          !this.deposits[i].spentTx
        ) {
          this.deposits[i].spentTx = withdrawal.txHash;
          foundMatchDeposit = true;
          break;
        }
      }
    }

    // 3. Update withdrawals array - first try to find by txHash (most reliable)
    for (let i = 0; i < this.withdrawals.length; ++i) {
      if (this.withdrawals[i].txHash === withdrawal.txHash) {
        this.withdrawals[i] = withdrawal;
        foundMatchWithdrawal = true;
        break;
      }
    }

    // 4. Update withdrawals array - fallback to amount & outputIndex if needed
    if (!foundMatchWithdrawal) {
      for (let i = 0; i < this.withdrawals.length; ++i) {
        if (
          this.withdrawals[i].amount === withdrawal.amount &&
          this.withdrawals[i].globalOutputIndex === withdrawal.globalOutputIndex
        ) {
          this.withdrawals[i] = withdrawal;
          foundMatchWithdrawal = true;
          break;
        }
      }
    }

    // Add as new withdrawal if no match found
    if (!foundMatchWithdrawal) {
      this.withdrawals.push(withdrawal);
    }

    this.signalChanged();
    this.notify();
  };

  addNewMemTx = (transaction: Transaction, replace = true) => {
    this.applyPendingMessageTarget(transaction);
    let modified: boolean = false;
    let foundTx: boolean = false;

    for (let i = 0; i < this.txsMem.length; ++i) {
      if (this.txsMem[i].hash === transaction.hash) {
        if (replace) {
          this.preserveMessageTransactionMeta(transaction, this.txsMem[i]);
          this.txsMem[i] = transaction;
          modified = true;
        }
        foundTx = true;
      }
    }

    if (!foundTx) {
      this.txsMem.push(transaction);
      modified = true;
    }

    if (modified) {
      this.signalChanged();
    }
  };

  clearMemTx = () => {
    this.txsMem = [];
  };

  findWithTxPubKey = (pubKey: string): Transaction | null => {
    const transaction: Transaction | undefined = this.keyLookupMap.get(pubKey);

    if (transaction !== undefined) {
      return transaction;
    } else {
      return null;
    }
  };

  findWithTxHash = (hash: string): Transaction | null => {
    const transaction: Transaction | undefined = this.txLookupMap.get(hash);

    if (transaction !== undefined) {
      return transaction;
    } else {
      return null;
    }
  };

  findMemWithTxPubKey = (pubKey: string): Transaction | null => {
    for (const tr of this.txsMem) if (tr.txPubKey === pubKey) return tr;
    return null;
  };

  findTxPrivateKeyWithHash = (hash: string): string | null => {
    if (typeof this.txPrivateKeys[hash] !== "undefined") return this.txPrivateKeys[hash];
    return null;
  };

  addTxPrivateKeyWithTxHash = (txHash: string, txPrivKey: string): void => {
    this.txPrivateKeys[txHash] = txPrivKey;
    this.signalChanged();
  };

  addTxPrivateKeyWithTxHashAndFusion = (
    txHash: string,
    txPrivKey: string,
    fusion: boolean,
  ): void => {
    this.txPrivateKeys[txHash] = txPrivKey;
    const tx = this.transactions.find((tx) => tx.hash === txHash);
    if (tx) tx.fusion = fusion;
    this.signalChanged();
  };

  getTransactionKeyImages = () => {
    return this.keyImages;
  };

  getTransactionOutIndexes = () => {
    return this.txOutIndexes;
  };

  getOutWithGlobalIndex = (index: number): TransactionOut | null => {
    for (const tx of this.transactions) {
      for (const out of tx.outs) {
        if (out.globalIndex === index) return out;
      }
    }
    return null;
  };

  private keyImages: string[] = [];
  private txOutIndexes: number[] = [];
  private recalculateKeyImages() {
    const keys: string[] = [];
    const indexes: number[] = [];
    for (const transaction of this.transactions) {
      for (const out of transaction.outs) {
        if (out.keyImage !== null && out.keyImage !== "") keys.push(out.keyImage);
        if (out.globalIndex !== 0) indexes.push(out.globalIndex);
      }
    }
    this.keyImages = keys;
    this.txOutIndexes = indexes;
  }

  getTransactionsCopy = (): Transaction[] => {
    const news: any[] = [];
    for (const transaction of this.transactions) {
      news.push(Transaction.fromRaw(transaction.export()));
    }
    news.sort((a, b) => {
      return a.timestamp - b.timestamp;
    });
    return news;
  };

  getDepositsCopy = (): Deposit[] => {
    const news: any[] = this.deposits.slice();

    news.sort((a, b) => {
      return a.timestamp - b.timestamp;
    });
    return news;
  };

  /**
   * Checks if there are any pending deposits in the wallet.
   * @returns {boolean} True if there is at least one pending deposit
   */
  get hasPendingDeposit(): boolean {
    // Check mempool transactions
    for (const tx of this.txsMem) {
      for (const out of tx.outs) {
        if (out.type === "03" && (out.globalIndex === undefined || out.globalIndex === 0)) {
          return true;
        }
      }
    }
    return false;
  }

  getWithdrawalsCopy = (): Deposit[] => {
    const news: any[] = this.withdrawals.slice();

    news.sort((a, b) => {
      return a.timestamp - b.timestamp;
    });
    return news;
  };

  get amount(): number {
    return this.availableAmount(-1);
  }

  availableAmount = (currentBlockHeight: number = -1): number => {
    let amount = 0;
    for (const transaction of this.transactions) {
      if (!transaction.isFullyChecked()) continue;

      if (transaction.isConfirmed(currentBlockHeight) || currentBlockHeight === -1) {
        for (const nout of transaction.outs) {
          if (nout.type !== "03") {
            amount += nout.amount;
          }
        }
      }

      for (const nin of transaction.ins) {
        if (nin.type !== "03") {
          amount -= nin.amount;
        }
      }
    }

    for (const transaction of this.txsMem) {
      if (transaction.isConfirmed(currentBlockHeight) || currentBlockHeight === -1) {
        for (const nout of transaction.outs) {
          if (nout.type !== "03") {
            amount += nout.amount;
          }
        }
      }

      for (const nin of transaction.ins) {
        if (nin.type !== "03") {
          amount -= nin.amount;
        }
      }
    }

    return amount;
  };

  lockedDeposits = (currHeight: number): number => {
    let amount = 0;
    for (const deposit of this.deposits) {
      //if (!deposit.tx?.isFullyChecked()) {
      //  continue;
      //}

      if (deposit.blockHeight + deposit.term > currHeight) {
        amount += deposit.amount;
      }
    }

    return amount;
  };

  unlockedDeposits = (currHeight: number): number => {
    let amount = 0;
    for (const deposit of this.deposits) {
      //if (!deposit.tx?.isFullyChecked()) {
      //	continue;
      //}

      if (deposit.blockHeight + deposit.term <= currHeight) {
        if (!deposit.spentTx) {
          amount += deposit.amount;
        }
      }
    }

    return amount;
  };

  // Calculate total future interest (from both locked and unlocked deposits)
  futureDepositInterest = (
    currHeight: number,
  ): { spent: number; locked: number; unlocked: number; total: number } => {
    let futureLockedInterest = 0;
    let futureUnlockedInterest = 0;
    let spentInterest = 0;

    for (const deposit of this.deposits) {
      const status = deposit.getStatus(currHeight);
      switch (status) {
        case "Locked":
          futureLockedInterest += deposit.interest;
          break;
        case "Unlocked":
          futureUnlockedInterest += deposit.interest;
          break;
        case "Spent":
          spentInterest += deposit.interest;
          break;
      }
    }

    return {
      spent: spentInterest,
      locked: futureLockedInterest,
      unlocked: futureUnlockedInterest,
      total: futureLockedInterest + futureUnlockedInterest,
    };
  };

  // Returns the deposit with the earliest unlock date (not spent)
  earliestUnlockableDeposit = (currHeight: number): Deposit | null => {
    let earliest: Deposit | null = null;
    for (const deposit of this.deposits) {
      if (deposit.isSpent()) continue;
      if (!earliest || deposit.unlockHeight < earliest.unlockHeight) {
        earliest = deposit;
      }
    }
    return earliest;
  };

  hasBeenModified = (): Boolean => {
    return this.modified;
  };

  modifiedTimestamp = (): Date => {
    return this.modifiedTS;
  };

  getPublicAddress = () => {
    return Cn.pubkeys_to_string(this.keys.pub.spend, this.keys.pub.view);
  };

  recalculateIfNotViewOnly = () => {
    if (!this.isViewOnly()) {
      for (const tx of this.transactions) {
        let needDerivation = false;
        for (const out of tx.outs) {
          if (out.keyImage === "") {
            needDerivation = true;
            break;
          }
        }

        if (needDerivation) {
          let derivation = "";
          try {
            derivation = concealjs.crypto.generate_key_derivation(tx.txPubKey, this.keys.priv.view);
          } catch (e) {
            continue;
          }
          for (const out of tx.outs) {
            if (out.keyImage === "") {
              const m_key_image = CnTransactions.generate_key_image_helper(
                {
                  view_secret_key: this.keys.priv.view,
                  spend_secret_key: this.keys.priv.spend,
                  public_spend_key: this.keys.pub.spend,
                },
                tx.txPubKey,
                out.outputIdx,
                derivation,
              );

              out.keyImage = m_key_image.key_image;
              out.ephemeralPub = m_key_image.ephemeral_pub;
              this.signalChanged();
            }
          }
        }
      }

      if (this.modified) {
        this.recalculateKeyImages();
      }

      for (let iTx = 0; iTx < this.transactions.length; ++iTx) {
        for (let iIn = 0; iIn < this.transactions[iTx].ins.length; ++iIn) {
          const vin = this.transactions[iTx].ins[iIn];

          if (vin.amount < 0) {
            if (this.keyImages.indexOf(vin.keyImage) != -1) {
              //logDebugMsg('found in', vin);
              const walletOuts = this.getAllOuts();
              for (const ut of walletOuts) {
                if (ut.keyImage == vin.keyImage) {
                  this.transactions[iTx].ins[iIn].amount = ut.amount;
                  this.transactions[iTx].ins[iIn].keyImage = ut.keyImage;

                  this.signalChanged();
                  break;
                }
              }
            } else {
              this.transactions[iTx].ins.splice(iIn, 1);
              --iIn;
            }
          }
        }

        if (this.transactions[iTx].outs.length === 0 && this.transactions[iTx].ins.length === 0) {
          this.transactions.splice(iTx, 1);
          --iTx;
        }
      }
    }
  };

  /**
   * Estimates the fusion readiness of the wallet.
   * @param threshold The threshold amount for fusion.
   * @param blockchainHeight The current blockchain height.
   * @returns { unspentOutsCount: number, fusionReadyCount: number }
   */
  estimateFusionReadyness = (
    threshold: number,
    blockchainHeight: number,
  ): { unspentOutsCount: number; fusionReadyCount: number } => {
    // Number of buckets: 20 (uint64_t has 19 digits + 1)
    const NUM_BUCKETS = 20;
    const bucketSizes = new Array<number>(NUM_BUCKETS).fill(0);

    // Use unspent outputs only
    const unspentOuts: RawOutForTx[] = TransactionsExplorer.formatWalletOutsForTx(
      this,
      blockchainHeight,
    );
    const unspentOutsCount = unspentOuts.length;

    for (const out of unspentOuts) {
      const result = Currency.isAmountApplicableInFusionTransactionInput(
        out.amount,
        threshold,
        blockchainHeight,
      );
      if (result.applicable && typeof result.amountPowerOfTen === "number") {
        if (result.amountPowerOfTen < NUM_BUCKETS) {
          bucketSizes[result.amountPowerOfTen]++;
        }
      }
    }

    let fusionReadyCount = 0;
    for (const bucketSize of bucketSizes) {
      if (bucketSize >= config.optimizeOutputs) {
        fusionReadyCount += bucketSize;
      }
    }

    return {
      unspentOutsCount,
      fusionReadyCount,
    };
  };

  pickRandomFusionInputs = (
    threshold: number,
    blockchainHeight: number,
    minInputCount: number = Currency.fusionTxMinInputCount,
    maxInputCount: number,
  ): RawOutForTx[] => {
    const NUM_BUCKETS = 20;
    const bucketSizes = new Array<number>(NUM_BUCKETS).fill(0);

    // Use unspent outputs only
    const unspentOuts: RawOutForTx[] = TransactionsExplorer.formatWalletOutsForTx(
      this,
      blockchainHeight,
    );
    const allFusionReadyOuts: RawOutForTx[] = [];

    // First pass: collect all fusion-ready outputs and count bucket sizes
    for (const out of unspentOuts) {
      const result = Currency.isAmountApplicableInFusionTransactionInput(
        out.amount,
        threshold,
        blockchainHeight,
      );
      if (result.applicable) {
        allFusionReadyOuts.push(out);
        const powerOfTen = result.amountPowerOfTen || 0;
        if (powerOfTen < NUM_BUCKETS) {
          bucketSizes[powerOfTen]++;
        }
      }
    }

    // Create and shuffle bucket numbers
    const bucketNumbers = Array.from({ length: NUM_BUCKETS }, (_, i) => i);
    const bucketGenerator = new ShuffleGenerator(NUM_BUCKETS);
    const shuffledBucketNumbers: number[] = [];
    for (let i = 0; i < NUM_BUCKETS; i++) {
      shuffledBucketNumbers.push(bucketNumbers[bucketGenerator.next()]);
    }

    // Find first bucket with enough inputs
    const selectedBucket = shuffledBucketNumbers.find(
      (bucket) => bucketSizes[bucket] >= minInputCount,
    );
    if (selectedBucket === undefined) {
      return [];
    }

    // Calculate bounds for selected bucket
    let lowerBound = 1;
    for (let i = 0; i < selectedBucket; ++i) {
      lowerBound *= 10;
    }
    const upperBound =
      selectedBucket === NUM_BUCKETS - 1 ? Number.MAX_SAFE_INTEGER : lowerBound * 10;

    // Select outputs within bounds
    const selectedOuts = allFusionReadyOuts.filter(
      (out) => out.amount >= lowerBound && out.amount < upperBound,
    );
    // Ensure we have enough outputs for fusion
    if (selectedOuts.length < minInputCount) {
      return [];
    }
    // Sort by amount
    selectedOuts.sort((a, b) => a.amount - b.amount);

    // If we have more outputs than maxInputCount, randomly select maxInputCount outputs
    if (selectedOuts.length > maxInputCount) {
      const generator = new ShuffleGenerator(selectedOuts.length);
      const trimmedSelectedOuts: RawOutForTx[] = [];
      for (let i = 0; i < maxInputCount; ++i) {
        trimmedSelectedOuts.push(selectedOuts[generator.next()]);
      }
      trimmedSelectedOuts.sort((a, b) => a.amount - b.amount);
      return trimmedSelectedOuts;
    }

    return selectedOuts;
  };

  optimizationNeeded = (blockchainHeight: number, threshold: number): IOptimizeInfo => {
    const unspentOuts: RawOutForTx[] = TransactionsExplorer.formatWalletOutsForTx(
      this,
      blockchainHeight,
    );
    const unspentOutsCount = unspentOuts.length;
    let isNeeded = false;
    if (unspentOutsCount < config.optimizeOutputs) {
      return {
        numOutputs: unspentOutsCount,
        isNeeded: false,
      };
    }
    const balance = this.availableAmount(blockchainHeight);
    //threshold = config.optimizeThreshold;
    let fusionReady = false;
    while (threshold <= balance && !fusionReady) {
      const estimation = this.estimateFusionReadyness(threshold, blockchainHeight);
      if (estimation.fusionReadyCount > config.optimizeOutputs / 2) {
        fusionReady = true;
        break;
      } else {
        threshold = 10 * threshold;
      }
    }
    if (fusionReady) {
      isNeeded = true;
    } else {
      logDebugMsg("Nothing to optimize, unspentOutsCount", unspentOutsCount);
    }
    return {
      numOutputs: unspentOutsCount,
      isNeeded: isNeeded,
    };
  };

  createFusionTransaction = async (
    blockchainHeight: number,
    threshold: number,
    blockchainExplorer: BlockchainExplorer,
    obtainMixOutsCallback: (amounts: number[], numberOuts: number) => Promise<RawDaemon_Out[]>,
  ): Promise<number> => {
    const MAX_FUSION_OUTPUTS = config.maxFusionOutputs;
    const fusionThreshold = config.dustThreshold;
    const neededFee = config.minimumFee_V2;
    if (threshold <= fusionThreshold) {
      throw new Error("Threshold is too low");
    }
    const destinationAddress = this.getPublicAddress();
    if (destinationAddress === "") {
      throw new Error("Destination address is not set");
    }
    const estimateFusionInputsCount = Currency.getApproximateMaximumInputCount(
      Currency.fusionTxMaxSize,
      MAX_FUSION_OUTPUTS,
      config.defaultMixin,
    );
    if (estimateFusionInputsCount < Currency.fusionTxMinInputCount) {
      throw new Error("Mixin count is too big");
    }
    const fusionInputs = this.pickRandomFusionInputs(
      threshold,
      blockchainHeight,
      Currency.fusionTxMinInputCount,
      estimateFusionInputsCount,
    );
    if (fusionInputs.length < Currency.fusionTxMinInputCount) {
      throw new Error("Nothing to optimize");
    }

    let fusionTransaction: any = null;
    let transactionSize = 0;
    let round = 0;

    do {
      if (round !== 0) {
        fusionInputs.pop();
      }

      const inputAmounts = fusionInputs.map((input) => input.amount);

      let mixinResult: RawDaemon_Out[] = [];
      if (config.defaultMixin !== 0) {
        mixinResult = await obtainMixOutsCallback(inputAmounts, config.defaultMixin + 1);
      }

      const inputsAmount = fusionInputs.reduce((sum, input) => sum + input.amount, 0);

      const dsts = [
        {
          address: destinationAddress,
          amount: inputsAmount - neededFee,
        },
      ];

      const data = await TransactionsExplorer.createRawTx(
        dsts,
        this,
        false,
        fusionInputs,
        false,
        mixinResult,
        config.defaultMixin,
        neededFee,
        "",
        "",
        0,
        "regular",
        0,
      );

      transactionSize = Currency.getApproximateTransactionSize(
        data.signed.vin.length,
        data.signed.vout.length,
        config.defaultMixin,
      );
      fusionTransaction = data;

      round++;
    } while (
      transactionSize > Currency.fusionTxMaxSize &&
      fusionInputs.length >= Currency.fusionTxMinInputCount
    );

    if (fusionInputs.length < Currency.fusionTxMinInputCount) {
      throw new Error("Minimum input count not met");
    }
    if (!fusionTransaction || fusionTransaction.signed.vout.length === 0) {
      throw new Error("Transaction has no outputs");
    }
    if (fusionTransaction.signed.vout.length > MAX_FUSION_OUTPUTS) {
      throw new Error("Maximum output count exceeded");
    }

    await blockchainExplorer.sendRawTx(fusionTransaction.raw.raw);
    this.addTxPrivateKeyWithTxHashAndFusion(
      fusionTransaction.raw.hash,
      fusionTransaction.raw.prvkey,
      true,
    );

    return round;
  };

  clearTransactions = () => {
    this.txsMem = [];
    this.deposits = [];
    this.withdrawals = [];
    this.transactions = [];
    this.txLookupMap.clear();
    this.keyLookupMap.clear();
    this.recalculateKeyImages;
    this.notify();
  };

  resetScanHeight = () => {
    this.lastHeight = this.creationHeight;
    this.signalChanged();
    this.notify();
  };
}
// Add this helper class for random number generation
class ShuffleGenerator {
  private indices: number[];
  private currentIndex: number;

  constructor(size: number) {
    this.indices = Array.from({ length: size }, (_, i) => i);
    this.currentIndex = size;
    this.shuffle();
  }

  private shuffle() {
    for (let i = this.indices.length - 1; i > 0; i--) {
      const j = Math.floor(MathUtil.randomFloat() * (i + 1));
      [this.indices[i], this.indices[j]] = [this.indices[j], this.indices[i]];
    }
  }

  next(): number {
    if (this.currentIndex === 0) {
      this.shuffle();
      this.currentIndex = this.indices.length;
    }
    return this.indices[--this.currentIndex];
  }
}
