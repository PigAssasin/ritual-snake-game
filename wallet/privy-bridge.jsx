import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';

function PrivyBridge() {
  const { login, logout, ready, authenticated } = usePrivy();
  const { wallets } = useWallets();

  useEffect(() => {
    window._privy = { login, logout, ready, authenticated };
    if (ready) window.dispatchEvent(new Event('privyready'));
  }, [login, logout, ready, authenticated]);

  useEffect(() => {
    const addr = wallets[0]?.address || null;
    window.walletAddr = addr;
    window.dispatchEvent(new CustomEvent('walletchange', { detail: { addr } }));
  }, [wallets]);

  return null;
}

const appId = window.PRIVY_APP_ID || '';
const container = document.createElement('div');
document.body.appendChild(container);
createRoot(container).render(
  <PrivyProvider
    appId={appId}
    config={{
      loginMethods: ['wallet', 'email', 'google'],
      appearance: { theme: 'dark', accentColor: '#19D184' },
      embeddedWallets: { createOnLogin: 'users-without-wallets' },
    }}
  >
    <PrivyBridge />
  </PrivyProvider>
);
