import { request, useTopic } from './socket';

export const useAccounts = () => useTopic('accounts', () => ({}));

export const signIn = (id: string, type: 'oauth' | 'api_key') =>
  request('account.signIn', { id, type });

export const answer = (prompt: string, value: string) =>
  request('account.answer', { prompt, value });

export const cancelSignIn = () => request('account.cancel', {});

export const signOut = (id: string) => request('account.signOut', { id });

export const addAccount = (provider: string) =>
  request('account.add', { provider });

export const useFirst = (id: string) => request('account.useFirst', { id });
