import type {
  AccountJson,
  AllowedPath,
  AuthorizeRequest,
  MessageTypes,
  MessageTypesWithNoSubscriptions,
  MessageTypesWithNullRequest,
  MessageTypesWithSubscriptions,
  MetadataRequest,
  RequestTypes,
  ResponseAuthorizeList,
  ResponseDeriveValidate,
  ResponseJsonGetAccountInfo,
  ResponseSigningIsLocked,
  ResponseTypes,
  SeedLengths,
  SigningRequest,
  SubscriptionMessageTypes,
} from '@subwallet/extension-base/background/types';
import { RequestCurrentAccountAddress } from '@subwallet/extension-base/background/types';
import type { Message } from '@subwallet/extension-base/types';
import type { KeyringPair$Json } from '@polkadot/keyring/types';
import type { KeyringPairs$Json } from '@polkadot/ui-keyring/types';
import type { HexString } from '@polkadot/util/types';
import type { KeypairType } from '@polkadot/util-crypto/types';

import { AuthUrls } from '@subwallet/extension-base/background/handlers/State';
import {
  AccountsWithCurrentAddress,
  BalanceJson,
  BasicTxInfo,
  BasicTxResponse,
  BondingOptionInfo,
  BondingSubmitParams,
  ChainBondingBasics,
  ChainRegistry,
  ConfirmationDefinitions,
  ConfirmationsQueue,
  ConfirmationType,
  CrowdloanJson,
  CurrentAccountInfo,
  CustomEvmToken,
  DelegationItem,
  DeleteEvmTokenParams,
  DisableNetworkResponse,
  EvmNftSubmitTransaction,
  EvmNftTransaction,
  EvmNftTransactionRequest,
  EvmTokenJson,
  NetworkJson,
  NftCollectionJson,
  NftJson,
  NftTransactionResponse,
  NftTransferExtra,
  OptionInputAddress,
  PriceJson,
  RequestAuthorizationBlock,
  RequestAuthorizationPerSite,
  RequestCheckCrossChainTransfer,
  RequestCheckTransfer,
  RequestCrossChainTransfer,
  RequestFreeBalance,
  RequestNftForceUpdate,
  RequestParseEVMTransactionInput,
  RequestSettingsType,
  RequestSubscribeBalance,
  RequestSubscribeBalancesVisibility,
  RequestSubscribeCrowdloan,
  RequestSubscribeNft,
  RequestSubscribePrice,
  RequestSubscribeStaking,
  RequestSubscribeStakingReward,
  RequestTransfer,
  RequestTransferCheckReferenceCount,
  RequestTransferCheckSupporting,
  RequestTransferExistentialDeposit,
  ResponseAccountCreateSuriV2,
  ResponseCheckCrossChainTransfer,
  ResponseCheckTransfer,
  ResponseParseEVMTransactionInput,
  ResponsePrivateKeyValidateV2,
  ResponseSeedCreateV2,
  ResponseSeedValidateV2,
  ResponseSettingsType,
  ResponseTransfer,
  StakeClaimRewardParams,
  StakeDelegationRequest,
  StakeUnlockingJson,
  StakeWithdrawalParams,
  StakingJson,
  StakingRewardJson,
  SubstrateNftSubmitTransaction,
  SubstrateNftTransaction,
  SubstrateNftTransactionRequest,
  SupportTransferResponse,
  ThemeTypes,
  TransactionHistoryItemType,
  TransferError,
  UnbondingSubmitParams,
  ValidateEvmTokenRequest,
  ValidateNetworkResponse,
} from '@subwallet/extension-base/background/KoniTypes';
import { getId } from '@subwallet/extension-base/utils/getId';
import { RefObject } from 'react';
import WebView from 'react-native-webview';
import { SingleAddress } from '@polkadot/ui-keyring/observable/types';
import { WebRunnerStatus } from 'providers/contexts';
import { WebviewError, WebviewNotReadyError, WebviewResponseError } from './errors/WebViewErrors';
import EventEmitter from 'eventemitter3';
import {
  ActiveCronAndSubscriptionMap,
  CronServiceType,
  RequestInitCronAndSubscription,
  SubscriptionServiceType,
} from 'types/background';

interface Handler {
  resolve: (data: any) => void;
  reject: (error: Error) => void;
  subscriber?: (data: any) => void;
}

type Handlers = Record<string, Handler>;
type MessageType = 'PRI' | 'PUB' | 'EVM' | 'UNKNOWN';
const handlers: Handlers = {};
const handlerTypeMap: Record<string, MessageType> = {};
let webviewRef: RefObject<WebView | undefined>;
let webviewEvents: EventEmitter;
let status: WebRunnerStatus = 'init';

