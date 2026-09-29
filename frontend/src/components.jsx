import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, LoaderCircle, AlertTriangle, Check, ChevronDown } from 'lucide-react'

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

export function FilterSelect({ options, value, onChange, placeholder = 'Todos', ariaLabel }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const selected = options.find((option) => String(option.value) === String(value))
  useEffect(() => {
    if (!open) return undefined
    const close = (event) => { if (!root.current?.contains(event.target)) setOpen(false) }
    const escape = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
  }, [open])
  return <div className={`filter-select ${open ? 'open' : ''}`} ref={root}>
    <button type="button" className="filter-select-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}><span>{selected?.label || placeholder}</span><ChevronDown size={16}/></button>
    {open && <div className="filter-select-options" role="listbox">
      {options.map((option) => {
        const active = String(option.value) === String(value)
        return <button type="button" role="option" aria-selected={active} className={active ? 'active' : ''} key={String(option.value)} onClick={() => { onChange(option.value); setOpen(false) }}><span>{option.label}</span>{active && <Check size={15}/>}</button>
      })}
    </div>}
  </div>
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
