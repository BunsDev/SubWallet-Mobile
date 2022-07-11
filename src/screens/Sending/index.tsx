import React, { createRef, useCallback, useEffect, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { RootNavigationProps, RootRouteProps } from 'types/routes';
import { Keyboard, ScrollView, StyleProp, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { InputAddress } from 'components/InputAddress';
import { FontMedium, MarginBottomForSubmitButton, ScrollViewStyle, sharedStyles } from 'styles/sharedStyles';
import { getEthereumChains, getNetworkLogo } from 'utils/index';
import { useSelector } from 'react-redux';
import { RootState } from 'stores/index';
import { ColorMap } from 'styles/color';
import { SubmitButton } from 'components/SubmitButton';
import useFreeBalance from 'hooks/screen/useFreeBalance';
import FormatBalance from 'components/FormatBalance';
import { BalanceFormatType } from 'types/ui-types';
import {
  getAuthTransactionFeeInfo,
  getBalanceFormat,
  getMainTokenInfo,
  getMaxTransferAndNoFees,
  isContainGasRequiredExceedsError,
} from 'screens/Sending/utils';
import BigN from 'bignumber.js';
import { InputBalance } from 'components/InputBalance';
import { BN_TEN } from 'utils/chainBalances';
import { BalanceToUsd } from 'components/BalanceToUsd';
import {
  checkTransfer,
  transferCheckReferenceCount,
  transferCheckSupporting,
  transferGetExistentialDeposit,
} from '../../messaging';
import { ContainerWithSubHeader } from 'components/ContainerWithSubHeader';
import { Confirmation } from 'screens/Sending/Confirmation';
import { TransferResultType } from 'types/tx';
import { SendFundResult } from 'screens/Sending/SendFundResult';
import { checkAddress } from '@polkadot/phishing';
import { ResponseCheckTransfer } from '@subwallet/extension-base/background/KoniTypes';
import { Warning } from 'components/Warning';
import { isEthereumAddress } from '@polkadot/util-crypto';
import i18n from 'utils/i18n/i18n';
import { QrScannerScreen } from 'screens/QrScannerScreen';

const NetworkLogoWrapperStyle: StyleProp<any> = {
  borderRadius: 20,
  width: 40,
  height: 40,
  borderWidth: 2,
  borderStyle: 'solid',
  borderColor: ColorMap.secondary,
  justifyContent: 'center',
  alignItems: 'center',
  marginTop: 48,
  marginBottom: 16,
};

const WarningStyle: StyleProp<any> = {
  marginBottom: 8,
};

function getUseMaxButtonTextStyle(disabled: boolean) {
  return {
    color: disabled ? ColorMap.disabled : ColorMap.primary,
    ...sharedStyles.mainText,
    ...FontMedium,
  };
}
const ViewStep = {
  SEND_FUND: 1,
  CONFIRMATION: 2,
};

export const SendFund = () => {
  const navigation = useNavigation<RootNavigationProps>();
  const route = useRoute<RootRouteProps>();
  const data = route.params;
  const {
    currentNetwork: { networkKey },
    accounts: { currentAccountAddress },
    chainRegistry,
    price: { tokenPriceMap },
    networkMap,
  } = useSelector((state: RootState) => state);
  // @ts-ignore
  const selectedNetworkKey = data ? data.selectedNetwork : networkKey;
  const [[receiveAddress, currentReceiveAddress], setReceiveAddress] = useState<[string | null, string]>([null, '']);
  const [rawAmount, setRawAmount] = useState<string | undefined>(undefined);
  const selectedTokenMap = chainRegistry[selectedNetworkKey].tokenMap;
  const selectedMainToken = Object.values(selectedTokenMap).find(val => val.isMainToken);
  const selectedToken = selectedMainToken ? selectedMainToken.name : Object.keys(selectedTokenMap)[0];
  const senderFreeBalance = useFreeBalance(selectedNetworkKey, currentAccountAddress, selectedToken);
  const balanceFormat: BalanceFormatType = getBalanceFormat(selectedNetworkKey, selectedToken, chainRegistry);
  const tokenPrice = tokenPriceMap[selectedToken.toLowerCase()] || 0;
  const reformatAmount = new BigN(rawAmount || '0').div(BN_TEN.pow(balanceFormat[0]));
  const amountToUsd = reformatAmount.multipliedBy(new BigN(tokenPrice));
  const [isGasRequiredExceedsError, setGasRequiredExceedsError] = useState<boolean>(false);
  const [recipientPhish, setRecipientPhish] = useState<string | null>(null);
  const [existentialDeposit, setExistentialDeposit] = useState<string>('0');
  const [[fee, feeSymbol], setFeeInfo] = useState<[string | null, string | null | undefined]>([null, null]);
  const mainTokenInfo = getMainTokenInfo(selectedNetworkKey, chainRegistry);
  const feeDecimal: number | null = feeSymbol
    ? feeSymbol === selectedToken
      ? balanceFormat[0]
      : getBalanceFormat(selectedNetworkKey, feeSymbol, chainRegistry)[0]
    : null;
  const [reference, setReference] = useState<boolean | null>(null);
  const [[isSupportTransfer, isSupportTransferAll], setTransferSupport] = useState<[boolean, boolean] | [null, null]>([
    null,
    null,
  ]);
  const isSameAddress = !!receiveAddress && !!currentAccountAddress && receiveAddress === currentAccountAddress;
  const canToggleAll = !!isSupportTransferAll && !!senderFreeBalance && !reference && !!receiveAddress;
  const amountGtAvailableBalance =
    !!rawAmount && !!senderFreeBalance && new BigN(rawAmount).gt(new BigN(senderFreeBalance));
  const [currentViewStep, setCurrentStep] = useState(ViewStep.SEND_FUND);
  const [txResult, setTxResult] = useState<TransferResultType>({ isShowTxResult: false, isTxSuccess: false });
  const { isShowTxResult } = txResult;
  const inputBalanceRef = createRef();
  const inputAddressRef = createRef();
  const amount = Math.floor(Number(rawAmount));
  const ethereumChains = getEthereumChains(networkMap);
  const isNotSameAddressAndTokenType =
    (isEthereumAddress(currentAccountAddress) && !ethereumChains.includes(selectedNetworkKey)) ||
    (!isEthereumAddress(currentAccountAddress) && ethereumChains.includes(selectedNetworkKey));

  const receiveAddressType = isEthereumAddress(receiveAddress || '') ? 'Ethereum' : 'Substrate';
  const senderAddressType = isEthereumAddress(currentAccountAddress || '') ? 'Ethereum' : 'Substrate';
  const [isShowQrModalVisible, setShowQrModalVisible] = useState<boolean>(false);
  const isNotSameAddressType = !!receiveAddress && senderAddressType !== receiveAddressType;

  const canMakeTransfer =
    !!rawAmount &&
    isSupportTransfer &&
    !isGasRequiredExceedsError &&
    !recipientPhish &&
    !!receiveAddress &&
    !isSameAddress &&
    !isNotSameAddressAndTokenType &&
    !isNotSameAddressType &&
    !amountGtAvailableBalance;

  const _doCheckTransfer = useCallback(
    (isConfirmTransferAll: boolean, thenCb: (rs: ResponseCheckTransfer) => void, catchCb: (rs: Error) => void) => {
      if (receiveAddress) {
        checkTransfer({
          networkKey: selectedNetworkKey,
          from: currentAccountAddress,
          to: receiveAddress,
          transferAll: canToggleAll && isConfirmTransferAll,
          token: selectedToken,
          value: amount.toString(),
        })
          .then(thenCb)
          .catch(catchCb);
      }
    },
    [amount, canToggleAll, currentAccountAddress, selectedNetworkKey, receiveAddress, selectedToken],
  );

  useEffect(() => {
    let isSync = true;

    if (receiveAddress) {
      _doCheckTransfer(
        false,
        rs => {
          if (isSync) {
            setFeeInfo([rs.estimateFee && rs.estimateFee !== '0' ? rs.estimateFee : null, rs.feeSymbol]);
            setGasRequiredExceedsError(false);
          }
        },
        (e: Error) => {
          if (isContainGasRequiredExceedsError(e.message) && isSync) {
            setGasRequiredExceedsError(true);
          } else {
            if (isSync) {
              setGasRequiredExceedsError(false);
            }

            console.log('There is problem when checkTransfer', e);
          }
        },
      );
    }

    return () => {
      isSync = false;
    };
  }, [_doCheckTransfer, canToggleAll, currentAccountAddress, rawAmount, receiveAddress, selectedToken]);

  useEffect(() => {
    let isSync = true;

    transferCheckReferenceCount({ address: currentAccountAddress, networkKey: selectedNetworkKey })
      .then(res => {
        if (isSync) {
          setReference(res);
        }
      })
      .catch(e => console.log(e));

    return () => {
      isSync = false;
      setReference(null);
    };
  }, [currentAccountAddress, selectedNetworkKey]);

  useEffect(() => {
    let isSync = true;

    transferGetExistentialDeposit({ networkKey: selectedNetworkKey, token: selectedToken })
      .then(rs => {
        if (isSync) {
          setExistentialDeposit(rs);
        }
      })
      .catch(e => console.log('There is problem when transferGetExistentialDeposit', e));

    return () => {
      isSync = false;
      setExistentialDeposit('0');
    };
  }, [selectedNetworkKey, selectedToken]);

  useEffect(() => {
    let isSync = true;

    transferCheckSupporting({ networkKey: selectedNetworkKey, token: selectedToken })
      .then(res => {
        if (isSync) {
          setTransferSupport([res.supportTransfer, res.supportTransferAll]);
        }
      })
      .catch(e => console.log(e));

    return () => {
      isSync = false;
      setTransferSupport([null, null]);
    };
  }, [selectedNetworkKey, selectedToken]);

  useEffect(() => {
    let isSync = true;

    if (receiveAddress) {
      checkAddress(receiveAddress)
        .then(v => {
          if (isSync) {
            setRecipientPhish(v);
          }
        })
        .catch(e => console.log('e', e));
    }

    return () => {
      isSync = false;
      setRecipientPhish(null);
    };
  }, [receiveAddress]);

  const onChangeAmount = (val?: string) => {
    setRawAmount(val);
  };

  const onPressBack = () => {
    if (currentViewStep === ViewStep.CONFIRMATION) {
      setCurrentStep(ViewStep.SEND_FUND);
    } else {
      navigation.goBack();
    }
  };

  const onChangeReceiverAddress = (receiverAddress: string | null, currentTextValue: string) => {
    setReceiveAddress([receiverAddress, currentTextValue]);
  };

  const _onChangeResult = (curTxResult: TransferResultType) => {
    setTxResult(curTxResult);
  };

  const _onResend = useCallback(() => {
    setTxResult({
      isTxSuccess: false,
      isShowTxResult: false,
      txError: undefined,
    });
    setReceiveAddress([null, '']);
    setCurrentStep(ViewStep.SEND_FUND);
  }, []);

  const onUpdateInputBalance = () => {
    _doCheckTransfer(
      true,
      rs => {
        const [curMaxTransfer] = getMaxTransferAndNoFees(
          rs.estimateFee || null,
          rs.feeSymbol,
          selectedToken,
          mainTokenInfo.symbol,
          senderFreeBalance,
          existentialDeposit,
        );
        if (inputBalanceRef && inputBalanceRef.current) {
          // @ts-ignore
          inputBalanceRef.current.onChange(curMaxTransfer.toString());
        }
      },
      err => console.log('There is problem when checkTransfer', err),
    );
  };

  const onUpdateInputAddress = (text: string) => {
    if (inputAddressRef && inputAddressRef.current) {
      // @ts-ignore
      inputAddressRef.current.onChange(text);
    }
  };

  return (
    <>
      {!isShowTxResult ? (
        <ContainerWithSubHeader onPressBack={onPressBack} title={'Send Fund'}>
          <>
            {currentViewStep === ViewStep.SEND_FUND && (
              <TouchableWithoutFeedback
                onPress={() => {
                  Keyboard.dismiss();
                }}>
                <View style={{ ...sharedStyles.layoutContainer }}>
                  <ScrollView style={{ ...ScrollViewStyle }}>
                    <View style={{ alignItems: 'center', flex: 1 }}>
                      <InputAddress
                        ref={inputAddressRef}
                        onPressQrButton={() => setShowQrModalVisible(true)}
                        containerStyle={{ marginBottom: 8 }}
                        label={'Sent to address'}
                        onChange={onChangeReceiverAddress}
                      />

                      {isSameAddress && (
                        <Warning isDanger style={WarningStyle} message={i18n.warningMessage.isNotSameAddress} />
                      )}

                      {!!recipientPhish && (
                        <Warning
                          style={WarningStyle}
                          isDanger
                          message={`${i18n.warningMessage.recipientPhish} ${recipientPhish}`}
                        />
                      )}

                      {isNotSameAddressType && (
                        <Warning
                          style={WarningStyle}
                          isDanger
                          message={i18n.warningMessage.recipientAddressMustBe + senderAddressType + ' type'}
                        />
                      )}

                      <View style={NetworkLogoWrapperStyle}>{getNetworkLogo(selectedNetworkKey, 34)}</View>
                      <InputBalance
                        placeholder={'0'}
                        maxValue={senderFreeBalance}
                        onChange={onChangeAmount}
                        decimals={balanceFormat[0]}
                        ref={inputBalanceRef}
                        siSymbol={selectedToken}
                      />
                      {reformatAmount && <BalanceToUsd amountToUsd={amountToUsd} isShowBalance={true} />}
                    </View>
                  </ScrollView>

                  <View>
                    <View
                      style={{
                        width: '100%',
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        paddingBottom: 24,
                      }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ color: ColorMap.light, ...sharedStyles.mainText, ...FontMedium }}>
                          Balance:{' '}
                        </Text>
                        <FormatBalance format={balanceFormat} value={senderFreeBalance} />
                      </View>

                      <TouchableOpacity onPress={() => onUpdateInputBalance()} disabled={!canToggleAll}>
                        <Text style={getUseMaxButtonTextStyle(!canToggleAll)}>Use Max</Text>
                      </TouchableOpacity>
                    </View>

                    <SubmitButton
                      disabled={!canMakeTransfer}
                      title={'Continue'}
                      style={{ width: '100%', ...MarginBottomForSubmitButton }}
                      onPress={() => setCurrentStep(ViewStep.CONFIRMATION)}
                    />
                  </View>

                  <QrScannerScreen
                    qrModalVisible={isShowQrModalVisible}
                    onPressCancel={() => setShowQrModalVisible(false)}
                    onChangeAddress={text => onUpdateInputAddress(text)}
                  />
                </View>
              </TouchableWithoutFeedback>
            )}

            {currentViewStep === ViewStep.CONFIRMATION && (
              <Confirmation
                balanceFormat={balanceFormat}
                requestPayload={{
                  networkKey: selectedNetworkKey,
                  from: currentAccountAddress,
                  to: currentReceiveAddress,
                  transferAll: false,
                  token: selectedToken,
                  value: amount.toString(),
                }}
                onChangeResult={_onChangeResult}
                feeInfo={getAuthTransactionFeeInfo(
                  fee,
                  feeDecimal,
                  feeSymbol,
                  mainTokenInfo,
                  chainRegistry[selectedNetworkKey].tokenMap,
                )}
              />
            )}
          </>
        </ContainerWithSubHeader>
      ) : (
        <SendFundResult networkKey={selectedNetworkKey} txResult={txResult} onResend={_onResend} />
      )}
    </>
  );
};