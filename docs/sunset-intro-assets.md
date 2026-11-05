# Sunset Intro Assets

Generated with the built-in image-generation tool. The user's reference was `C:/Users/pabish/Downloads/Crowned Donkey by the Sunset Sea.png`.

Final assets:

- `C:/Users/pabish/Downloads/Card-Duel-Masters/Card-Duel-Masters/artifacts/card-game/public/donkey-intro-sunset-background.png`
- `C:/Users/pabish/Downloads/Card-Duel-Masters/Card-Duel-Masters/artifacts/card-game/public/donkey-intro-sunset-cutout.png`

The original blink artwork is reused with individually aligned eyelid masks. The five-second intro timeout, moving cards, title letters and dancing character remain active. The background covers both portrait and landscape screens; the character stays proportionate.

## Background Prompt

Use case: precise-object-edit. Create the background-only layer of the supplied Donkey intro illustration. Preserve its wide sunset-sea composition: palms framing the top and left/right, turquoise rolling sea, coastal village and mountains at left, temple memorial and tall statue on offshore rocks at right, warm sunset sky and sun, red flowers and foliage at the lower edges, and the sweeping golden sparkling ribbons around the frame. Remove ONLY the central crowned donkey character, the cards in front of it, and the entire DONKEY title plaque. Reconstruct the natural sky, coastal water and shore behind those removed elements. No text, no lettering, no character, no playing cards, no logos. Preserve landmarks, tropical palette, light and polished detailed game-art style. Wide landscape 2.33:1 composition matching the supplied image; centered open area for the existing animated character and title, which will be rendered separately in the game. This is a project background asset, not a complete flattened UI.

## Cutout Prompt

Source: the existing `donkey-intro-dance.png` artwork.

Use case: background-extraction. This is an existing animation sprite that must retain EXACT alignment. Make the background transparent, keeping only the crowned donkey with cape/fur/body and the blank green-and-gold ornate title plaque below it (including crown above plaque and gold spade ornament below plaque). Remove the entire outer green patterned background, the gold circle and laurel leaves behind the donkey, all sparkles and light ribbons, and background between and around ears. Keep the green INSIDE the title plaque opaque. Do not add lettering. IMPORTANT: preserve exact original canvas aspect ratio 1374:1145, original framing, size and positions of every retained pixel. Do NOT crop tightly, do NOT center or rescale the subject. Full original canvas with transparent padding. Donkey eyes, face, crown and plaque positions must remain unchanged for existing blink and letter overlays to align. Clean alpha edges, no leftover green polygons. Do not redesign, regenerate or re-pose the character.

The generated cutout changed the original framing, so its CSS masks, title baseline and eyelid positions were realigned and visually checked.
