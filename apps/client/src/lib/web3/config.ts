import { createThirdwebClient } from 'thirdweb';
import { base } from 'thirdweb/chains';
import { walletConnect, inAppWallet, createWallet } from 'thirdweb/wallets';

const THIRDWEB_CLIENT_ID = process.env.NEXT_PUBLIC_THIRDWEB_CLIENT_ID;

console.log('THIRDWEB_CLIENT_ID', THIRDWEB_CLIENT_ID);

if (!THIRDWEB_CLIENT_ID) {
  // eslint-disable-next-line no-console
  console.warn(
    'NEXT_PUBLIC_THIRDWEB_CLIENT_ID is not defined. Thirdweb features will not work correctly.'
  );
}

export const thirdwebClient = createThirdwebClient({
  clientId: THIRDWEB_CLIENT_ID ?? '',
});

const walletConnectProjectId =
  process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID;

export const supportedWallets = [
  // Injected/browser wallets via createWallet IDs
  createWallet('io.metamask'),
  createWallet('io.rabby'),
  createWallet('com.coinbase.wallet'),
  // WalletConnect (v2) with optional project id
  (() => {
    const w = walletConnect();
    return w;
  })(),
  // Thirdweb in-app / embedded
  inAppWallet({ auth: { options: ['google', 'facebook', 'email'] } }),
];

export const supportedChains = [base];

export const appName = 'DeFi Dungeons';