export async function clearWebRunnerHandler(id: string): Promise<boolean> {
  const handler = handlers[id];
  const handlerTypeMapValue = handlerTypeMap[id];

  if (!handler && !handlerTypeMapValue) {
    return true;
  }

  if (handler) {
    delete handlers[id];
  }

  if (handlerTypeMapValue) {
    delete handlerTypeMap[id];

    if (['PRI', 'PUB', 'EVM'].includes(handlerTypeMapValue)) {
      return cancelSubscription(id);
    }
  }

  return true;
}

export function getMessageType(message: string): MessageType {
  if (message.startsWith('pri(')) {
    return 'PRI';
  } else if (message.startsWith('pub(')) {
    return 'PUB';
  } else if (message.startsWith('evm(')) {
    return 'EVM';
  }

  return 'UNKNOWN';
}

export function getHandlerId(message: string, id?: string): string {
  return `${getMessageType(message)}|${id ? id : getId()}`;
}

function isDappHandle(id: string): boolean {
  if (!handlerTypeMap[id]) {
    return false;
  }

  return handlerTypeMap[id] === 'PUB' || handlerTypeMap[id] === 'EVM';
}

export const setupWebview = (viewRef: RefObject<WebView | undefined>, eventEmitter: EventEmitter) => {
  webviewRef = viewRef;
  // Subscribe in the first time only
  if (!webviewEvents) {
    eventEmitter.on('update-status', stt => {
      status = stt;
    });
    eventEmitter.on('reloading', () => {
      console.debug(`### Clean ${Object.keys(handlers).length} handlers`);
      Object.entries(handlers).forEach(([id, handler]) => {
        handler.reject(new WebviewNotReadyError('Webview is not ready'));
        delete handlers[id];
        delete handlerTypeMap[id];
      });
    });
  }
  webviewEvents = eventEmitter;
};

export const listenMessage = (
  data: Message['data'],
  eventEmitter?: EventEmitter,
  handleUnknown?: (data: Message['data']) => boolean,
): void => {
  const handlerId = data.id;

  if (isDappHandle(handlerId)) {
    if (data.response !== undefined || data.subscription !== undefined) {
      eventEmitter?.emit(handlerId, JSON.stringify(data));
    }
    return;
  }

  const handler = handlers[handlerId];

  if (!handler) {
    let unknownHandled = false;
    if (handleUnknown) {
      unknownHandled = handleUnknown(data);
    }

    if (!unknownHandled) {
      console.warn(`Unknown response: ${JSON.stringify(handlerId)}`);
    }

    return;
  }

  if (!handler.subscriber) {
    delete handlers[handlerId];
    delete handlerTypeMap[handlerId];
  }

  if (data.subscription) {
    (handler.subscriber as Function)(data.subscription);
  } else if (data.error) {
    handler.reject(new WebviewResponseError(data.error));
  } else {
    handler.resolve(data.response);
  }
};

// @ts-ignore
export const postMessage = ({ id, message, request, origin }) => {
  handlerTypeMap[id] = getMessageType(message);

  const _post = () => {
    const injection = 'window.postMessage(' + JSON.stringify({ id, message, request, origin }) + ')';
    webviewRef.current?.injectJavaScript(injection);
  };

  if (!webviewRef || !webviewEvents) {
    throw new WebviewError('Webview is not init');
  }

  if (status === 'crypto_ready') {
    _post();
  } else {
    const listenEvent = webviewEvents.on('update-status', stt => {
      if (stt === 'crypto_ready') {
        _post();
        listenEvent.removeListener('update-status');
      }
    });
  }
};

export function sendMessage<TMessageType extends MessageTypesWithNullRequest>(
  message: TMessageType,
): Promise<ResponseTypes[TMessageType]>;
export function sendMessage<TMessageType extends MessageTypesWithNoSubscriptions>(
  message: TMessageType,
  request: RequestTypes[TMessageType],
): Promise<ResponseTypes[TMessageType]>;
export function sendMessage<TMessageType extends MessageTypesWithSubscriptions>(
  message: TMessageType,
  request: RequestTypes[TMessageType],
  subscriber: (data: SubscriptionMessageTypes[TMessageType]) => void,
): Promise<ResponseTypes[TMessageType]>;
export function sendMessage<TMessageType extends MessageTypes>(
  message: TMessageType,
  request?: RequestTypes[TMessageType],
  subscriber?: (data: unknown) => void,
): Promise<ResponseTypes[TMessageType]> {
  return new Promise((resolve, reject): void => {
    const id = getId();

    handlers[id] = { reject, resolve, subscriber };

    postMessage({ id, message, request: request || {}, origin: undefined });
  });
}

