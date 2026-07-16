// Denomination domain types (Phase 2 — reference data).

export type DenominationGroup =
  | 'CATHOLIC'
  | 'ORTHODOX'
  | 'PROTESTANT_MAINLINE'
  | 'PROTESTANT_EVANGELICAL'
  | 'PENTECOSTAL'
  | 'CHARISMATIC'
  | 'HISTORICALLY_BLACK'
  | 'PEACE'
  | 'HOLINESS'
  | 'RESTORATIONIST'
  | 'NON_DENOMINATIONAL'
  | 'AFRICAN_INDIGENOUS'
  | 'ASIAN'
  | 'BAPTIST' // legacy, no longer seeded
  | 'ADVENTIST' // legacy, no longer seeded
  | 'OTHER';

export interface Denomination {
  id: string;
  name: string;
  group: DenominationGroup;
  description: string;
  globalFollowers: string;
  bibleVersion: string;
  foundedYear: number;
  worldwideMembers: string;
}
