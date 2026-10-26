import { useState } from 'react'
import { BookOpenCheck, ChevronDown, ClipboardList, FileClock, Landmark, LayoutDashboard, LogOut, Menu, Plus, Search, Settings, Truck, Users, X } from 'lucide-react'
import { profileLabel } from './format.js'

const items = [
  { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard, normal: true },
  { id: 'lancamentos', label: 'Lançamentos', icon: ClipboardList, normal: true },
  { id: 'lancamentos-cargas', label: 'Lançamentos de Cargas', icon: Truck, cargo: true },
  { id: 'orcamentos', label: 'Orçamentos', icon: Landmark, manager: true },
  { id: 'auditoria', label: 'Auditoria', icon: FileClock, manager: true },
  { id: 'centros-custo', label: 'Configurações', icon: Settings, manager: true },
  { id: 'usuarios', label: 'Usuários', icon: Users, admin: true },
]

export default function Layout({ user, view, onView, onLogout, onNew, onNewCargo, children }) {
  const [mobile, setMobile] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const visible = items.filter((item) => (!item.manager || user.podeVerTodos) && (!item.admin || user.podeAdministrar) && (!item.normal || user.podeLancamentosNormais) && (!item.cargo || user.podeConsultarCargas))
  const navigate = (id) => { onView(id); setMobile(false) }
  return <div className="app-shell">
    {mobile && <div className="mobile-shade" onClick={() => setMobile(false)}/>}
    <aside className={`sidebar ${mobile ? 'open' : ''}`}>
      <div className="side-brand"><img className="side-brand-logo" src="/omega-logo-branco.png" alt="Ômega Distribuidora"/><button className="sidebar-close" onClick={() => setMobile(false)}><X/></button></div>
      <nav>{visible.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={19}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-footer"><BookOpenCheck size={16}/> Central financeira</div></div>
    </aside>
    <div className="content-shell">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setMobile(true)}><Menu/></button>
        <div className="global-search"><Search size={19}/><input placeholder={view === 'lancamentos-cargas' ? 'Buscar cargas, destinos, motoristas...' : 'Buscar lançamentos, contas...'} onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { const target = user.podeLancamentosNormais ? 'lancamentos' : 'lancamentos-cargas'; navigate(target); sessionStorage.setItem(target === 'lancamentos' ? 'global_search' : 'cargo_global_search', e.currentTarget.value.trim()) } }}/></div>
        <button className="profile-button" onClick={() => setProfileOpen(!profileOpen)}><span className="avatar">{user.nomeExibicao.split(/\s+/).slice(0,2).map((x) => x[0]).join('').toUpperCase()}</span><span className="profile-copy"><strong>{user.nomeExibicao}</strong><small>{profileLabel(user.perfil)}</small></span><ChevronDown size={16}/></button>
        {profileOpen && <div className="profile-menu"><div><strong>{user.nomeExibicao}</strong><span>{user.login}</span></div><button onClick={onLogout}><LogOut size={17}/> Sair</button></div>}
      </header>
      <main className="main-content">
        {(view === 'lancamentos' || view === 'dashboard') && user.podeLancamentosNormais && <div className="mobile-action"><button className="primary" onClick={onNew}><Plus size={18}/> Novo lançamento</button></div>}
        {view === 'lancamentos-cargas' && user.podeConsultarCargas && <div className="mobile-action"><button className="primary" onClick={onNewCargo}><Plus size={18}/> Nova carga</button></div>}
        {children}
      </main>
    </div>
  </div>
}
