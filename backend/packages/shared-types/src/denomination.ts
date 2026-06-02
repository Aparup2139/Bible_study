// Denomination domain types (Phase 2 — reference data).

export type DenominationGroup =
  | 'CATHOLIC'
  | 'ORTHODOX'
  | 'PROTESTANT_MAINLINE'
  | 'PROTESTANT_EVANGELICAL'
  | 'PENTECOSTAL'
  | 'CHARISMATIC'
  | 'BAPTIST'
  | 'ADVENTIST'
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
