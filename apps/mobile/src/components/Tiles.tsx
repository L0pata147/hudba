import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import { Artwork, T } from './ui';

/** Mix colours, from the logo (same order as on the desktop). */
const MIX_COLORS = ['#5CFFC8', '#5CE1FF', '#5C9BFF', '#8B6BFF', '#C25CFF', '#FF7AB8'];
export const mixColor = (index: number) => MIX_COLORS[index % MIX_COLORS.length]!;

/** Genre colours for tiles. */
export const GENRE_COLORS = ['#E8603C', '#1E3264', '#8D67AB', '#E1118C', '#148A08', '#BA5D07', '#27856A', '#0D73EC'];
export const genreColor = (name: string) => GENRE_COLORS[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7) % GENRE_COLORS.length]!;

/** A daily mix tile: four album covers with the name on a coloured band. */
export function MixArt({ name, coverArtIds, index, size }: { name: string; coverArtIds: string[]; index: number; size: number }) {
  const color = mixColor(index);
  const four = coverArtIds.length >= 4;
  const covers = four ? coverArtIds.slice(0, 4) : coverArtIds.slice(0, 1);
  const cell = four ? size / 2 : size;
  return (
    <View style={{ width: size, height: size, borderRadius: 10, overflow: 'hidden', backgroundColor: color }} accessibilityElementsHidden>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {covers.map((id) => (
          <Artwork key={id} coverArtId={id} size={Math.round(cell * 2)} style={{ width: cell, height: cell, borderRadius: 0 }} />
        ))}
      </View>
      <LinearGradient colors={['transparent', `${color}55`, `${color}F0`]} locations={[0.35, 0.6, 1]} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} />
      <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
        <T style={{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>DAILY</T>
      </View>
      <T numberOfLines={2} style={{ position: 'absolute', left: 10, right: 10, bottom: 8, color: '#08080B', fontWeight: '800', fontSize: size > 180 ? 24 : 15, lineHeight: size > 180 ? 28 : 18 }}>
        {name}
      </T>
    </View>
  );
}

/** A coloured square with an icon and a name (genres, smart playlists, history…). */
export function IconArt({ name, color, Icon, size }: { name?: string; color: string; Icon: LucideIcon; size: number }) {
  return (
    <LinearGradient colors={[color, '#08080B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1.4 }} style={{ width: size, height: size, borderRadius: 10, padding: 14, justifyContent: 'space-between' }}>
      <Icon color="#fff" size={size > 180 ? 44 : 26} strokeWidth={1.8} />
      {name ? (
        <T numberOfLines={2} style={{ color: '#fff', fontWeight: '800', fontSize: size > 180 ? 26 : 15 }}>
          {name}
        </T>
      ) : null}
    </LinearGradient>
  );
}