export async function editAccount(address: string, name: string): Promise<boolean> {
  return sendMessage('pri(accounts.edit)', { address, name });
}

export async function showAccount(address: string, isShowing: boolean): Promise<boolean> {
  return sendMessage('pri(accounts.show)', { address, isShowing });
}

export async function saveCurrentAccountAddress(
  data: RequestCurrentAccountAddress,
  callback: (data: CurrentAccountInfo) => void,
): Promise<boolean> {
  return sendMessage('pri(currentAccount.saveAddress)', data, callback);
}

export async function toggleBalancesVisibility(callback: (data: RequestSettingsType) => void): Promise<boolean> {
  return sendMessage('pri(settings.changeBalancesVisibility)', null, callback);
}

export async function saveAccountAllLogo(
  accountAllLogo: string,
  callback: (data: RequestSettingsType) => void,
): Promise<boolean> {
  return sendMessage('pri(settings.saveAccountAllLogo)', accountAllLogo, callback);
}

export async function saveTheme(theme: ThemeTypes, callback: (data: RequestSettingsType) => void): Promise<boolean> {
  return sendMessage('pri(settings.saveTheme)', theme, callback);
}

export async function subscribeSettings(
  data: RequestSubscribeBalancesVisibility,
  callback: (data: ResponseSettingsType) => void,
): Promise<ResponseSettingsType> {
  return sendMessage('pri(settings.subscribe)', data, callback);
}

export async function tieAccount(address: string, genesisHash: string | null): Promise<boolean> {
  return sendMessage('pri(accounts.tie)', { address, genesisHash });
}

export async function exportAccount(address: string, password: string): Promise<{ exportedJson: KeyringPair$Json }> {
  return sendMessage('pri(accounts.export)', { address, password });
}

export async function exportAccountPrivateKey(address: string, password: string): Promise<{ privateKey: string }> {
  return sendMessage('pri(accounts.exportPrivateKey)', { address, password });
}

export async function exportAccounts(
  addresses: string[],
  password: string,
): Promise<{ exportedJson: KeyringPairs$Json }> {
  return sendMessage('pri(accounts.batchExport)', { addresses, password });
}

export async function validateAccount(address: string, password: string): Promise<boolean> {
  return sendMessage('pri(accounts.validate)', { address, password });
}

export async function forgetAccount(address: string): Promise<boolean> {
  return sendMessage('pri(accounts.forget)', { address });
}

export async function approveAuthRequest(id: string): Promise<boolean> {
  return sendMessage('pri(authorize.approve)', { id });
}

export async function approveAuthRequestV2(id: string, accounts: string[]): Promise<boolean> {
  return sendMessage('pri(authorize.approveV2)', { id, accounts });
}

export async function approveMetaRequest(id: string): Promise<boolean> {
  return sendMessage('pri(metadata.approve)', { id });
}

export async function cancelSignRequest(id: string): Promise<boolean> {
  return sendMessage('pri(signing.cancel)', { id });
}

export async function isSignLocked(id: string): Promise<ResponseSigningIsLocked> {
  return sendMessage('pri(signing.isLocked)', { id });
}

export async function approveSignPassword(id: string, savePass: boolean, password?: string): Promise<boolean> {
  return sendMessage('pri(signing.approve.password)', { id, password, savePass });
}

export async function approveSignSignature(id: string, signature: HexString): Promise<boolean> {
  return sendMessage('pri(signing.approve.signature)', { id, signature });
}

export async function createAccountExternal(name: string, address: string, genesisHash: string): Promise<boolean> {
  return sendMessage('pri(accounts.create.external)', { address, genesisHash, name });
}

export async function createAccountHardware(
  address: string,
  hardwareType: string,
  accountIndex: number,
  addressOffset: number,
  name: string,
  genesisHash: string,
): Promise<boolean> {
  return sendMessage('pri(accounts.create.hardware)', {
    accountIndex,
    address,
    addressOffset,
    genesisHash,
    hardwareType,
    name,
  });
}

export async function createAccountSuri(
  name: string,
  password: string,
  suri: string,
  type?: KeypairType,
  genesisHash?: string,
): Promise<boolean> {
  return sendMessage('pri(accounts.create.suri)', { genesisHash, name, password, suri, type });
}

export async function createAccountSuriV2(
  name: string,
  password: string,
  suri: string,
  isAllowed: boolean,
  types?: Array<KeypairType>,
  genesisHash?: string,
): Promise<ResponseAccountCreateSuriV2> {
  return sendMessage('pri(accounts.create.suriV2)', { genesisHash, name, password, suri, types, isAllowed });
}

