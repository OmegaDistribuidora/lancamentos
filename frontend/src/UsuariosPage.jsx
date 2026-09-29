import { useCallback, useEffect, useState } from 'react'
import { CheckCheck, Pencil, Plus, UserRound, Users } from 'lucide-react'
import { api } from './api.js'
import { profileLabel } from './format.js'
import { Empty, Loading, Modal } from './components.jsx'

const empty = { nomeExibicao: '', login: '', senha: '', perfil: 'USUARIO', ativo: true, sedeIds: [], centroCustoIds: [] }

function UserModal({ item, catalogs, onClose, onSaved }) {
  const [form, setForm] = useState(item ? { ...item, senha: '', sedeIds: item.sedeIds.map(String), centroCustoIds: item.centroCustoIds.map(String) } : empty)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const toggle = (field, id) => setForm((current) => ({ ...current, [field]: current[field].includes(String(id)) ? current[field].filter((value) => value !== String(id)) : [...current[field], String(id)] }))
  const toggleAll = (field, options) => setForm((current) => {
    const all = options.every((option) => current[field].includes(String(option.id)))
    return { ...current, [field]: all ? [] : options.map((option) => String(option.id)) }
  })

  async function submit(event) {
    event.preventDefault(); setLoading(true); setError('')
    try {
      await api(item ? `/api/admin/usuarios/${item.id}` : '/api/admin/usuarios', { method: item ? 'PUT' : 'POST', body: JSON.stringify(form) })
      onSaved()
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return <Modal title={item ? 'Editar usuário' : 'Novo usuário'} subtitle="Defina a identidade no SSO e onde o usuário pode lançar." onClose={onClose} wide>
    <form onSubmit={submit}>
      <div className="modal-body form-grid">
        <label>Nome de exibição<input required value={form.nomeExibicao} onChange={(event) => setForm({ ...form, nomeExibicao: event.target.value })} placeholder="Nome completo"/></label>
        <label>Login / identidade SSO<input required value={form.login} onChange={(event) => setForm({ ...form, login: event.target.value.toLowerCase() })} placeholder="nome.sobrenome"/></label>
        <label>Perfil<select value={form.perfil} onChange={(event) => setForm({ ...form, perfil: event.target.value })}><option value="USUARIO">Usuário</option><option value="GERENTE_ADMINISTRATIVO">Gerente administrativo</option><option value="DIRETORIA">Diretoria</option><option value="ADMIN">Administrador</option></select></label>
        <label>Senha local <small>{item ? 'Deixe em branco para manter' : 'Opcional para usuários que entrarão apenas via SSO'}</small><input type="password" minLength={8} value={form.senha} onChange={(event) => setForm({ ...form, senha: event.target.value })} placeholder="Mínimo 8 caracteres"/></label>
        <fieldset className="full"><legend><span>Sedes liberadas</span><button type="button" className="select-all" onClick={() => toggleAll('sedeIds', catalogs.sedes)}><CheckCheck size={14}/>{catalogs.sedes.every((row) => form.sedeIds.includes(String(row.id))) ? 'Limpar seleção' : 'Selecionar todas'}</button></legend><div className="check-grid">{catalogs.sedes.map((row) => <label className="check" key={row.id}><input type="checkbox" checked={form.sedeIds.includes(String(row.id))} onChange={() => toggle('sedeIds', row.id)}/><span>{row.nome}</span></label>)}</div></fieldset>
        <fieldset className="full"><legend><span>Centros de custo liberados</span><button type="button" className="select-all" onClick={() => toggleAll('centroCustoIds', catalogs.centrosCusto)}><CheckCheck size={14}/>{catalogs.centrosCusto.every((row) => form.centroCustoIds.includes(String(row.id))) ? 'Limpar seleção' : 'Selecionar todos'}</button></legend><div className="check-grid">{catalogs.centrosCusto.map((row) => <label className="check" key={row.id}><input type="checkbox" checked={form.centroCustoIds.includes(String(row.id))} onChange={() => toggle('centroCustoIds', row.id)}/><span>{row.nome}</span></label>)}</div></fieldset>
        {item && <label className="check full"><input type="checkbox" checked={form.ativo} onChange={(event) => setForm({ ...form, ativo: event.target.checked })}/><span>Usuário ativo</span></label>}
        {error && <div className="form-error full">{error}</div>}
      </div>
      <footer className="modal-footer"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={loading}>{loading ? 'Salvando...' : 'Salvar usuário'}</button></footer>
    </form>
  </Modal>
}

export default function UsuariosPage({ catalogs, notify }) {
  const [data, setData] = useState(null)
  const [editing, setEditing] = useState(undefined)
  const load = useCallback(async () => { try { setData(await api('/api/admin/usuarios')) } catch (err) { notify(err.message, 'error') } }, [notify])
  useEffect(() => { void load() }, [load])
  const saved = async () => { setEditing(undefined); notify('Usuário salvo com sucesso.'); await load() }
  return <>
    <div className="page-heading"><div><span className="eyebrow blue">ACESSOS</span><h1>Usuários</h1><p>Gerencie logins, perfis e locais disponíveis para lançamento.</p></div><button className="primary desktop-only" onClick={() => setEditing(null)}><Plus size={18}/> Novo usuário</button></div>
    <section className="user-stats"><div><span className="metric-icon blue"><Users/></span><p><strong>{data?.content.length || 0}</strong><span>Usuários cadastrados</span></p></div><div><span className="metric-icon green"><UserRound/></span><p><strong>{data?.content.filter((item) => item.ativo).length || 0}</strong><span>Acessos ativos</span></p></div></section>
    <section className="panel data-panel">{!data ? <Loading/> : data.content.length ? <div className="table-scroll"><table><thead><tr><th>Usuário</th><th>Login SSO</th><th>Perfil</th><th>Sedes</th><th>Centros de custo</th><th>Status</th><th></th></tr></thead><tbody>{data.content.map((item) => <tr key={item.id}><td><strong>{item.nomeExibicao}</strong></td><td><code>{item.login}</code></td><td>{profileLabel(item.perfil)}</td><td>{item.sedeIds.length}</td><td>{item.centroCustoIds.length}</td><td><span className={`status ${item.ativo ? 'active' : 'inactive'}`}>{item.ativo ? 'Ativo' : 'Inativo'}</span></td><td><button className="icon-button" onClick={() => setEditing(item)}><Pencil size={17}/></button></td></tr>)}</tbody></table></div> : <Empty/>}</section>
    {editing !== undefined && <UserModal item={editing} catalogs={catalogs} onClose={() => setEditing(undefined)} onSaved={saved}/>}
  </>
}
