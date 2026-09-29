import { useState } from 'react'
import { ArrowRight, BarChart3, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'
import { api, setToken } from './api.js'

export default function LoginPage({ onLogin }) {
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event) {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ login, senha }) })
      setToken(data.token); onLogin(data.usuario)
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  return <main className="login-page">
    <section className="login-brand">
      <div className="brand-mark large"><BarChart3/></div>
      <div className="login-brand-copy"><span className="eyebrow">ÔMEGA DISTRIBUIDORA</span><h1>Controle claro.<br/>Decisões melhores.</h1><p>Uma visão simples e segura dos lançamentos da empresa, de qualquer sede.</p></div>
      <div className="security-note"><ShieldCheck size={22}/><div><strong>Ambiente protegido</strong><span>Acesso individual e histórico completo de alterações.</span></div></div>
    </section>
    <section className="login-panel">
      <form className="login-card" onSubmit={submit}>
        <div className="mobile-logo"><div className="brand-mark"><BarChart3/></div><strong>Lançamentos</strong></div>
        <span className="eyebrow blue">BEM-VINDO</span><h2>Acesse sua conta</h2><p>Use suas credenciais locais para continuar.</p>
        <label>Login<div className="input-icon"><UserRound size={18}/><input autoFocus value={login} onChange={(e) => setLogin(e.target.value)} placeholder="seu.login"/></div></label>
        <label>Senha<div className="input-icon"><LockKeyhole size={18}/><input type={show ? 'text' : 'password'} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Sua senha"/><button type="button" onClick={() => setShow(!show)} aria-label="Mostrar senha">{show ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary login-button" disabled={loading}>{loading ? 'Entrando...' : <>Entrar <ArrowRight size={18}/></>}</button>
        <small>Em produção, o acesso será realizado pelo SSO do Ecossistema Ômega.</small>
      </form>
    </section>
  </main>
}
