import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Save, Search, Trash2 } from 'lucide-react'
import { api } from './api.js'
import { Empty, FilterSelect, Loading, Modal } from './components.jsx'

function CentroModal({ item, sedes, sedeInicial, onClose, onSaved, notify }) {
  const [form, setForm] = useState({ nome: item?.nome || '', sedeId: String(item?.sedeId || sedeInicial || sedes[0]?.id || '') })
  const [loading, setLoading] = useState(false)
  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    try {
      const path = item ? `/api/centros-custo/${item.id}` : '/api/centros-custo'
      await api(path, { method: item ? 'PUT' : 'POST', body: JSON.stringify(form) })
      notify(item ? 'Centro de custo atualizado e auditado.' : 'Centro de custo criado e auditado.')
      await onSaved()
      onClose()
    } catch (error) { notify(error.message, 'error') } finally { setLoading(false) }
  }
  return <Modal title={item ? 'Editar centro de custo' : 'Novo centro de custo'} subtitle="A alteração ficará registrada na auditoria." onClose={onClose}>
    <form onSubmit={submit}>
      <div className="modal-body form-grid">
        <label className="full">Nome<input required maxLength="160" value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} placeholder="Nome do centro de custo" autoFocus/></label>
        <label className="full">Sede<select required value={form.sedeId} onChange={(event) => setForm({ ...form, sedeId: event.target.value })}><option value="">Selecione</option>{sedes.map((sede) => <option key={sede.id} value={sede.id}>{sede.nome}</option>)}</select></label>
      </div>
      <footer className="modal-footer"><button type="button" className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={loading}><Save size={17}/>{loading ? 'Salvando...' : 'Salvar'}</button></footer>
    </form>
  </Modal>
}

export default function CentrosCustoPage({ notify, onChanged }) {
  const [data, setData] = useState(null)
  const [search, setSearch] = useState('')
  const [sedeId, setSedeId] = useState('')
  const [editing, setEditing] = useState(undefined)
  const load = useCallback(async () => {
    try { setData(await api('/api/centros-custo')) } catch (error) { notify(error.message, 'error') }
  }, [notify])
  useEffect(() => { void load() }, [load])
  const filtered = useMemo(() => {
    if (!data) return []
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return data.centrosCusto.filter((item) => (!sedeId || String(item.sedeId) === sedeId) && (!term || `${item.nome} ${item.sede}`.toLocaleLowerCase('pt-BR').includes(term)))
  }, [data, search, sedeId])
  async function changed() {
    await load()
    await onChanged?.()
  }
  async function remove(item) {
    if (!window.confirm(`Excluir o centro de custo “${item.nome}” da sede ${item.sede}? Os lançamentos existentes serão preservados.`)) return
    try {
      await api(`/api/centros-custo/${item.id}`, { method: 'DELETE' })
      notify('Centro de custo excluído e registrado na auditoria.')
      await changed()
    } catch (error) { notify(error.message, 'error') }
  }
  return <>
    <div className="page-heading"><div><span className="eyebrow blue">ESTRUTURA</span><h1>Centros de custo</h1><p>Gerencie os centros de custo de cada sede sem alterar lançamentos existentes.</p></div><button className="primary" onClick={() => setEditing(null)}><Plus size={18}/> Novo centro de custo</button></div>
    <section className="panel filters cost-center-filters">
      <div className="search-field"><Search size={18}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar centro de custo ou sede"/></div>
      <label><span>Sede</span><FilterSelect options={[{ value: '', label: 'Todas as sedes' }, ...(data?.sedes || []).map((sede) => ({ value: String(sede.id), label: sede.nome }))]} value={sedeId} onChange={(value) => setSedeId(String(value))} ariaLabel="Filtrar sede"/></label>
    </section>
    <section className="panel data-panel">{!data ? <Loading/> : filtered.length ? <div className="table-scroll"><table><thead><tr><th>Centro de custo</th><th>Sede</th><th>Lançamentos vinculados</th><th>Ações</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.nome}</strong></td><td>{item.sede}</td><td>{item.quantidadeLancamentos}</td><td><div className="row-actions"><button className="icon-button" title="Editar" onClick={() => setEditing(item)}><Pencil size={17}/></button><button className="icon-button danger-text" title="Excluir" onClick={() => remove(item)}><Trash2 size={17}/></button></div></td></tr>)}</tbody></table></div> : <Empty title="Nenhum centro de custo encontrado" text="Ajuste os filtros ou cadastre um novo centro de custo."/>}</section>
    {editing !== undefined && data && <CentroModal item={editing} sedes={data.sedes} sedeInicial={sedeId} onClose={() => setEditing(undefined)} onSaved={changed} notify={notify}/>} 
  </>
}
