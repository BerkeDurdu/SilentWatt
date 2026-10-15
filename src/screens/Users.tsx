import { useState } from 'react';
import type { RoleKey, ScreenKey, UserRow, UsersData } from '../../shared/types';
import { api, ApiError, useApi } from '../api';
import { useAuth } from '../auth';
import { LoadError, Loading, PageHead } from '../components/ui';
import type { DictKey } from '../dict';
import { useI18n } from '../i18n';
import { useToast } from '../toast';

export default function Users() {
  const { t } = useI18n();
  const { data, error, loading, reload, setData } = useApi<UsersData>('/users');
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;

  const replace = (row: UserRow) => setData({ ...data, users: data.users.map((u) => (u.id === row.id ? row : u)) });

  return (
    <>
      <PageHead title={t('usersTitle')} lead={t('usersLead')} />
      <section className="panel">
        <div className="table-wrap">
          <table className="users">
            <thead>
              <tr><th>{t('thUser')}</th><th>{t('thRole')}</th><th>{t('thScreens')}</th><th className="c">{t('thActive')}</th><th /></tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <UserEditor key={`${u.id}:${u.role}:${u.screens.join()}:${u.active}`} row={u} data={data} onSaved={replace} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

const ERRORS: Record<string, DictKey> = {
  self_lockout: 'errSelf',
  invalid_screens: 'errScreens',
  screen_not_allowed: 'errScreenRole',
  invalid_role: 'errRole',
};

function UserEditor({ row, data, onSaved }: { row: UserRow; data: UsersData; onSaved: (r: UserRow) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const { refresh } = useAuth();
  const [role, setRole] = useState<RoleKey>(row.role);
  const [screens, setScreens] = useState<ScreenKey[]>(row.screens);
  const [active, setActive] = useState(row.active);
  const [saving, setSaving] = useState(false);

  const same = (a: ScreenKey[], b: ScreenKey[]) => [...a].sort().join() === [...b].sort().join();
  const dirty = role !== row.role || active !== row.active || !same(screens, row.screens);
  const allowed = data.roles.find((r) => r.key === role)?.allowedScreens ?? [];
  const locked = (k: ScreenKey) => (row.isSelf && k === 'users') || !allowed.includes(k);

  function changeRole(next: RoleKey) {
    setRole(next);
    setScreens(data.roles.find((r) => r.key === next)?.screens ?? []);
  }

  function toggle(k: ScreenKey) {
    if (locked(k)) return;
    setScreens((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await api<UserRow>(`/users/${row.id}`, { method: 'PATCH', body: { role, screens, active } });
      onSaved(updated);
      toast(t('tUserSaved', { name: updated.name }));
      if (updated.isSelf) void refresh();
    } catch (err) {
      toast(t(ERRORS[err instanceof ApiError ? err.code : ''] ?? 'errSave'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>
        <b className="uname">{row.name}{row.isSelf && <span className="you">{t('you')}</span>}</b>
        <span className="sub mono">{row.email}</span>
      </td>
      <td>
        <select value={role} onChange={(e) => changeRole(e.target.value as RoleKey)} disabled={!data.canManage || row.isSelf} aria-label={t('roleOf', { name: row.name })}>
          {data.roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
      </td>
      <td>
        <div className="screen-checks">
          {data.screens.map((s) => (
            <label key={s.key} className={screens.includes(s.key) ? 'screen-check on' : 'screen-check'}>
              <input type="checkbox" checked={screens.includes(s.key)} onChange={() => toggle(s.key)} disabled={!data.canManage || locked(s.key)} />
              {s.title}
            </label>
          ))}
        </div>
        <span className="sub">{t('screenCount', { n: screens.length })}</span>
      </td>
      <td className="c">
        <input type="checkbox" className="switch" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={!data.canManage || row.isSelf} aria-label={t('activeOf', { name: row.name })} />
      </td>
      <td className="r">
        {data.canManage && <button className="btn" disabled={!dirty || saving} onClick={save}>{saving ? t('saving') : t('save')}</button>}
      </td>
    </tr>
  );
}
