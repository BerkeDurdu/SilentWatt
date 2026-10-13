import type { AddressLevel, Capability, Lang, RoleKey, ScreenKey, ScreenLink } from '../shared/types';

export type Text = Record<Lang, string>;

/** Every screen in the product. Never sent to a client as a whole, except to admins managing access. */
export const SCREENS: Record<ScreenKey, { path: string; title: Text }> = {
  overview: { path: '/genel-bakis', title: { tr: 'Genel Bakış', en: 'Overview' } },
  queue: { path: '/vakalar', title: { tr: 'Vaka Kuyruğu', en: 'Case Queue' } },
  team: { path: '/saha-ekibi', title: { tr: 'Saha Ekibi', en: 'Field Team' } },
  reports: { path: '/raporlar', title: { tr: 'Raporlar', en: 'Reports' } },
  data: { path: '/veri-kaynaklari', title: { tr: 'Veri Kaynakları', en: 'Data Sources' } },
  users: { path: '/kullanicilar', title: { tr: 'Kullanıcılar ve Yetkiler', en: 'Users & Permissions' } },
  jobs: { path: '/is-emirlerim', title: { tr: 'İş Emirlerim', en: 'My Work Orders' } },
};

export const SCREEN_ORDER: ScreenKey[] = ['overview', 'queue', 'team', 'reports', 'data', 'users', 'jobs'];

export interface RolePreset {
  label: Text;
  screens: ScreenKey[];
  capabilities: Capability[];
  addressLevel: AddressLevel;
  scopeNote: Text;
}

/** Role presets. A user's screens start from the preset and an admin can change them per user. */
export const ROLES: Record<RoleKey, RolePreset> = {
  manager: {
    label: { tr: 'Yönetim', en: 'Management' },
    screens: ['overview', 'queue', 'reports'],
    capabilities: ['report.export'],
    addressLevel: 'district',
    scopeNote: { tr: 'air1 kanalı · Temmuz 2018 yeniden oynatma · adresler ilçe düzeyinde', en: 'air1 channel · July 2018 replay · addresses at district level' },
  },
  operator: {
    label: { tr: 'Operatör', en: 'Operator' },
    screens: ['queue', 'team', 'data'],
    capabilities: ['case.assign', 'case.dismiss'],
    addressLevel: 'neighbourhood',
    scopeNote: { tr: 'air1 kanalı · Temmuz 2018 yeniden oynatma · adresler mahalle düzeyinde', en: 'air1 channel · July 2018 replay · addresses at neighbourhood level' },
  },
  technician: {
    label: { tr: 'Saha Teknisyeni', en: 'Field Technician' },
    screens: ['jobs'],
    capabilities: ['case.result'],
    addressLevel: 'full',
    scopeNote: { tr: 'Size atanan iş emirleri · tam adres görünür', en: 'Work orders assigned to you · full address visible' },
  },
  admin: {
    label: { tr: 'Sistem Yöneticisi', en: 'System Administrator' },
    screens: ['users', 'data'],
    capabilities: ['users.manage'],
    addressLevel: 'district',
    scopeNote: { tr: 'Kullanıcı erişimi ve kanıt kaynağı', en: 'User access and the evidence source' },
  },
};

export const isScreenKey = (v: unknown): v is ScreenKey => typeof v === 'string' && v in SCREENS;
export const isRoleKey = (v: unknown): v is RoleKey => typeof v === 'string' && v in ROLES;

export const screenLinks = (keys: ScreenKey[], lang: Lang): ScreenLink[] =>
  SCREEN_ORDER.filter((k) => keys.includes(k)).map((k) => ({ key: k, path: SCREENS[k].path, title: SCREENS[k].title[lang] }));