export async function createSeed(
  length?: SeedLengths,
  seed?: string,
  type?: KeypairType,
): Promise<{ address: string; seed: string }> {
  return sendMessage('pri(seed.create)', { length, seed, type });
}

export async function createSeedV2(
  length?: SeedLengths,
  seed?: string,
  types?: Array<KeypairType>,
): Promise<ResponseSeedCreateV2> {
  return sendMessage('pri(seed.createV2)', { length, seed, types });
}

// export async function getAllMetatdata(): Promise<MetadataDef[]> {
//   return sendMessage('pri(metadata.list)');
// }
//
// export async function getMetadata(genesisHash?: string | null, isPartial = false): Promise<Chain | null> {
//   if (!genesisHash) {
//     return null;
//   }
//
//   const chains = await getNetworkMap();
//   const parsedChains = _getKnownHashes(chains);
//
//   let request = getSavedMeta(genesisHash);
//
//   if (!request) {
//     request = sendMessage('pri(metadata.get)', genesisHash || null);
//     setSavedMeta(genesisHash, request);
//   }
//
//   const def = await request;
//
//   if (def) {
//     return metadataExpand(def, isPartial);
//   } else if (isPartial) {
//     const chain = parsedChains.find(chain => chain.genesisHash === genesisHash);
//
//     if (chain) {
//       return metadataExpand(
//         {
//           ...chain,
//           specVersion: 0,
//           tokenDecimals: 15,
//           tokenSymbol: 'Unit',
//           types: {},
//         },
//         isPartial,
//       );
//     }
//   }
//
//   return null;
// }

export async function rejectAuthRequest(id: string): Promise<boolean> {
  return sendMessage('pri(authorize.reject)', { id });
}

export async function rejectAuthRequestV2(id: string): Promise<boolean> {
  return sendMessage('pri(authorize.rejectV2)', { id });
}

export async function cancelAuthRequestV2(id: string): Promise<boolean> {
  return sendMessage('pri(authorize.cancelV2)', { id });
}

export async function rejectMetaRequest(id: string): Promise<boolean> {
  return sendMessage('pri(metadata.reject)', { id });
}

export async function subscribeAccounts(cb: (accounts: AccountJson[]) => void): Promise<boolean> {
  return sendMessage('pri(accounts.subscribe)', {}, cb);
}

export async function subscribeAccountsWithCurrentAddress(
  cb: (data: AccountsWithCurrentAddress) => void,
): Promise<boolean> {
  return sendMessage('pri(accounts.subscribeWithCurrentAddress)', {}, cb);
}

export async function subscribeAccountsInputAddress(cb: (data: OptionInputAddress) => void): Promise<string> {
  return sendMessage('pri(accounts.subscribeAccountsInputAddress)', {}, cb);
}

export async function saveRecentAccountId(accountId: string): Promise<SingleAddress> {
  return sendMessage('pri(accounts.saveRecent)', { accountId });
}

export async function triggerAccountsSubscription(): Promise<boolean> {
  return sendMessage('pri(accounts.triggerSubscription)');
}

export async function subscribeAuthorizeRequests(cb: (accounts: AuthorizeRequest[]) => void): Promise<boolean> {
  return sendMessage('pri(authorize.requests)', null, cb);
}

export async function subscribeAuthorizeRequestsV2(cb: (accounts: AuthorizeRequest[]) => void): Promise<boolean> {
  return sendMessage('pri(authorize.requestsV2)', null, cb);
}

export async function getAuthList(): Promise<ResponseAuthorizeList> {
  return sendMessage('pri(authorize.list)');
}

export async function getAuthListV2(): Promise<ResponseAuthorizeList> {
  return sendMessage('pri(authorize.listV2)');
}

export async function toggleAuthorization(url: string): Promise<ResponseAuthorizeList> {
  return sendMessage('pri(authorize.toggle)', url);
}

export async function changeAuthorizationAll(
  connectValue: boolean,
  callback: (data: AuthUrls) => void,
): Promise<boolean> {
  return sendMessage('pri(authorize.changeSiteAll)', { connectValue }, callback);
}

export async function changeAuthorization(
  connectValue: boolean,
  url: string,
  callback: (data: AuthUrls) => void,
): Promise<boolean> {
  return sendMessage('pri(authorize.changeSite)', { url, connectValue }, callback);
}

export async function changeAuthorizationPerAccount(
  address: string,
  connectValue: boolean,
  url: string,
  callback: (data: AuthUrls) => void,
): Promise<boolean> {
  return sendMessage('pri(authorize.changeSitePerAccount)', { address, url, connectValue }, callback);
}

