// Copyright 2019-2022 @polkadot/extension-ui authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Compact } from '@polkadot/types';
import React from 'react';

import { BN, BN_ZERO, formatBalance } from '@polkadot/util';
import { BalanceFormatType } from 'types/ui-types';
import { StyleProp, Text, View } from 'react-native';
import { ColorMap } from 'styles/color';
import {FontMedium, sharedStyles} from 'styles/sharedStyles';

interface Props {
  children?: React.ReactNode;
  style?: object;
  format: BalanceFormatType; // decimals | symbol | symbol Alt
  isShort?: boolean;
  label?: React.ReactNode;
  labelPost?: LabelPost;
  value?: Compact<any> | BN | string | null | 'all';
  withCurrency?: boolean;
  withSi?: boolean;
}

const formatBalanceFrontPartStyle: StyleProp<any> = {};
const formatBalancePostfixStyle: StyleProp<any> = {};
const formatBalanceUnit: StyleProp<any> = {};
const formatBalanceStyle: StyleProp<any> = {};
const formatBalanceValueStyle: StyleProp<any> = {
  color: ColorMap.light,
  ...sharedStyles.mainText,
  ...FontMedium,
};

// for million, 2 * 3-grouping + comma
const M_LENGTH = 6 + 1;
const K_LENGTH = 3 + 1;

type LabelPost = string | React.ReactNode;

function createElement(
  prefix: string,
  postfix: string,
  unit: string,
  label: LabelPost = '',
  isShort = false,
): React.ReactNode {
  return (
    <>
      <Text style={formatBalanceFrontPartStyle}>
        {`${prefix}${isShort ? '' : '.'}`}
        {!isShort && <Text style={formatBalancePostfixStyle}>{`0000${postfix || ''}`.slice(-4)}</Text>}
      </Text>
      <Text style={formatBalanceUnit}> {unit}</Text>
      <Text>{label}</Text>
    </>
  );
}

function applyFormat(
  value: Compact<any> | BN | string,
  [decimals, symbol, symbolAlt]: BalanceFormatType,
  withCurrency = true,
  withSi?: boolean,
  _isShort?: boolean,
  labelPost?: LabelPost,
): React.ReactNode {
  const [prefix, postfix] = formatBalance(value, { decimals, forceUnit: '-', withSi: false }).split('.');
  const isShort = _isShort || (withSi && prefix.length >= K_LENGTH);
  const unitPost = withCurrency ? symbolAlt || symbol : '';

  if (prefix.length > M_LENGTH) {
    const [major, rest] = formatBalance(value, { decimals, withUnit: false }).split('.');
    const minor = rest.substr(0, 4);
    const unit = rest.substr(4);

    return (
      <>
        <Text style={formatBalanceFrontPartStyle}>
          {major}.<Text style={formatBalancePostfixStyle}>{minor}</Text>
        </Text>
        <Text style={formatBalanceUnit}>
          {unit}
          {unit ? unitPost : ` ${unitPost}`}
        </Text>
        {labelPost || ''}11
      </>
    );
  }

  return createElement(prefix, postfix, unitPost, labelPost, isShort);
}

function FormatBalance({
  children,
  style,
  format,
  isShort,
  label,
  labelPost,
  value,
  withCurrency,
  withSi,
}: Props): React.ReactElement<Props> {
  return (
    <View style={[formatBalanceStyle, style]}>
      {label && <Text>{<Text>{label}&nbsp;</Text>}</Text>}
      <Text style={formatBalanceValueStyle}>
        {value
          ? applyFormat(value, format, withCurrency, withSi, isShort, labelPost)
          : applyFormat(BN_ZERO, format, withCurrency, withSi, isShort, labelPost)}
      </Text>
      {children}
    </View>
  );
}

export default FormatBalance;