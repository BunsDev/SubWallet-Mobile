import React from 'react';
import { ScrollView } from 'react-native';
import { ChainBalance } from 'components/ChainBalance';
import { AccountInfoByNetwork } from 'types/ui-types';
import { BalanceInfo } from '../../../../types';

interface Props {
  networkKeys: string[];
  onPressChainItem: (info: AccountInfoByNetwork, balanceInfo: BalanceInfo) => void;
  networkBalanceMaps: Record<string, BalanceInfo>;
  accountInfoByNetworkMap: Record<string, AccountInfoByNetwork>;
}

export const ChainsTab = ({ networkKeys, onPressChainItem, networkBalanceMaps, accountInfoByNetworkMap }: Props) => {
  const renderChainBalanceItem = (networkKey: string) => {
    const info = accountInfoByNetworkMap[networkKey];
    const balanceInfo = networkBalanceMaps[networkKey];
    return (
      <ChainBalance
        key={info.key}
        accountInfo={info}
        isLoading={!balanceInfo}
        onPress={() => onPressChainItem(info, balanceInfo)}
        balanceInfo={balanceInfo}
      />
    );
  };

  return <ScrollView style={{ paddingTop: 8 }}>{networkKeys.map(key => renderChainBalanceItem(key))}</ScrollView>;
};