export async function changeAuthorizationPerSite(request: RequestAuthorizationPerSite): Promise<boolean> {
  return sendMessage('pri(authorize.changeSitePerSite)', request);
}

export async function changeAuthorizationBlock(request: RequestAuthorizationBlock): Promise<boolean> {
  return sendMessage('pri(authorize.changeSiteBlock)', request);
}

export async function forgetSite(url: string, callback: (data: AuthUrls) => void): Promise<boolean> {
  return sendMessage('pri(authorize.forgetSite)', { url }, callback);
}

export async function forgetAllSite(callback: (data: AuthUrls) => void): Promise<boolean> {
  return sendMessage('pri(authorize.forgetAllSite)', null, callback);
}

export async function subscribeMetadataRequests(cb: (accounts: MetadataRequest[]) => void): Promise<boolean> {
  return sendMessage('pri(metadata.requests)', null, cb);
}

export async function subscribeSigningRequests(cb: (accounts: SigningRequest[]) => void): Promise<boolean> {
  return sendMessage('pri(signing.requests)', null, cb);
}

export async function validateSeed(suri: string, type?: KeypairType): Promise<{ address: string; suri: string }> {
  return sendMessage('pri(seed.validate)', { suri, type });
}

export async function validateSeedV2(suri: string, types: Array<KeypairType>): Promise<ResponseSeedValidateV2> {
  return sendMessage('pri(seed.validateV2)', { suri, types });
}

export async function validateMetamaskPrivateKeyV2(
  suri: string,
  types: Array<KeypairType>,
): Promise<ResponsePrivateKeyValidateV2> {
  return sendMessage('pri(privateKey.validateV2)', { suri, types });
}

export async function validateDerivationPath(
  parentAddress: string,
  suri: string,
  parentPassword: string,
): Promise<ResponseDeriveValidate> {
  return sendMessage('pri(derivation.validate)', { parentAddress, parentPassword, suri });
}

export async function deriveAccount(
  parentAddress: string,
  suri: string,
  parentPassword: string,
  name: string,
  password: string,
  genesisHash: string | null,
): Promise<boolean> {
  return sendMessage('pri(derivation.create)', { genesisHash, name, parentAddress, parentPassword, password, suri });
}

export async function deriveAccountV2(
  parentAddress: string,
  suri: string,
  parentPassword: string,
  name: string,
  password: string,
  genesisHash: string | null,
  isAllowed: boolean,
): Promise<boolean> {
  return sendMessage('pri(derivation.createV2)', {
    genesisHash,
    name,
    parentAddress,
    parentPassword,
    password,
    suri,
    isAllowed,
  });
}

export async function windowOpen(path: AllowedPath): Promise<boolean> {
  return sendMessage('pri(window.open)', path);
}

export async function jsonGetAccountInfo(json: KeyringPair$Json): Promise<ResponseJsonGetAccountInfo> {
  return sendMessage('pri(json.account.info)', json);
}

export async function jsonRestore(file: KeyringPair$Json, password: string, address: string): Promise<void> {
  return sendMessage('pri(json.restore)', { file, password, address });
}

export async function batchRestore(file: KeyringPairs$Json, password: string, address: string): Promise<void> {
  return sendMessage('pri(json.batchRestore)', { file, password, address });
}

export async function jsonRestoreV2(
  file: KeyringPair$Json,
  password: string,
  address: string,
  isAllowed: boolean,
): Promise<void> {
  return sendMessage('pri(json.restoreV2)', { file, password, address, isAllowed });
}

export async function batchRestoreV2(
  file: KeyringPairs$Json,
  password: string,
  accountsInfo: ResponseJsonGetAccountInfo[],
  isAllowed: boolean,
): Promise<void> {
  return sendMessage('pri(json.batchRestoreV2)', { file, password, accountsInfo, isAllowed });
}

export async function setNotification(notification: string): Promise<boolean> {
  return sendMessage('pri(settings.notification)', notification);
}

export async function getPrice(): Promise<PriceJson> {
  return sendMessage('pri(price.getPrice)', null);
}

export async function subscribePrice(
  request: RequestSubscribePrice,
  callback: (priceData: PriceJson) => void,
): Promise<PriceJson> {
  return sendMessage('pri(price.getSubscription)', request, callback);
}

export async function getBalance(): Promise<BalanceJson> {
  return sendMessage('pri(balance.getBalance)', null);
}

export async function subscribeBalance(
  request: RequestSubscribeBalance,
  callback: (balanceData: BalanceJson) => void,
): Promise<BalanceJson> {
  return sendMessage('pri(balance.getSubscription)', request, callback);
}

