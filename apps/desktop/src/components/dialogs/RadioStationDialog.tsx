import { useState } from 'react';
import { Check, Globe, Link2, RadioTower } from 'lucide-react';
import type { InternetRadioStation } from '@sonora/types';
import { useRadioStationMutations } from '@sonora/core';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { TextField } from '../ui/TextField';

const isHttpUrl = (v: string) => /^https?:\/\/\S+$/i.test(v.trim());

/** Add or edit an internet radio station on the server. */
export function RadioStationDialog({ station, onClose }: { station?: InternetRadioStation; onClose: () => void }) {
  const { create, update } = useRadioStationMutations();
  const [name, setName] = useState(station?.name ?? '');
  const [streamUrl, setStreamUrl] = useState(station?.streamUrl ?? '');
  const [homePageUrl, setHomePageUrl] = useState(station?.homePageUrl ?? '');
  const [errors, setErrors] = useState<{ name?: string; stream?: string; home?: string }>({});
  const busy = create.isPending || update.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = {
      name: name.trim() ? undefined : 'Give it a name.',
      stream: isHttpUrl(streamUrl) ? undefined : 'Enter the stream address, starting with http:// or https://.',
      home: !homePageUrl.trim() || isHttpUrl(homePageUrl) ? undefined : 'Enter a web address, or leave it empty.',
    };
    setErrors(next);
    if (next.name || next.stream || next.home) return;
    const input = { name: name.trim(), streamUrl: streamUrl.trim(), homePageUrl: homePageUrl.trim() || undefined };
    if (station) update.mutate({ id: station.id, input }, { onSuccess: onClose });
    else create.mutate(input, { onSuccess: onClose });
  };

  return (
    <Dialog open onClose={onClose} title={station ? 'Edit station' : 'Add a radio station'} description="Saved on your Navidrome server, so every app that uses it sees the station.">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField label="Name" icon={<RadioTower />} value={name} onChange={(e) => setName(e.target.value)} placeholder="Radio Paradise" maxLength={120} error={errors.name} data-autofocus />
        <TextField
          label="Stream address"
          icon={<Link2 />}
          value={streamUrl}
          onChange={(e) => setStreamUrl(e.target.value)}
          placeholder="https://stream.radioparadise.com/aac-320"
          inputMode="url"
          spellCheck={false}
          error={errors.stream}
        />
        <TextField
          label="Website (optional)"
          icon={<Globe />}
          value={homePageUrl}
          onChange={(e) => setHomePageUrl(e.target.value)}
          placeholder="https://radioparadise.com"
          inputMode="url"
          spellCheck={false}
          error={errors.home}
        />
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={<Check className="size-4" />} disabled={busy}>
            {station ? 'Save' : 'Add station'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
