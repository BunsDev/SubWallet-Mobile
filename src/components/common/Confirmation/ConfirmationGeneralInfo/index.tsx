import { ConfirmationRequestBase } from '@subwallet/extension-base/background/types';
import { getDomainFromUrl } from '@subwallet/extension-base/utils';
import { Image } from 'components/design-system-ui';
import DualLogo from 'components/Logo/DualLogo';
import { useSubWalletTheme } from 'hooks/useSubWalletTheme';
import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import createStyle from './styles';
import { ImageLogosMap } from 'assets/logo';
import { isWalletConnectRequest } from '@subwallet/extension-base/services/wallet-connect-service/helpers';
import { SVGImages } from 'assets/index';
import { SvgUri } from 'react-native-svg';

interface Props {
  request: ConfirmationRequestBase;
  gap?: number;
}

const ConfirmationGeneralInfo: React.FC<Props> = (props: Props) => {
  const { request, gap = 0 } = props;
  const domain = getDomainFromUrl(request.url);
  const rightLogo = `https://icon.horse/icon/${domain}`;
  const [isFirstLoadFailed, setIsFirstLoadFailed] = useState(false);
  const isWCRequest = useMemo(() => isWalletConnectRequest(request.id), [request.id]);
  const theme = useSubWalletTheme().swThemes;
  const styles = useMemo(() => createStyle(theme, gap), [theme, gap]);

  const onLoadImageError = useCallback(() => {
    setIsFirstLoadFailed(true);
  }, []);

  return (
    <View style={styles.container}>
      <DualLogo
        leftLogo={<Image shape={'squircle'} src={ImageLogosMap.subwallet} squircleSize={56} />}
        linkIcon={isWCRequest ? <SVGImages.WalletConnect width={24} height={24} color={theme.colorWhite} /> : undefined}
        rightLogo={
          !isFirstLoadFailed ? (
            <Image shape="squircle" src={{ uri: rightLogo }} squircleSize={56} onError={onLoadImageError} />
          ) : (
            <SvgUri uri={rightLogo} />
          )
        }
      />
      <Text style={styles.text}>{domain}</Text>
    </View>
  );
};

export default ConfirmationGeneralInfo;
