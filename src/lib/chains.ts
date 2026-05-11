const CHAIN_EXACT = [
  "jysk", "netto", "lidl", "aldi", "zara", "ikea", "matas", "stark", "shell", "subway",
  "bones", "flammen", "sticks'n'sushi", "cofoco", "sunset boulevard",
  "joe & the juice", "joe and the juice", "espresso house", "baresso",
  "pizza hut", "domino's", "papa john's",
  "kfc", "taco bell", "wendy's",
];

const CHAIN_CONTAINS = [
  // Optics
  "synoptik", "profiloptik", "specsavers", "fielmann", "louis nielsen",
  // Electronics
  "elgiganten", "power electronics", "power (elektronik", "harold nyborg",
  // Fast food / cafes
  "mcdonalds", "mcdonald's", "mcdonald", "burger king", "7-eleven", "starbucks",
  "domino", "pizza king", "wingstop", "wagamama", "hereford beefstouw",
  "lagkagehuset", "riccos kaffebar", "the union kitchen",
  "sticks n sushi", "sunset blvd",
  // Grocery / retail
  "rema 1000", "bilka", "føtex", "kvickly", "coop", "normal store", "normal a/s",
  "søstrene grene", "flying tiger", "tiger stores", "h&m",
  "sportsmaster", "intersport",
  // DIY / building
  "silvan", "xl-byg", "bauhaus", "jem & fix",
  // Fuel
  "circle k", "q8 energie", "ok benzin",
  // Kitchen
  "kvik køkken",
  // Fitness
  "fitness world", "sats fitness",
  // Professional services chains
  "deloitte", "pwc", "kpmg", "ernst & young", "bdo revision",
];

export function isChain(name: string, extra?: string[]): boolean {
  const lower = name.toLowerCase();
  for (const chain of CHAIN_EXACT) {
    if (new RegExp(`\\b${chain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) return true;
  }
  const containsList = extra ? [...CHAIN_CONTAINS, ...extra] : CHAIN_CONTAINS;
  return containsList.some((chain) => lower.includes(chain.toLowerCase()));
}
