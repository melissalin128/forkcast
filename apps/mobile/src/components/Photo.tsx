import { useState } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import { ForkIcon } from './Icons';
import { Gradient } from './ui';

interface Props {
  /** Image source. Undefined = no photo, show the art. */
  source?: ImageSourcePropType;
  /** CSS gradient (from mock.ts) drawn when there is no photo or it fails to load. */
  fallback: string;
  /** Size, aspect ratio and corner radius of the frame. */
  style?: StyleProp<ViewStyle>;
  /** Size of the fork drawn on the fallback art. */
  iconSize?: number;
  accessibilityLabel?: string;
}

const sourceKey = (s: ImageSourcePropType | undefined) => (s === undefined ? '' : JSON.stringify(s));

/**
 * Restaurant photo (mirrors apps/web/src/components/Photo.tsx). A light gray
 * ground shows while the image loads; the gradient art with a fork takes over
 * when there is no source or the load errors. The photo is never cropped.
 */
export function Photo({ source, fallback, style, iconSize = 24, accessibilityLabel }: Props) {
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const key = sourceKey(source);

  if (!source || failedKey === key) {
    return (
      <View
        style={[styles.frame, styles.art, style]}
        accessibilityRole={accessibilityLabel ? 'image' : undefined}
        accessibilityLabel={accessibilityLabel}
      >
        <Gradient css={fallback} />
        <ForkIcon size={iconSize} stroke="rgba(255,255,255,0.92)" strokeWidth={1.8} />
      </View>
    );
  }

  // Listing photos are bimodal (DoorDash ~1.91:1, Uber Eats 1.25:1), so any
  // cover crop cuts off logos and wordmarks. Show the whole image (contain) and
  // fill the letterbox with a blurred copy of it; same source = one fetch.
  return (
    <View style={[styles.frame, style]}>
      <Image
        source={source}
        resizeMode="cover"
        blurRadius={20}
        style={[styles.img, styles.backdrop]}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
      />
      <Image
        source={source}
        resizeMode="contain"
        style={styles.img}
        accessibilityLabel={accessibilityLabel}
        accessibilityIgnoresInvertColors
        onError={() => setFailedKey(key)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // `.photo`: gray ground while loading, clips the image to the frame's corners.
  frame: { overflow: 'hidden', backgroundColor: '#e9e6e0' },
  // Explicit 100% size: a bundled asset carries its own width/height, and on
  // the web `absoluteFill` alone would let those intrinsic dimensions win.
  img: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  // Scaled past the frame so the blur's soft (web) edges stay clipped.
  backdrop: { opacity: 0.6, transform: [{ scale: 1.2 }] },
  art: { alignItems: 'center', justifyContent: 'center' },
});
