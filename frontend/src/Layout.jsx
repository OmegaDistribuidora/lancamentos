import { useState } from 'react'
import { BookOpenCheck, ChevronDown, ClipboardList, FileClock, Landmark, LayoutDashboard, LogOut, Menu, Plus, Search, Users, X } from 'lucide-react'
import { profileLabel } from './format.js'

const items = [
  { id: 'dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'lancamentos', label: 'Lançamentos', icon: ClipboardList },
  { id: 'orcamentos', label: 'Orçamentos', icon: Landmark, manager: true },
  { id: 'auditoria', label: 'Auditoria', icon: FileClock, manager: true },
  { id: 'usuarios', label: 'Usuários', icon: Users, admin: true },
]

export default function Layout({ user, view, onView, onLogout, onNew, children }) {
  const [mobile, setMobile] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const visible = items.filter((item) => (!item.manager || user.podeVerTodos) && (!item.admin || user.podeAdministrar))
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
        <div className="global-search"><Search size={19}/><input placeholder="Buscar lançamentos, contas..." onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { navigate('lancamentos'); sessionStorage.setItem('global_search', e.currentTarget.value.trim()) } }}/></div>
        <button className="profile-button" onClick={() => setProfileOpen(!profileOpen)}><span className="avatar">{user.nomeExibicao.split(/\s+/).slice(0,2).map((x) => x[0]).join('').toUpperCase()}</span><span className="profile-copy"><strong>{user.nomeExibicao}</strong><small>{profileLabel(user.perfil)}</small></span><ChevronDown size={16}/></button>
        {profileOpen && <div className="profile-menu"><div><strong>{user.nomeExibicao}</strong><span>{user.login}</span></div><button onClick={onLogout}><LogOut size={17}/> Sair</button></div>}
      </header>
      <main className="main-content">
        <div className="mobile-action"><button className="primary" onClick={onNew}><Plus size={18}/> Novo lançamento</button></div>
        {children}
      </main>
    </div>
  </div>
}
