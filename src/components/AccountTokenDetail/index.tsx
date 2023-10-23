import React from 'react';
import { Avatar, Number, Typography } from 'components/design-system-ui';
import { View } from 'react-native';
import { FontMedium, FontSemiBold } from 'styles/sharedStyles';
import i18n from 'utils/i18n/i18n';
import { toShort } from 'utils/index';
import { useSubWalletTheme } from 'hooks/useSubWalletTheme';
import createStylesheet from './style';
import { ItemType } from 'screens/Home/Crypto/TokenDetailModal';

interface Props {
  items: ItemType[];
}

export const AccountTokenDetail = ({ items }: Props) => {
  const theme = useSubWalletTheme().swThemes;
  const _style = createStylesheet(theme);
  return (
    <View style={_style.container}>
      <Avatar value={'5CP5nSE9cCb9m6Wnat5tUAYpr92c5Ft8TXMJmxdCKdWbbTrJ'} size={24} />
      <View style={{ flex: 1 }}>
        <View style={[_style.row, { paddingBottom: theme.paddingXXS }]}>
          <View style={_style.accountDetailInfo}>
            <Typography.Text style={_style.accountDetailLabel} ellipsis>
              {i18n.common.allAccounts}
            </Typography.Text>

            <Typography.Text style={_style.accountDetailValue}>
              {`(${toShort('5CP5nSE9cCb9m6Wnat5tUAYpr92c5Ft8TXMJmxdCKdWbbTrJ', 4, 4)})`}
            </Typography.Text>
          </View>
          <Number
            size={14}
            value={'100'}
            decimal={0}
            suffix={'DOT'}
            decimalOpacity={0.85}
            unitOpacity={0.85}
            intOpacity={0.85}
          />
        </View>
        {items.map(item => (
          <View key={item.key} style={_style.row}>
            <Typography.Text size={'sm'} style={{ ...FontSemiBold, color: theme.colorTextLight4 }}>
              {item.label}
            </Typography.Text>

            <Number
              style={_style.value}
              textStyle={{ ...FontMedium }}
              decimal={0}
              decimalOpacity={0.45}
              intOpacity={0.45}
              size={12}
              suffix={'DOT'}
              unitOpacity={0.45}
              value={item.value}
            />
          </View>
        ))}
      </View>
    </View>
  );
};
