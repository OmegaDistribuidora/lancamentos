import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Database, Eye, EyeOff, Pencil, Plus, Save, Search, Trash2 } from 'lucide-react'
import { api, qs } from './api.js'
import { Empty, FilterSelect, Loading, Modal } from './components.jsx'

function CentroModal({ item, sedes, sedeInicial, onClose, onSaved, notify }) {
  const [form, setForm] = useState({ nome: item?.nome || '', sedeId: String(item?.sedeId || sedeInicial || sedes[0]?.id || '') })
  const [loading, setLoading] = useState(false)
  async function submit(event) {
    event.preventDefault(); setLoading(true)
    try {
      const path = item ? `/api/centros-custo/${item.id}` : '/api/centros-custo'
      await api(path, { method: item ? 'PUT' : 'POST', body: JSON.stringify(form) })
      notify(item ? 'Centro de custo atualizado e auditado.' : 'Centro de custo criado e auditado.')
      await onSaved(); onClose()
    } catch (error) { notify(error.message, 'error') } finally { setLoading(false) }
  }
  return <Modal title={item ? 'Editar centro de custo' : 'Novo centro de custo'} subtitle="A alteração ficará registrada na auditoria." onClose={onClose}>
    <form onSubmit={submit}><div className="modal-body form-grid">
      <label className="full">Nome<input required maxLength="160" value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} placeholder="Nome do centro de custo" autoFocus/></label>
      <label className="full">Sede<select required value={form.sedeId} onChange={(event) => setForm({ ...form, sedeId: event.target.value })}><option value="">Selecione</option>{sedes.map((sede) => <option key={sede.id} value={sede.id}>{sede.nome}</option>)}</select></label>
    </div><footer className="modal-footer"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={loading}><Save size={17}/>{loading ? 'Salvando...' : 'Salvar'}</button></footer></form>
  </Modal>
}

function CatalogStatus({ ativo, presente }) {
  if (!presente) return <span className="catalog-status source-missing">Removido no WinThor</span>
  return <span className={`catalog-status ${ativo ? 'active' : 'inactive'}`}>{ativo ? 'Ativo' : 'Inativo'}</span>
}

