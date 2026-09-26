import { NavLink, useNavigate } from 'react-router';
import clsx from 'clsx';
import { Heart, History, Home, Library, ListMusic, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, DownloadCloud } from 'lucide-react';
import { preferencesStore, usePlaylists, usePreferences, useContextPlayState } from '@sonora/core';
import type { Playlist } from '@sonora/types';
import { Logo } from '../brand/Logo';
import { IconButton } from '../ui/Button';
import { Artwork } from '../ui/Artwork';
import { Equalizer } from '../ui/PlayButton';
import { Skeleton } from '../ui/Skeleton';
import { useUi } from '../../lib/ui-store';
import { useItemMenus } from '../../lib/actions';

function NavItem({ to, icon, label, collapsed, end }: { to: string; icon: React.ReactNode; label: string; collapsed: boolean; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) =>
        clsx(
          'flex h-11 items-center gap-4 rounded-md px-3 text-[15px] font-semibold transition-colors [&>svg]:size-[22px] [&>svg]:shrink-0',
          collapsed && 'justify-center px-0',
          isActive ? 'bg-surface-hover text-fg' : 'text-fg-2 hover:text-fg',
        )
      }
    >
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

function PlaylistLink({ playlist, collapsed }: { playlist: Playlist; collapsed: boolean }) {
  const { isCurrent, isPlaying } = useContextPlayState('playlist', playlist.id);
  const { openPlaylistMenu } = useItemMenus();
  return (
    <NavLink
      to={`/playlist/${playlist.id}`}
      title={playlist.name}
      onContextMenu={(e) => openPlaylistMenu(e, playlist)}
      className={({ isActive }) =>
        clsx('flex items-center gap-3 rounded-md p-1.5 transition-colors hover:bg-surface-hover', isActive && 'bg-surface-hover', collapsed && 'justify-center')
      }
    >
      <Artwork coverArtId={playlist.coverArtId} size="thumb" kind="playlist" rounded="sm" className="size-10 shrink-0" />
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <div className={clsx('truncate text-[14px] font-medium', isCurrent ? 'text-accent' : 'text-fg')}>{playlist.name}</div>
          <div className="truncate text-[12.5px] text-fg-3">Playlist · {playlist.owner ?? ''}</div>
        </div>
      )}
      {!collapsed && isCurrent && <Equalizer paused={!isPlaying} className="mr-2" />}
    </NavLink>
  );
}

export function Sidebar() {
  const collapsed = usePreferences((s) => s.sidebarCollapsed);
  const playlists = usePlaylists();
  const openDialog = useUi((s) => s.openDialog);
  const navigate = useNavigate();
  return (
    <aside
      aria-label="Sidebar"
      className={clsx('flex h-full min-h-0 flex-col gap-2 transition-[width] duration-300 ease-soft', collapsed ? 'w-[76px]' : 'w-[264px]')}
    >
      <nav aria-label="Main" className="rounded-lg bg-bg-elevated px-3 pt-4 pb-2">
        <div className={clsx('mb-3 flex items-center px-2', collapsed ? 'justify-center' : 'justify-between')}>
          <button type="button" onClick={() => navigate('/')} aria-label="Sonora home" className="rounded-md">
            <Logo collapsed={collapsed} />
          </button>
        </div>
        <NavItem to="/" end icon={<Home />} label="Home" collapsed={collapsed} />
        <NavItem to="/search" icon={<Search />} label="Search" collapsed={collapsed} />
        <NavItem to="/library" icon={<Library />} label="Library" collapsed={collapsed} />
      </nav>

      <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-bg-elevated">
        <div className={clsx('flex items-center gap-2 px-3 pt-3 pb-1', collapsed ? 'flex-col' : 'justify-between')}>
          <IconButton
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            size="sm"
            onClick={() => preferencesStore.getState().set('sidebarCollapsed', !collapsed)}
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
          </IconButton>
          {!collapsed && <span className="flex-1 text-[14px] font-bold text-fg-2">Your Library</span>}
          <IconButton label="Create playlist" size="sm" variant="solid" onClick={() => openDialog({ type: 'create-playlist' })}>
            <Plus className="size-[18px]" />
          </IconButton>
        </div>
        <div className="px-3 pb-1">
          <NavItem to="/favorites" icon={<Heart />} label="Favorites" collapsed={collapsed} />
          <NavItem to="/library/playlists" icon={<ListMusic />} label="Playlists" collapsed={collapsed} />
          <NavItem to="/history" icon={<History />} label="History" collapsed={collapsed} />
          <NavItem to="/downloads" icon={<DownloadCloud />} label="Downloads" collapsed={collapsed} />
        </div>
        <div className="mx-4 h-px bg-line" />
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2" aria-label="Your playlists">
          {playlists.isPending ? (
            Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 p-1.5">
                <Skeleton className="size-10 shrink-0 rounded-sm" />
                {!collapsed && <Skeleton className="h-3 flex-1" />}
              </div>
            ))
          ) : playlists.data?.length ? (
            playlists.data.map((p) => <PlaylistLink key={p.id} playlist={p} collapsed={collapsed} />)
          ) : (
            !collapsed && (
              <div className="m-2 rounded-md bg-surface p-4">
                <p className="text-[14px] font-bold">Create your first playlist</p>
                <p className="mt-1 text-[13px] text-fg-2">It's easy — we'll help you.</p>
                <button type="button" onClick={() => openDialog({ type: 'create-playlist' })} className="mt-3 rounded-full bg-fg px-4 py-1.5 text-[13px] font-bold text-bg hover:scale-[1.03]">
                  Create playlist
                </button>
              </div>
            )
          )}
        </div>
        <div className="border-t border-line px-3 py-2">
          <NavItem to="/settings" icon={<Settings />} label="Settings" collapsed={collapsed} />
        </div>
      </div>
    </aside>
  );
}
