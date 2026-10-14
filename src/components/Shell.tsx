import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { Notification } from '../../shared/types';
import { api } from '../api';
import { useAuth, useMe } from '../auth';
import { dateTime } from '../format';
import { useI18n } from '../i18n';
import { Icon, Logo, SCREEN_ICON, Wordmark } from './icons';
import { LangToggle } from './ui';

export function Shell({ children }: { children: ReactNode }) {
  const me = useMe();
  const { t } = useI18n();
  const single = me.screens.length <= 1;

  return (
    <div className={single ? 'app single' : 'app'}>
      <header className="top">
        <Link to="/" className="brand">
          <Logo />
          <span className="brand-text">
            <Wordmark />
            <small>{me.organization}</small>
          </span>
        </Link>
        {single && me.screens[0] && <span className="top-title">{me.screens[0].title}</span>}
        <div className="top-right">
          <LangToggle />
          <NotificationBell />
          <UserMenu />
        </div>
      </header>

      {!single && (
        <nav className="rail" aria-label={t('screensNav')}>
          <div className="nav">
            {me.screens.map((s) => (
              <NavLink key={s.key} to={s.path}>
                <Icon name={SCREEN_ICON[s.key]} />
                <span>{s.title}</span>
              </NavLink>
            ))}
          </div>
          <div className="rail-foot">
            <b>{t('scope')}</b>
            {me.scopeNote}
          </div>
        </nav>
      )}

      <main className="main" id="main">
        <div className="scope">
          <span className="tag">{t(me.fixture ? 'tagFixture' : 'tagRun')}</span>
          <span><Icon name="eye" />{me.scopeNote}</span>
        </div>
        {children}
      </main>
    </div>
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, ref };
}

function NotificationBell() {
  const { t, lang } = useI18n();
  const { open, setOpen, ref } = usePopover();
  const [items, setItems] = useState<Notification[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let alive = true;
    const load = () => api<Notification[]>('/notifications').then((n) => alive && setItems(n)).catch(() => {});
    void load();
    const id = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [location.pathname, lang]);

  return (
    <div className="wrap-rel" ref={ref}>
      <button className="icon-btn" aria-label={`${t('notifications')} (${items.length})`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="bell" />
        {items.length > 0 && <span className="badge">{items.length}</span>}
      </button>
      {open && (
        <div className="pop">
          <h4>{t('notifications')}</h4>
          {items.length === 0 && <div className="empty">{t('noNotifications')}</div>}
          {items.map((n) => (
            <button key={n.id} onClick={() => n.href && navigate(n.href)} disabled={!n.href}>
              {n.text}
              <span className="t">{dateTime(n.at)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const me = useMe();
  const { t } = useI18n();
  const { logout } = useAuth();
  const { open, setOpen, ref } = usePopover();
  const navigate = useNavigate();

  return (
    <div className="wrap-rel" ref={ref}>
      <button className="who" aria-expanded={open} aria-label={t('accountMenu')} onClick={() => setOpen(!open)}>
        <span className="avatar">{me.initials}</span>
        <span className="who-text">
          {me.name}
          <small>{me.roleLabel}</small>
        </span>
      </button>
      {open && (
        <div className="pop account">
          <div className="account-head">
            <b>{me.name}</b>
            <span>{me.email}</span>
            <span className="role">{me.roleLabel}</span>
          </div>
          <button
            onClick={async () => {
              await logout();
              navigate('/giris', { replace: true });
            }}
          >
            <Icon name="logout" /> {t('signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