function CatalogSettings({ notify, onChanged }) {
  const [catalogo, setCatalogo] = useState('FILIAL')
  const [data, setData] = useState(null)
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState('')
  const load = useCallback(async () => {
    try {
      const result = await api(`/api/configuracoes/catalogos${qs({ catalogo })}`)
      setData(result)
      setSelectedGroupId((current) => result.gruposContas.some((item) => String(item.id) === String(current)) ? current : String(result.gruposContas[0]?.id || ''))
    } catch (error) { notify(error.message, 'error') }
  }, [catalogo, notify])
  useEffect(() => { setData(null); void load() }, [load])
  const term = search.trim().toLocaleLowerCase('pt-BR')
  const groups = useMemo(() => {
    if (!data || !term) return data?.gruposContas || []
    return data.gruposContas.filter((group) => `${group.codigo} ${group.nome}`.toLocaleLowerCase('pt-BR').includes(term)
      || data.contas.some((account) => String(account.grupoContaId) === String(group.id) && `${account.codigo} ${account.nome}`.toLocaleLowerCase('pt-BR').includes(term)))
  }, [data, term])
  const selectedGroup = data?.gruposContas.find((item) => String(item.id) === String(selectedGroupId))
  const accounts = useMemo(() => {
    if (!data || !selectedGroup) return []
    return data.contas.filter((item) => String(item.grupoContaId) === String(selectedGroup.id)
      && (!term || `${item.codigo} ${item.nome}`.toLocaleLowerCase('pt-BR').includes(term)))
  }, [data, selectedGroup, term])
  async function toggle(type, item) {
    const key = `${type}-${item.id}`; setSaving(key)
    try {
      await api(`/api/configuracoes/catalogos/${type}/${item.id}/status`, { method: 'PUT', body: JSON.stringify({ ativo: !item.ativo }) })
      notify(`${type === 'grupos' ? 'Grupo' : 'Conta'} ${item.codigo} ${item.ativo ? 'inativado' : 'ativado'} e auditado.`)
      await load(); await onChanged?.()
    } catch (error) { notify(error.message, 'error') } finally { setSaving('') }
  }
  return <>
    <section className="panel catalog-settings-head"><div><h2>Disponibilidade de grupos e contas</h2><p>A alteração vale para todas as sedes que utilizam o catálogo selecionado. Cadastros removidos do WinThor permanecem apenas quando possuem histórico.</p></div><FilterSelect options={[{ value: 'FILIAL', label: 'Filial · demais sedes' }, { value: 'MATRIZ', label: 'Matriz · Ômega Matriz' }]} value={catalogo} onChange={(value) => { setCatalogo(String(value)); setSearch('') }} ariaLabel="Selecionar catálogo"/></section>
    <div className="catalog-settings-grid">
      <section className="panel catalog-settings-groups"><div className="catalog-search"><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar grupo ou conta"/></div>
        {!data ? <Loading/> : <div className="catalog-management-list">{groups.map((group) => <div className={`catalog-management-row ${String(group.id) === String(selectedGroupId) ? 'selected' : ''}`} key={group.id}>
          <button className="catalog-row-main" onClick={() => setSelectedGroupId(String(group.id))}><strong>{group.codigo}</strong><span>{group.nome}<small>{group.quantidadeContas} conta(s) · {group.quantidadeLancamentos} lançamento(s)</small></span></button>
          <div><CatalogStatus ativo={group.ativo} presente={group.presenteOrigem}/><button className={`icon-button ${group.ativo ? 'danger-text' : ''}`} disabled={!group.presenteOrigem || saving === `grupos-${group.id}`} title={group.ativo ? 'Inativar grupo' : 'Ativar grupo'} onClick={() => toggle('grupos', group)}>{group.ativo ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
        </div>)}</div>}
      </section>
      <section className="panel catalog-settings-accounts"><div className="catalog-settings-title"><div><h2>{selectedGroup ? `${selectedGroup.codigo} — ${selectedGroup.nome}` : 'Contas'}</h2><p>Uma conta pode ser inativada sem inativar o restante do grupo.</p></div></div>
        {!data ? <Loading/> : accounts.length ? <div className="catalog-management-list">{accounts.map((account) => <div className="catalog-management-row" key={account.id}>
          <div className="catalog-row-main static"><strong>{account.codigo}</strong><span>{account.nome}<small>{account.quantidadeLancamentos} lançamento(s) vinculado(s)</small></span></div>
          <div><CatalogStatus ativo={account.ativo} presente={account.presenteOrigem}/><button className={`icon-button ${account.ativo ? 'danger-text' : ''}`} disabled={!account.presenteOrigem || saving === `contas-${account.id}`} title={account.ativo ? 'Inativar conta' : 'Ativar conta'} onClick={() => toggle('contas', account)}>{account.ativo ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
        </div>)}</div> : <Empty title="Nenhuma conta encontrada" text="Selecione outro grupo ou ajuste a busca."/>}
      </section>
    </div>
  </>
}

function CostCenters({ notify, onChanged }) {
  const [data, setData] = useState(null)
  const [search, setSearch] = useState('')
  const [sedeId, setSedeId] = useState('')
  const [editing, setEditing] = useState(undefined)
  const load = useCallback(async () => { try { setData(await api('/api/centros-custo')) } catch (error) { notify(error.message, 'error') } }, [notify])
  useEffect(() => { void load() }, [load])
  const filtered = useMemo(() => {
    if (!data) return []
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return data.centrosCusto.filter((item) => (!sedeId || String(item.sedeId) === sedeId) && (!term || `${item.nome} ${item.sede}`.toLocaleLowerCase('pt-BR').includes(term)))
  }, [data, search, sedeId])
  async function changed() { await load(); await onChanged?.() }
  async function remove(item) {
    if (!window.confirm(`Excluir o centro de custo “${item.nome}” da sede ${item.sede}? Os lançamentos existentes serão preservados.`)) return
    try { await api(`/api/centros-custo/${item.id}`, { method: 'DELETE' }); notify('Centro de custo excluído e registrado na auditoria.'); await changed() } catch (error) { notify(error.message, 'error') }
  }
  return <>
    <div className="settings-action"><button className="primary" onClick={() => setEditing(null)}><Plus size={18}/> Novo centro de custo</button></div>
    <section className="panel filters cost-center-filters"><div className="search-field"><Search size={18}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar centro de custo ou sede"/></div><label><span>Sede</span><FilterSelect options={[{ value: '', label: 'Todas as sedes' }, ...(data?.sedes || []).map((sede) => ({ value: String(sede.id), label: sede.nome }))]} value={sedeId} onChange={(value) => setSedeId(String(value))} ariaLabel="Filtrar sede"/></label></section>
    <section className="panel data-panel">{!data ? <Loading/> : filtered.length ? <div className="table-scroll"><table><thead><tr><th>Centro de custo</th><th>Sede</th><th>Lançamentos vinculados</th><th>Ações</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.nome}</strong></td><td>{item.sede}</td><td>{item.quantidadeLancamentos}</td><td><div className="row-actions"><button className="icon-button" title="Editar" onClick={() => setEditing(item)}><Pencil size={17}/></button><button className="icon-button danger-text" title="Excluir" onClick={() => remove(item)}><Trash2 size={17}/></button></div></td></tr>)}</tbody></table></div> : <Empty title="Nenhum centro de custo encontrado" text="Ajuste os filtros ou cadastre um novo centro de custo."/>}</section>
    {editing !== undefined && data && <CentroModal item={editing} sedes={data.sedes} sedeInicial={sedeId} onClose={() => setEditing(undefined)} onSaved={changed} notify={notify}/>} 
  </>
}

export default function CentrosCustoPage({ user, notify, onChanged }) {
  const [section, setSection] = useState('centros')
  return <>
    <div className="page-heading"><div><span className="eyebrow blue">ESTRUTURA</span><h1>Configurações</h1><p>Gerencie centros de custo e a disponibilidade do catálogo contábil.</p></div></div>
    <div className="settings-tabs"><button className={section === 'centros' ? 'active' : ''} onClick={() => setSection('centros')}><Building2 size={17}/> Centros de custo</button>{user.podeAdministrar && <button className={section === 'catalogos' ? 'active' : ''} onClick={() => setSection('catalogos')}><Database size={17}/> Grupos e contas</button>}</div>
    {section === 'centros' ? <CostCenters notify={notify} onChanged={onChanged}/> : user.podeAdministrar && <CatalogSettings notify={notify} onChanged={onChanged}/>}
  </>
}
