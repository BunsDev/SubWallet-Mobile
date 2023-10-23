import { ThemeTypes } from 'styles/themes';
import { StyleSheet } from 'react-native';
import { FontMedium } from 'styles/sharedStyles';

export default (theme: ThemeTypes) => {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      backgroundColor: theme.colorBgSecondary,
      borderRadius: theme.borderRadiusLG,
      padding: theme.paddingSM,
      gap: theme.paddingXS,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    value: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    textStyle: {
      fontSize: theme.fontSize,
      lineHeight: theme.fontSize * theme.lineHeight,
      ...FontMedium,
    },
    subTextStyle: {
      fontSize: theme.fontSize,
      lineHeight: theme.fontSize * theme.lineHeight,
      ...FontMedium,
    },
    accountDetailInfo: { alignItems: 'center', flexDirection: 'row' },
    accountDetailLabel: {
      maxWidth: 200,
      color: theme.colorWhite,
      paddingRight: theme.paddingXXS,
    },
    accountDetailValue: {
      color: theme.colorTextTertiary,
      paddingRight: theme.paddingXS,
    },
  });
};
