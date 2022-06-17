import React from 'react';
import { FlatList, StyleProp, View } from 'react-native';
import { SubScreenContainer } from 'components/SubScreenContainer';
import { useNavigation } from '@react-navigation/native';
import { Account } from 'components/Account';
import { useSelector } from 'react-redux';
import { RootState } from 'stores/index';
import { IconButton } from 'components/IconButton';
import { DotsThree } from 'phosphor-react-native';
import { useSubWalletTheme } from 'hooks/useSubWalletTheme';
import { Warning } from 'components/Warning';
import i18n from 'utils/i18n';
import { SubmitButton } from 'components/SubmitButton';
import { ColorMap } from 'styles/color';
import { RootNavigationProps } from 'types/routes';

const accountsWrapper: StyleProp<any> = {
  flex: 1,
};
const accountItemContainer: StyleProp<any> = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingVertical: 11,
};

const accountItemSeparator: StyleProp<any> = {
  borderBottomWidth: 1,
  borderBottomColor: ColorMap.dark2,
  borderBottomStyle: 'solid',
  marginLeft: 50,
};

export const AccountsScreen = () => {
  const navigation = useNavigation<RootNavigationProps>();
  const accountStore = useSelector((state: RootState) => state.accounts);
  const accounts = accountStore.accounts;
  const theme = useSubWalletTheme().colors;

  const renderListEmptyComponent = () => {
    return <Warning title={''} message={i18n.noAccountText} isDanger={false} />;
  };

  // @ts-ignore
  const renderItem = ({ item }) => {
    return (
      <View style={accountItemContainer}>
        <Account key={item.address} name={item.name || ''} address={item.address} showCopyBtn={false} />

        <IconButton
          icon={DotsThree}
          onPress={() => {
            navigation.navigate('EditAccount', { address: item.address, name: item.name });
          }}
        />
      </View>
    );
  };

  const renderSeparator = () => {
    return <View style={accountItemSeparator} />;
  };

  const renderFooterComponent = () => {
    return (
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 42 }}>
        <SubmitButton backgroundColor={theme.background2} title={'Add / Connect Account'} />
      </View>
    );
  };

  return (
    <SubScreenContainer navigation={navigation} title={'Accounts'}>
      <View style={accountsWrapper}>
        <FlatList
          style={{ paddingHorizontal: 16, flex: 1 }}
          keyboardShouldPersistTaps={'handled'}
          data={accounts}
          renderItem={renderItem}
          ItemSeparatorComponent={renderSeparator}
          ListEmptyComponent={renderListEmptyComponent}
          keyExtractor={item => item.address}
        />
        {renderFooterComponent()}
      </View>
    </SubScreenContainer>
  );
};