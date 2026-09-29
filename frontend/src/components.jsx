import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, LoaderCircle, AlertTriangle } from 'lucide-react'

const searchableLabel = (option) => option ? `${option.codigo ? `${option.codigo} — ` : ''}${option.nome}` : ''

export function Modal({ title, subtitle, children, onClose, wide = false }) {
  useEffect(() => {
    const handler = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={20}/></button></header>
        {children}
      </section>
    </div>, document.getElementById('modal-root'),
  )
}

export function Loading({ label = 'Carregando...' }) {
  return <div className="loading"><LoaderCircle className="spin" size={24}/><span>{label}</span></div>
}

export function Empty({ title = 'Nenhum registro encontrado', text = 'Tente ajustar os filtros ou inclua um novo lançamento.' }) {
  return <div className="empty"><div className="empty-icon"><AlertTriangle size={22}/></div><strong>{title}</strong><span>{text}</span></div>
}

export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined
    const id = setTimeout(onClose, 4200)
    return () => clearTimeout(id)
  }, [toast, onClose])
  return toast ? <div className={`toast ${toast.type || 'success'}`}><span>{toast.message}</span><button onClick={onClose}><X size={16}/></button></div> : null
}

export function SearchableSelect({ options, value, onChange, placeholder = 'Selecione', disabled = false }) {
  const selected = options.find((option) => String(option.id) === String(value))
  const [query, setQuery] = useState(searchableLabel(selected))
  const [open, setOpen] = useState(false)
  useEffect(() => { setQuery(searchableLabel(selected)) }, [selected])
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR')
    if (!term || (selected && term === searchableLabel(selected).toLocaleLowerCase('pt-BR'))) return options
    return options.filter((option) => `${option.codigo || ''} ${option.nome}`.toLocaleLowerCase('pt-BR').includes(term))
  }, [options, query, selected])
  return <div className={`searchable-select ${open ? 'open' : ''}`}>
    <input
      value={query}
      disabled={disabled}
      placeholder={placeholder}
      autoComplete="off"
      onFocus={(event) => { setOpen(true); event.currentTarget.select() }}
      onBlur={() => setTimeout(() => { setOpen(false); setQuery(searchableLabel(selected)) }, 120)}
      onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
        if (event.key === 'Enter' && open && filtered[0]) { event.preventDefault(); onChange(filtered[0].id); setQuery(searchableLabel(filtered[0])); setOpen(false) }
      }}
    />
    {open && !disabled && <div className="searchable-options" role="listbox">
      {filtered.length ? filtered.slice(0, 100).map((option) => <button type="button" role="option" aria-selected={String(option.id) === String(value)} key={option.id} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(option.id); setQuery(searchableLabel(option)); setOpen(false) }}><strong>{option.codigo}</strong><span>{option.nome}</span></button>) : <div className="searchable-empty">Nenhuma opção encontrada</div>}
    </div>}
  </div>
}
