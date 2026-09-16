import { Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Shell } from './components/Shell';
import { GoHome, Loading } from './components/ui';
import { useI18n } from './i18n';
import LoginPage from './pages/Login';
import RequestPage from './pages/Request';
import { registry } from './registry';

export default function App() {
  return (
    <Routes>
      <Route path="/giris" element={<LoginPage />} />
      {/* The resident's SMS link. Public on purpose: no session, one case, token-scoped. */}
      <Route path="/talep/:token" element={<RequestPage />} />
      <Route path="*" element={<SignedInArea />} />
    </Routes>
  );
}

/**
 * Routes are built only from the screens the server says this user has.
 * Any other path — including screens that exist for other roles — redirects to the user's home screen.
 */
function SignedInArea() {
  const { me, loading } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (loading) return <div className="splash"><Loading label={t('checkingSession')} /></div>;

  if (!me) {
    const next = location.pathname + location.search;
    return <Navigate to={next === '/' ? '/giris' : `/giris?next=${encodeURIComponent(next)}`} replace />;
  }

  const home = me.screens[0]?.path;

  return (
    <Shell>
      <Suspense fallback={<Loading />}>
        <Routes>
          {me.screens.map((screen) => {
            const Screen = registry[screen.key];
            return Screen ? <Route key={screen.key} path={`${screen.path}/*`} element={<Screen />} /> : null;
          })}
          <Route path="/" element={home ? <Navigate to={home} replace /> : <NoScreens />} />
          <Route path="*" element={<GoHome />} />
        </Routes>
      </Suspense>
    </Shell>
  );
}

function NoScreens() {
  const { t } = useI18n();
  return (
    <div className="not-found">
      <h1>{t('noScreensTitle')}</h1>
      <p>{t('noScreensBody')}</p>
    </div>
  );
}
