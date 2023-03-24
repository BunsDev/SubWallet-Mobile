import { _ChainAsset } from '@subwallet/chain-list/types';
import { AssetSetting } from '@subwallet/extension-base/background/KoniTypes';
import { _ChainState } from '@subwallet/extension-base/services/chain-service/types';
import { _isAssetFungibleToken } from '@subwallet/extension-base/services/chain-service/utils';

export function isAvailableTokenAsset(
  chainAsset: _ChainAsset,
  assetSettingMap: Record<string, AssetSetting>,
  chainStateMap: Record<string, _ChainState>,
  ledgerNetwork?: string,
): boolean {
  const assetSetting = assetSettingMap[chainAsset.slug];

  const isAssetVisible = assetSetting && assetSetting.visible;
  const isAssetFungible = _isAssetFungibleToken(chainAsset);
  const isAssetActive = chainStateMap[chainAsset.originChain].active;
  const isValidLedger = ledgerNetwork ? ledgerNetwork === chainAsset.originChain : true; // Check if have ledger network

  return isAssetVisible && isAssetFungible && isAssetActive && isValidLedger;
}
