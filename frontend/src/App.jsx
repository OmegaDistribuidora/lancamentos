import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { api, getToken, setToken } from './api.js'
import Layout from './Layout.jsx'
import LoginPage from './LoginPage.jsx'
import { Loading, Toast } from './components.jsx'

const DashboardPage = lazy(() => import('./DashboardPage.jsx'))
const LancamentosPage = lazy(() => import('./LancamentosPage.jsx'))
const LancamentoModal = lazy(() => import('./LancamentoModal.jsx'))
const AuditoriaPage = lazy(() => import('./AuditoriaPage.jsx'))
const UsuariosPage = lazy(() => import('./UsuariosPage.jsx'))
const CadastrosPage = lazy(() => import('./CadastrosPage.jsx'))
const CentrosCustoPage = lazy(() => import('./CentrosCustoPage.jsx'))

export default function App() {
  const [user, setUser] = useState(null)
  const [catalogs, setCatalogs] = useState({ sedes: [], centrosCusto: [], gruposContas: [], contas: [] })
  const [booting, setBooting] = useState(true)
  const [view, setView] = useState('dashboard')
  const [modal, setModal] = useState(undefined)
  const [refreshKey, setRefreshKey] = useState(0)
  const [toast, setToast] = useState(null)
  const notify = useCallback((message, type = 'success') => setToast({ message, type, id: Date.now() }), [])
  const closeToast = useCallback(() => setToast(null), [])
  const loadCatalogs = useCallback(async () => setCatalogs(await api('/api/catalogos')), [])

  useEffect(() => {
    async function boot() {
      try {
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const ssoToken = hash.get('sso') || new URLSearchParams(window.location.search).get('sso')
        if (ssoToken) {
          const data = await api('/api/auth/sso/exchange', { method: 'POST', body: JSON.stringify({ token: ssoToken }) })
          setToken(data.token); setUser(data.usuario); window.history.replaceState(null, '', window.location.pathname)
          await loadCatalogs(); return
        }
        if (getToken()) { setUser(await api('/api/auth/me')); await loadCatalogs() }
      } catch { setToken(''); setUser(null) } finally { setBooting(false) }
    }
    void boot()
  }, [loadCatalogs])

  async function loggedIn(nextUser) {
    setUser(nextUser)
    try { await loadCatalogs() } catch (err) { notify(err.message, 'error') }
  }
  function logout() { setToken(''); setUser(null); setView('dashboard'); setCatalogs({ sedes: [], centrosCusto: [], gruposContas: [], contas: [] }) }
  function navigate(next) { setView(next); void loadCatalogs().catch(() => undefined) }
  function newEntry() {
    if (!catalogs.sedes.length || !catalogs.centrosCusto.length) return notify('Seu usuário precisa ter sede e centro de custo liberados.', 'error')
    setModal(null)
  }
  function saved(_item, edited) { setModal(undefined); setRefreshKey((key) => key + 1); notify(edited ? 'Lançamento atualizado. O de-para foi auditado.' : 'Lançamento criado com sucesso.') }

  if (booting) return <div className="boot"><div className="brand-mark large"><BarChart3/></div><span>Preparando o Lançamentos...</span></div>
  if (!user) return <LoginPage onLogin={loggedIn}/>
  return <>
    <Layout user={user} view={view} onView={navigate} onLogout={logout} onNew={newEntry}>
      <Suspense fallback={<Loading label="Carregando página..."/>}>
        {view === 'dashboard' && <DashboardPage user={user} catalogs={catalogs} refreshKey={refreshKey} onNew={newEntry} onSeeAll={() => navigate('lancamentos')}/>}
        {view === 'lancamentos' && <LancamentosPage user={user} catalogs={catalogs} refreshKey={refreshKey} onNew={newEntry} onEdit={setModal} notify={notify}/>}
        {view === 'orcamentos' && user.podeVerTodos && <CadastrosPage notify={notify} onChanged={() => setRefreshKey((key) => key + 1)}/>}
        {view === 'auditoria' && user.podeVerTodos && <AuditoriaPage notify={notify}/>}
        {view === 'centros-custo' && user.podeVerTodos && <CentrosCustoPage user={user} notify={notify} onChanged={loadCatalogs}/>}
        {view === 'usuarios' && user.podeAdministrar && <UsuariosPage catalogs={catalogs} notify={notify}/>}
      </Suspense>
    </Layout>
    {modal !== undefined && <Suspense fallback={null}><LancamentoModal item={modal} catalogs={catalogs} onClose={() => setModal(undefined)} onSaved={saved}/></Suspense>}
    <Toast toast={toast} onClose={closeToast}/>
  </>
}