export async function getCrowdloan(): Promise<CrowdloanJson> {
  return sendMessage('pri(crowdloan.getCrowdloan)', null);
}

export async function subscribeCrowdloan(
  request: RequestSubscribeCrowdloan,
  callback: (crowdloanData: CrowdloanJson) => void,
): Promise<CrowdloanJson> {
  return sendMessage('pri(crowdloan.getSubscription)', request, callback);
}

export async function subscribeChainRegistry(
  callback: (map: Record<string, ChainRegistry>) => void,
): Promise<Record<string, ChainRegistry>> {
  return sendMessage('pri(chainRegistry.getSubscription)', null, callback);
}

export async function subscribeHistory(
  callback: (historyMap: Record<string, TransactionHistoryItemType[]>) => void,
): Promise<Record<string, TransactionHistoryItemType[]>> {
  return sendMessage('pri(transaction.history.getSubscription)', null, callback);
}

export async function updateTransactionHistory(
  address: string,
  networkKey: string,
  item: TransactionHistoryItemType,
  callback: (items: TransactionHistoryItemType[]) => void,
): Promise<boolean> {
  return sendMessage('pri(transaction.history.add)', { address, networkKey, item }, callback);
}

export async function getNft(account: string): Promise<NftJson> {
  // @ts-ignore
  return sendMessage('pri(nft.getNft)', account);
}

export async function subscribeNft(
  request: RequestSubscribeNft,
  callback: (nftData: NftJson) => void,
): Promise<NftJson> {
  return sendMessage('pri(nft.getSubscription)', request, callback);
}

export async function subscribeNftCollection(callback: (data: NftCollectionJson) => void): Promise<NftCollectionJson> {
  return sendMessage('pri(nftCollection.getSubscription)', null, callback);
}

export async function getStaking(account: string): Promise<StakingJson> {
  // @ts-ignore
  return sendMessage('pri(staking.getStaking)', account);
}

export async function subscribeStaking(
  request: RequestSubscribeStaking,
  callback: (stakingData: StakingJson) => void,
): Promise<StakingJson> {
  return sendMessage('pri(staking.getSubscription)', request, callback);
}

export async function getStakingReward(): Promise<StakingRewardJson> {
  return sendMessage('pri(stakingReward.getStakingReward)');
}

export async function subscribeStakingReward(
  request: RequestSubscribeStakingReward,
  callback: (stakingRewardData: StakingRewardJson) => void,
): Promise<StakingRewardJson> {
  return sendMessage('pri(stakingReward.getSubscription)', request, callback);
}

export async function nftForceUpdate(request: RequestNftForceUpdate): Promise<boolean> {
  return sendMessage('pri(nft.forceUpdate)', request);
}

export async function getNftTransfer(): Promise<NftTransferExtra> {
  return sendMessage('pri(nftTransfer.getNftTransfer)', null);
}

export async function subscribeNftTransfer(callback: (data: NftTransferExtra) => void): Promise<NftTransferExtra> {
  return sendMessage('pri(nftTransfer.getSubscription)', null, callback);
}

export async function setNftTransfer(request: NftTransferExtra): Promise<boolean> {
  return sendMessage('pri(nftTransfer.setNftTransfer)', request);
}

export async function checkTransfer(request: RequestCheckTransfer): Promise<ResponseCheckTransfer> {
  return sendMessage('pri(accounts.checkTransfer)', request);
}

export async function checkCrossChainTransfer(
  request: RequestCheckCrossChainTransfer,
): Promise<ResponseCheckCrossChainTransfer> {
  return sendMessage('pri(accounts.checkCrossChainTransfer)', request);
}

export async function makeTransfer(
  request: RequestTransfer,
  callback: (data: ResponseTransfer) => void,
): Promise<Array<TransferError>> {
  return sendMessage('pri(accounts.transfer)', request, callback);
}

export async function makeCrossChainTransfer(
  request: RequestCrossChainTransfer,
  callback: (data: ResponseTransfer) => void,
): Promise<Array<TransferError>> {
  return sendMessage('pri(accounts.crossChainTransfer)', request, callback);
}

export async function evmNftGetTransaction(request: EvmNftTransactionRequest): Promise<EvmNftTransaction> {
  return sendMessage('pri(evmNft.getTransaction)', request);
}

export async function evmNftSubmitTransaction(
  request: EvmNftSubmitTransaction,
  callback: (data: NftTransactionResponse) => void,
): Promise<NftTransactionResponse> {
  return sendMessage('pri(evmNft.submitTransaction)', request, callback);
}

