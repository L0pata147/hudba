import { useState } from 'react';
import { AlertCircle, Globe, KeyRound, ShieldAlert, User } from 'lucide-react';
import { describeError, NavidromeError } from '@sonora/api';
import { restoreQueueFromServer, sessionStore, useRecentServers } from '@sonora/core';
import { validateServerUrl, hostOf } from '@sonora/utils';
import { LogoMark } from '../components/brand/Logo';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';

export function LoginPage() {
  const recent = useRecentServers();
  const last = recent[0];
  const [serverUrl, setServerUrl] = useState(last?.url ?? '');
  const [username, setUsername] = useState(last?.username ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ server?: string; username?: string; password?: string }>({});

  const validation = serverUrl ? validateServerUrl(serverUrl) : null;
  const insecure = validation?.ok && validation.insecure;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof fieldError = {};
    if (!validation?.ok) errs.server = validation?.error ?? 'Enter your server address.';
    if (!username.trim()) errs.username = 'Enter your username.';
    if (!password) errs.password = 'Enter your password.';
    setFieldError(errs);
    setError(null);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      await sessionStore.getState().login({ serverUrl, username, password, rememberServer: remember });
      setPassword('');
      void restoreQueueFromServer();
    } catch (err) {
      if (err instanceof NavidromeError && err.kind === 'network') {
        setError(`Unable to reach ${validation?.url ? hostOf(validation.url) : 'the server'}. Check the address and that the server is running.`);
      } else if (err instanceof NavidromeError && err.kind === 'unsupported') {
        setError('This address does not look like a Navidrome server.');
      } else {
        setError(describeError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-bg px-5 py-10">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(255,122,69,0.22),transparent)] blur-2xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-48 -left-24 h-[420px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(255,92,122,0.14),transparent)] blur-2xl" aria-hidden />
      <main className="animate-rise relative w-full max-w-[420px]">
        <div className="mb-9 flex flex-col items-center text-center">
          <LogoMark size={76} />
          <h1 className="mt-5 font-display text-[2.6rem] leading-none font-extrabold tracking-tight">sonora</h1>
          <p className="mt-3 text-[15px] text-fg-2">Your music, your server. Sign in to your Navidrome.</p>
        </div>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-describedby={error ? 'login-error' : undefined}>
          <TextField
            label="Server URL"
            icon={<Globe />}
            placeholder="https://music.example.com"
            inputMode="url"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="url"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            error={fieldError.server}
            hint={
              insecure ? (
                <span className="flex items-center gap-1.5 text-warning">
                  <ShieldAlert className="size-3.5" /> Not encrypted — prefer https:// for servers on the internet.
                </span>
              ) : undefined
            }
          />
          <TextField
            label="Username"
            icon={<User />}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={fieldError.username}
          />
          <TextField
            label="Password"
            icon={<KeyRound />}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldError.password}
          />
          <label className="flex cursor-pointer items-center gap-3 text-[14px] text-fg-2 select-none">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="peer sr-only" />
            <span className="flex size-5 items-center justify-center rounded-[6px] bg-surface-active ring-1 ring-line transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent" aria-hidden>
              {remember && (
                <svg viewBox="0 0 12 12" className="size-3 text-on-accent">
                  <path d="M2.5 6.2 5 8.5l4.5-5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            Remember this server
          </label>
          {error && (
            <div id="login-error" role="alert" className="animate-pop flex items-start gap-2.5 rounded-md bg-danger/12 px-3.5 py-3 text-[14px] text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Button type="submit" variant="primary" size="lg" loading={loading} className="mt-2 w-full">
            {loading ? 'Connecting…' : 'Log in'}
          </Button>
        </form>
        <p className="mt-8 text-center text-[12.5px] text-fg-3">
          Your password is never stored. Sonora keeps only a salted token for the Subsonic API.
        </p>
      </main>
    </div>
  );
}
