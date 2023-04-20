import { _ChainInfo } from '@subwallet/chain-list/types';
import { AmountData } from '@subwallet/extension-base/background/KoniTypes';
import { _getChainNativeTokenSlug } from '@subwallet/extension-base/services/chain-service/utils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from 'stores/index';
import { getFreeBalance } from '../../messaging';

const DEFAULT_BALANCE = { value: '0', symbol: '', decimals: 18 };

const useGetBalance = (chain = '', address = '', tokenSlug = '') => {
  const chainInfoMap = useSelector((state: RootState) => state.chainStore.chainInfoMap);
  const assetSettingMap = useSelector((state: RootState) => state.assetRegistry.assetSettingMap);

  const chainInfo = useMemo((): _ChainInfo | undefined => chainInfoMap[chain], [chainInfoMap, chain]);
  const nativeTokenSlug = useMemo(() => (chainInfo ? _getChainNativeTokenSlug(chainInfo) : undefined), [chainInfo]);

  const [nativeTokenBalance, setNativeTokenBalance] = useState<AmountData>(DEFAULT_BALANCE);
  const [tokenBalance, setTokenBalance] = useState<AmountData>(DEFAULT_BALANCE);
  const [isRefresh, setIsRefresh] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshBalance = useCallback(() => {
    setIsRefresh({});
  }, []);

  useEffect(() => {
    let cancel = false;

    setIsLoading(true);
    setTokenBalance(DEFAULT_BALANCE);

    if (address && chain) {
      const promiseList = [] as Promise<any>[];
      let tokenIsActive = nativeTokenSlug && assetSettingMap[nativeTokenSlug]?.visible;

      if (tokenSlug && tokenSlug !== nativeTokenSlug && !assetSettingMap[tokenSlug]?.visible) {
        tokenIsActive = false;
      }

      if (tokenIsActive) {
        promiseList.push(
          getFreeBalance({ address, networkKey: chain })
            .then(balance => {
              !cancel && setNativeTokenBalance(balance);
            })
            .catch((e: Error) => {
              !cancel && setError('Can not get balance');
              console.error(e);
            }),
        );

        if (tokenSlug && tokenSlug !== nativeTokenSlug) {
          promiseList.push(
            getFreeBalance({ address, networkKey: chain, token: tokenSlug })
              .then(balance => {
                !cancel && setTokenBalance(balance);
              })
              .catch((e: Error) => {
                !cancel && setError('Can not get balance');
                console.error(e);
              }),
          );
        }

        Promise.all(promiseList).finally(() => {
          !cancel && setIsLoading(false);
        });
      } else {
        !cancel && setIsLoading(false);
        !cancel && setError('Chain or token is inactive');
      }
    }

    return () => {
      cancel = true;
      setIsLoading(true);
      setError(null);
    };
  }, [address, chain, nativeTokenSlug, tokenSlug, isRefresh, assetSettingMap]);

  return { refreshBalance, tokenBalance, nativeTokenBalance, nativeTokenSlug, isLoading, error };
};

export default useGetBalance;
