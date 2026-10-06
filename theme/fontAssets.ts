// theme/fontAssets.ts
// The font files behind `fonts` in ./index.ts. Kept separate so screens can
// import colours and font names without pulling in the font loader.
import { Sora_700Bold, Sora_800ExtraBold } from '@expo-google-fonts/sora';
import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

/** Passed to useFonts() in App.tsx; keys must match the values in `fonts`. */
export const fontAssets = {
  Sora_700Bold,
  Sora_800ExtraBold,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
};
