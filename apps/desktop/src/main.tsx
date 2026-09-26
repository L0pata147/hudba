import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createQueryClient } from '@sonora/core';
import { App } from './App';
import { initPlatform } from './platform';
import { createIdbPersister, PERSISTED_QUERY_ROOTS } from './lib/query-persist';
import './styles/index.css';

const queryClient = createQueryClient();
const persister = createIdbPersister();

void initPlatform().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: 7 * 24 * 60 * 60_000,
          buster: 'v1',
          dehydrateOptions: {
            shouldDehydrateQuery: (q) => q.state.status === 'success' && PERSISTED_QUERY_ROOTS.has(String(q.queryKey[0])),
          },
        }}
      >
        <App />
      </PersistQueryClientProvider>
    </StrictMode>,
  );
});
