/**
 * What changed in each release, newest first; shown from the join screen ("What's new"). The first entry's
 * version is the game's version. Add an entry when shipping something players will notice, in their words.
 */
export interface PatchNote {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  changes: string[];
}

export const PATCH_NOTES: PatchNote[] = [
  {
    version: "0.3.0",
    date: "2026-10-26",
    title: "Swimming",
    changes: [
      "Wade out past the beach and you swim: front crawl on the move, treading water when you stop.",
      "Your ping to the server shows next to the clock, in red when the connection is slow.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-10-26",
    title: "Lighter and smoother",
    changes: [
      "New Graphics setting in the menu: Auto, Low or High. Low runs smoother and saves battery on phones and older laptops; Auto picks for you.",
      "Voice chat uses about half the data, and almost none while you're quiet or muted.",
      "Your voice only goes to players close enough to hear you.",
      "The first load downloads about a third less.",
      "The game slows down drawing while you're away, to save battery.",
      "Uses much less memory for the world's textures.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-10-26",
    title: "First release",
    changes: [
      "Walk around the camp, town, beach, graveyard and wilds with friends, up to 8 per room.",
      "Proximity voice chat: the closer someone is, the louder you hear them.",
      "Customize your character: body, outfit, hairstyle, face and colors.",
      "Chat, emotes, and sitting on benches, stools and stumps.",
      "Day and night cycle, minimap and world map.",
    ],
  },
];

export const VERSION = PATCH_NOTES[0].version;