export async function subscribeNetworkMap(
  callback: (data: Record<string, NetworkJson>) => void,
): Promise<Record<string, NetworkJson>> {
  return sendMessage('pri(networkMap.getSubscription)', null, callback);
}

export async function upsertNetworkMap(data: NetworkJson): Promise<boolean> {
  return sendMessage('pri(networkMap.upsert)', data);
}

export async function getNetworkMap(): Promise<Record<string, NetworkJson>> {
  return sendMessage('pri(networkMap.getNetworkMap)');
}

export async function removeNetworkMap(networkKey: string): Promise<boolean> {
  return sendMessage('pri(networkMap.removeOne)', networkKey);
}

export async function disableNetworkMap(networkKey: string): Promise<DisableNetworkResponse> {
  return sendMessage('pri(networkMap.disableOne)', networkKey);
}

export async function enableNetworkMap(networkKey: string): Promise<boolean> {
  return sendMessage('pri(networkMap.enableOne)', networkKey);
}

export async function enableNetworks(targetKeys: string[]): Promise<boolean> {
  return sendMessage('pri(networkMap.enableMany)', targetKeys);
}

export async function validateNetwork(
  provider: string,
  isEthereum: boolean,
  existedNetwork?: NetworkJson,
): Promise<ValidateNetworkResponse> {
  return sendMessage('pri(apiMap.validate)', { provider, isEthereum, existedNetwork });
}

export async function disableAllNetwork(): Promise<boolean> {
  return sendMessage('pri(networkMap.disableAll)', null);
}

export async function enableAllNetwork(): Promise<boolean> {
  return sendMessage('pri(networkMap.enableAll)', null);
}

export async function resetDefaultNetwork(): Promise<boolean> {
  return sendMessage('pri(networkMap.resetDefault)', null);
}

export async function subscribeEvmToken(callback: (data: EvmTokenJson) => void): Promise<EvmTokenJson> {
  return sendMessage('pri(evmTokenState.getSubscription)', null, callback);
}

export async function getEvmTokenState(): Promise<EvmTokenJson> {
  return sendMessage('pri(evmTokenState.getEvmTokenState)', null);
}

export async function upsertEvmToken(data: CustomEvmToken): Promise<boolean> {
  return sendMessage('pri(evmTokenState.upsertEvmTokenState)', data);
}

export async function deleteEvmTokens(data: DeleteEvmTokenParams[]) {
  return sendMessage('pri(evmTokenState.deleteMany)', data);
}

export async function validateEvmToken(data: ValidateEvmTokenRequest) {
  return sendMessage('pri(evmTokenState.validateEvmToken)', data);
}

export async function transferCheckReferenceCount(request: RequestTransferCheckReferenceCount): Promise<boolean> {
  return sendMessage('pri(transfer.checkReferenceCount)', request);
}

export async function transferCheckSupporting(
  request: RequestTransferCheckSupporting,
): Promise<SupportTransferResponse> {
  return sendMessage('pri(transfer.checkSupporting)', request);
}

export async function transferGetExistentialDeposit(request: RequestTransferExistentialDeposit): Promise<string> {
  return sendMessage('pri(transfer.getExistentialDeposit)', request);
}

export async function cancelSubscription(request: string): Promise<boolean> {
  return sendMessage('pri(subscription.cancel)', request);
}

export async function subscribeFreeBalance(
  request: RequestFreeBalance,
  callback: (balance: string) => void,
): Promise<string> {
  return sendMessage('pri(freeBalance.subscribe)', request, callback);
}

export async function substrateNftGetTransaction(
  request: SubstrateNftTransactionRequest,
): Promise<SubstrateNftTransaction> {
  return sendMessage('pri(substrateNft.getTransaction)', request);
}

export async function substrateNftSubmitTransaction(
  request: SubstrateNftSubmitTransaction,
  callback: (data: NftTransactionResponse) => void,
): Promise<NftTransactionResponse> {
  return sendMessage('pri(substrateNft.submitTransaction)', request, callback);
}

export async function recoverDotSamaApi(request: string): Promise<boolean> {
  return sendMessage('pri(networkMap.recoverDotSama)', request);
}

export async function subscribeConfirmations(
  callback: (data: ConfirmationsQueue) => void,
): Promise<ConfirmationsQueue> {
  return sendMessage('pri(confirmations.subscribe)', null, callback);
}

export async function completeConfirmation<CT extends ConfirmationType>(
  type: CT,
  payload: ConfirmationDefinitions[CT][1],
): Promise<boolean> {
  return sendMessage('pri(confirmations.complete)', { [type]: payload });
}

export async function getBondingOptions(networkKey: string, address: string): Promise<BondingOptionInfo> {
  return sendMessage('pri(bonding.getBondingOptions)', { networkKey, address });
}

export async function getChainBondingBasics(
  networkJsons: NetworkJson[],
  callback: (data: Record<string, ChainBondingBasics>) => void,
): Promise<Record<string, ChainBondingBasics>> {
  return sendMessage('pri(bonding.getChainBondingBasics)', networkJsons, callback);
}

export async function submitBonding(
  bondingSubmitParams: BondingSubmitParams,
  callback: (data: BasicTxResponse) => void,
): Promise<BasicTxResponse> {
  return sendMessage('pri(bonding.submitTransaction)', bondingSubmitParams, callback);
}

export async function getBondingTxInfo(bondingSubmitParams: BondingSubmitParams): Promise<BasicTxInfo> {
  return sendMessage('pri(bonding.txInfo)', bondingSubmitParams);
}

export async function getUnbondingTxInfo(unbondingSubmitParams: UnbondingSubmitParams): Promise<BasicTxInfo> {
  return sendMessage('pri(unbonding.txInfo)', unbondingSubmitParams);
}

export async function submitUnbonding(
  unbondingSubmitParams: UnbondingSubmitParams,
  callback: (data: BasicTxResponse) => void,
): Promise<BasicTxResponse> {
  return sendMessage('pri(unbonding.submitTransaction)', unbondingSubmitParams, callback);
}

export async function subscribeStakeUnlockingInfo(
  callback: (data: StakeUnlockingJson) => void,
): Promise<StakeUnlockingJson> {
  return sendMessage('pri(unbonding.subscribeUnlockingInfo)', null, callback);
}

export async function getStakeWithdrawalTxInfo(params: StakeWithdrawalParams): Promise<BasicTxInfo> {
  return sendMessage('pri(unbonding.withdrawalTxInfo)', params);
}

export async function submitStakeWithdrawal(
  params: StakeWithdrawalParams,
  callback: (data: BasicTxResponse) => void,
): Promise<BasicTxResponse> {
  return sendMessage('pri(unbonding.submitWithdrawal)', params, callback);
}

export async function getStakeClaimRewardTxInfo(params: StakeClaimRewardParams): Promise<BasicTxInfo> {
  return sendMessage('pri(staking.claimRewardTxInfo)', params);
}

export async function submitStakeClaimReward(
  params: StakeClaimRewardParams,
  callback: (data: BasicTxResponse) => void,
): Promise<BasicTxResponse> {
  return sendMessage('pri(staking.submitClaimReward)', params, callback);
}

export async function getStakeDelegationInfo(params: StakeDelegationRequest): Promise<DelegationItem[]> {
  return sendMessage('pri(staking.delegationInfo)', params);
}

export async function parseEVMTransactionInput(
  request: RequestParseEVMTransactionInput,
): Promise<ResponseParseEVMTransactionInput> {
  return sendMessage('pri(evm.transaction.parse.input)', request);
}

export async function subscribeAuthUrl(callback: (data: AuthUrls) => void): Promise<AuthUrls> {
  return sendMessage('pri(authorize.subscribe)', null, callback);
}

export async function initCronAndSubscription(
  request: RequestInitCronAndSubscription,
): Promise<ActiveCronAndSubscriptionMap> {
  // @ts-ignore
  return sendMessage('mobile(cronAndSubscription.init)', request);
}

export async function subscribeActiveCronAndSubscriptionServiceMap(
  callback: (data: ActiveCronAndSubscriptionMap) => void,
): Promise<ActiveCronAndSubscriptionMap> {
  // @ts-ignore
  return sendMessage('mobile(cronAndSubscription.activeService.subscribe)', null, callback);
}

export async function startCronServices(request: CronServiceType[]): Promise<void> {
  // @ts-ignore
  return sendMessage('mobile(cron.start)', request);
}

export async function stopCronServices(request: CronServiceType[]): Promise<void> {
  // @ts-ignore
  return sendMessage('mobile(cron.stop)', request);
}

export async function restartCronServices(request: CronServiceType[]): Promise<void> {
  // @ts-ignore
  return sendMessage('mobile(cron.restart)', request);
}

export async function startSubscriptionServices(request: SubscriptionServiceType[]): Promise<void> {
  // @ts-ignore
  return sendMessage('mobile(subscription.start)', request);
}

export async function stopSubscriptionServices(request: SubscriptionServiceType[]): Promise<void> {
  // @ts-ignore
  return sendMessage('mobile(subscription.stop)', request);
}

export async function restartSubscriptionServices(request: SubscriptionServiceType[]): Promise<void> {
  // @ts-ignore
  return sendMessage('mobile(subscription.restart)', request);
}
