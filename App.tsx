
import React, { useState, useEffect, useMemo } from 'react';
import { Customer, CustomerStatus, AuthState, AppStats } from './types';
import { authService, customerService } from './services/api';
import { supabase } from './lib/supabase';
import { Button } from './components/Button';
import { 
  PlusIcon, SearchIcon, UserIcon, PhoneIcon, 
  EditIcon, TrashIcon, DownloadIcon, LogoutIcon 
} from './components/Icons';

const App: React.FC = () => {
  const [auth, setAuth] = useState<AuthState>({ isLoggedIn: false, profile: null, loading: true });
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authForm, setAuthForm] = useState({ email: '', password: '', companyName: '', responsibleName: '', terms: false });
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  // Sistema Robusto de Autenticação e Sessão
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && mounted) {
          const profile = await authService.getProfile(session.user.id);
          setAuth({ isLoggedIn: true, profile, loading: false });
        } else if (mounted) {
          setAuth({ isLoggedIn: false, profile: null, loading: false });
        }
      } catch (e) {
        console.error("Erro na inicialização:", e);
        if (mounted) setAuth({ isLoggedIn: false, profile: null, loading: false });
      }
    };

    initializeAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN' && session?.user) {
        try {
          const profile = await authService.getProfile(session.user.id);
          setAuth({ isLoggedIn: true, profile, loading: false });
        } catch (e) {
          console.error("Erro ao obter perfil no evento SIGNED_IN:", e);
          setAuth({ isLoggedIn: true, profile: null, loading: false });
        }
      } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        setAuth({ isLoggedIn: false, profile: null, loading: false });
        setCustomers([]);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Apenas atualiza se necessário, sem mudar o loading se já estiver logado
        setAuth(prev => ({ ...prev, isLoggedIn: true }));
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (auth.isLoggedIn && auth.profile) {
      loadCustomers();
    }
  }, [auth.isLoggedIn, auth.profile?.id]); // Dependência no ID do perfil

  const loadCustomers = async () => {
    if (!auth.profile) return;
    try {
      const data = await customerService.fetchAll(auth.profile.id);
      setCustomers(data);
    } catch (err) {
      showNotify('Falha ao carregar lista de clientes.', 'error');
    }
  };

  const showNotify = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => 
      c.name?.toLowerCase().includes(search.toLowerCase()) || 
      c.phone?.includes(search)
    );
  }, [customers, search]);

  const stats = useMemo<AppStats>(() => ({
    total: customers.length,
    active: customers.filter(c => c.status === CustomerStatus.ACTIVE).length,
    inactive: customers.filter(c => c.status !== CustomerStatus.ACTIVE).length,
  }), [customers]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    
    setLoading(true);
    try {
      if (authMode === 'signup') {
        if (!authForm.terms) throw new Error("Você precisa aceitar os termos da LGPD.");
        await authService.signUp(authForm.email, authForm.password, authForm.companyName, authForm.responsibleName);
        showNotify('Cadastro realizado! Se o e-mail de confirmação estiver ativo, verifique sua caixa de entrada.', 'success');
        setAuthMode('login');
      } else {
        await authService.signIn(authForm.email, authForm.password);
        showNotify('Bem-vindo de volta!', 'success');
      }
    } catch (err: any) {
      showNotify(err.message || 'Erro ao processar autenticação.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!auth.profile) return;
    
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    
    try {
      const payload: Partial<Customer> = {
        id: editingCustomer?.id,
        empresa_id: auth.profile.id,
        name: formData.get('name') as string,
        phone: formData.get('phone') as string,
        email: formData.get('email') as string,
        status: formData.get('status') as CustomerStatus,
        registration_date: formData.get('date') as string,
        observations: formData.get('observations') as string,
        created_by: auth.profile.id,
        is_deleted: false
      };

      await customerService.save(payload);
      await loadCustomers();
      setShowForm(false);
      setEditingCustomer(null);
      showNotify('Alterações salvas com sucesso.');
    } catch (err) {
      showNotify('Erro ao salvar no servidor.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!auth.profile) return;
    if (!window.confirm('Atenção: Os dados deste cliente serão removidos permanentemente para atender à LGPD. Confirmar?')) return;
    
    setLoading(true);
    try {
      await customerService.hardDelete(id, auth.profile.id);
      setCustomers(prev => prev.filter(c => c.id !== id));
      showNotify('Cliente excluído permanentemente.');
    } catch (err) {
      showNotify('Falha ao deletar registro.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setLoading(true);
      await authService.signOut();
    } catch (err) {
      showNotify('Falha ao sair. Recarregue a página.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (customers.length === 0) return showNotify('Não há dados para exportar.', 'error');
    const headers = ['Nome', 'Telefone', 'E-mail', 'Status', 'Data Cadastro'];
    const content = customers.map(c => [c.name, c.phone, c.email, c.status, c.registration_date]);
    
    const csvContent = "\uFEFF" + [headers, ...content].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clientes_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    showNotify('CSV gerado com sucesso.');
  };

  // Preloader de Segurança
  if (auth.loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
           <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-600"></div>
           <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>
           </div>
        </div>
        <p className="text-slate-400 font-semibold text-xs uppercase tracking-widest animate-pulse">Autenticando sessão...</p>
      </div>
    </div>
  );

  // Interface de Login / Cadastro
  if (!auth.isLoggedIn) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50">
        <div className="w-full max-w-md bg-white rounded-[3rem] shadow-2xl p-10 border border-slate-100 animate-fade-in relative overflow-hidden">
          {loading && (
            <div className="absolute inset-0 bg-white/80 z-20 flex items-center justify-center backdrop-blur-[2px]">
              <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-indigo-600"></div>
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Processando...</span>
              </div>
            </div>
          )}
          
          <div className="mb-10 text-center">
            <div className="bg-indigo-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 text-white shadow-xl rotate-3">
              <UserIcon />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">
              {authMode === 'login' ? 'Bem-vindo' : 'Comece Agora'}
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
              Gestor de Clientes Pro • Cloud Sync
            </p>
          </div>
          
          <form onSubmit={handleAuth} className="space-y-4">
            {authMode === 'signup' && (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da sua Empresa</label>
                  <input required className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 focus:border-indigo-500 outline-none bg-slate-50/50 transition-all font-medium" placeholder="Ex: Salão da Maria" value={authForm.companyName} onChange={e => setAuthForm({...authForm, companyName: e.target.value})} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Responsável</label>
                  <input required className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 focus:border-indigo-500 outline-none bg-slate-50/50 transition-all font-medium" placeholder="Seu nome" value={authForm.responsibleName} onChange={e => setAuthForm({...authForm, responsibleName: e.target.value})} />
                </div>
              </>
            )}
            
            <div className="space-y-1">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail de Acesso</label>
               <input type="email" required className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 focus:border-indigo-500 outline-none bg-slate-50/50 transition-all font-medium" placeholder="seu@email.com" value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} />
            </div>

            <div className="space-y-1">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha Segura</label>
               <input type="password" required className="w-full px-6 py-4 rounded-2xl border-2 border-slate-50 focus:border-indigo-500 outline-none bg-slate-50/50 transition-all font-medium" placeholder="••••••••" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} />
            </div>
            
            {authMode === 'signup' && (
              <label className="flex items-start gap-4 px-2 py-3 cursor-pointer group hover:bg-slate-50 rounded-xl transition-colors">
                <input type="checkbox" required className="mt-1 w-5 h-5 rounded-lg border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" checked={authForm.terms} onChange={e => setAuthForm({...authForm, terms: e.target.checked})} />
                <span className="text-xs text-slate-500 leading-snug">Concordo com o armazenamento seguro dos dados conforme a <b>LGPD</b> e termos de uso.</span>
              </label>
            )}

            <Button type="submit" fullWidth className="py-5 text-lg shadow-2xl shadow-indigo-100 mt-4 font-bold" disabled={loading}>
              {authMode === 'login' ? 'Acessar Painel' : 'Criar Minha Conta'}
            </Button>
          </form>

          <button 
            type="button"
            disabled={loading}
            onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} 
            className="w-full mt-8 text-indigo-600 font-black text-xs uppercase tracking-widest hover:text-indigo-800 transition-colors disabled:opacity-50"
          >
            {authMode === 'login' ? 'Não tem conta? Cadastrar empresa' : 'Já possui conta? Fazer Login'}
          </button>
        </div>
        
        <p className="mt-8 text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em]">Proteção de Dados Nível Bancário</p>
      </div>
    );
  }

  // Dashboard Principal
  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      {notification && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] animate-slide-up">
          <div className={`px-8 py-4 rounded-full shadow-2xl text-white font-bold text-xs uppercase tracking-widest flex items-center gap-3 border-2 border-white/20 backdrop-blur-md ${notification.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
            {notification.message}
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 bg-white/70 backdrop-blur-2xl border-b border-slate-100 px-6 py-5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-indigo-100 rotate-2">
            {auth.profile?.company_name.charAt(0).toUpperCase() || 'E'}
          </div>
          <div className="overflow-hidden">
            <h1 className="text-sm font-black text-slate-900 truncate max-w-[160px] leading-tight tracking-tight uppercase">
              {auth.profile?.company_name || 'Minha Empresa'}
            </h1>
            <div className="flex items-center gap-1.5 mt-0.5">
               <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
               <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Sincronizado</p>
            </div>
          </div>
        </div>
        <button onClick={handleLogout} className="w-11 h-11 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all border border-transparent hover:border-red-100 active:scale-90">
          <LogoutIcon />
        </button>
      </header>

      <main className="px-6 py-10 space-y-10 max-w-4xl mx-auto">
        <div className="grid grid-cols-2 gap-5">
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col items-center hover:shadow-md transition-shadow cursor-default">
            <span className="text-slate-900 font-black text-4xl tracking-tighter">{stats.active}</span>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-2">Ativos</p>
          </div>
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm flex flex-col items-center hover:shadow-md transition-shadow cursor-default">
            <span className="text-slate-900 font-black text-4xl tracking-tighter">{stats.inactive}</span>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-2">Inativos</p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none text-slate-300 group-focus-within:text-indigo-500 transition-colors">
              <SearchIcon />
            </div>
            <input 
              type="text" 
              className="block w-full pl-16 pr-6 py-5 border-2 border-slate-50 rounded-3xl bg-white text-base font-medium focus:border-indigo-500 outline-none transition-all shadow-sm group-hover:shadow-md" 
              placeholder="Pesquisar por nome ou celular..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />
          </div>
          
          <Button variant="outline" onClick={exportCSV} className="w-full py-5 border-2 border-slate-100 rounded-3xl font-black text-[10px] uppercase tracking-widest text-slate-500 bg-white hover:bg-slate-50 transition-colors">
            <DownloadIcon /> Exportar para CSV (Portabilidade)
          </Button>
        </div>

        <div className="space-y-5">
          <div className="flex justify-between items-center px-4">
            <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Resultados</h3>
            {loading && <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-indigo-600"></div>}
          </div>
          
          {filteredCustomers.length > 0 ? (
            <div className="grid gap-5">
              {filteredCustomers.map((customer) => (
                <div key={customer.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:scale-[1.01] transition-all animate-fade-in group relative overflow-hidden">
                  <div className="flex justify-between items-start relative z-10">
                    <div className="flex-1 min-w-0 pr-6">
                      <h4 className="text-slate-900 font-black text-xl truncate leading-none group-hover:text-indigo-600 transition-colors">{customer.name}</h4>
                      <div className="flex items-center gap-2.5 text-slate-400 text-sm font-bold mt-3">
                        <div className="bg-slate-50 p-1.5 rounded-lg"><PhoneIcon /></div> {customer.phone}
                      </div>
                    </div>
                    <div className={`text-[9px] font-black px-4 py-2 rounded-2xl uppercase tracking-widest shadow-sm border border-white/50 ${
                      customer.status === CustomerStatus.ACTIVE ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                      customer.status === CustomerStatus.PENDING ? 'bg-amber-50 text-amber-600 border-amber-100' :
                      'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      {customer.status}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-8 pt-5 border-t border-slate-50 relative z-10">
                    <span className="text-[10px] text-slate-400 font-black uppercase tracking-tighter">Início: {new Date(customer.registration_date).toLocaleDateString()}</span>
                    <div className="flex gap-2.5">
                      <button onClick={() => { setEditingCustomer(customer); setShowForm(true); }} className="p-3.5 text-indigo-500 bg-indigo-50 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all active:scale-90 shadow-sm">
                        <EditIcon />
                      </button>
                      <button onClick={() => handleDelete(customer.id)} className="p-3.5 text-red-400 bg-red-50 rounded-2xl hover:bg-red-500 hover:text-white transition-all active:scale-90 shadow-sm">
                        <TrashIcon />
                      </button>
                    </div>
                  </div>
                  
                  {/* Detalhe estético lateral */}
                  <div className={`absolute left-0 top-0 bottom-0 w-2 ${
                    customer.status === CustomerStatus.ACTIVE ? 'bg-emerald-500/20' : 
                    customer.status === CustomerStatus.PENDING ? 'bg-amber-500/20' :
                    'bg-slate-500/10'
                  }`}></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-24 bg-white rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 mb-4">
                <SearchIcon />
              </div>
              <p className="text-slate-400 font-bold text-sm tracking-tight">Nenhum registro encontrado.</p>
              <Button onClick={() => setShowForm(true)} variant="outline" className="mt-6 mx-auto px-8 border-indigo-100 text-indigo-500 rounded-2xl font-black text-xs uppercase tracking-widest">Adicionar Primeiro Cliente</Button>
            </div>
          )}
        </div>
      </main>

      {!showForm && (
        <button 
          onClick={() => setShowForm(true)} 
          className="fixed bottom-10 right-8 w-20 h-20 bg-indigo-600 text-white rounded-[2rem] shadow-[0_20px_40px_-10px_rgba(79,70,229,0.4)] flex items-center justify-center z-50 transition-all hover:scale-110 active:scale-90 hover:rotate-6"
        >
          <PlusIcon />
        </button>
      )}

      {showForm && (
        <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-6 animate-fade-in">
          <div className="w-full max-w-2xl bg-white rounded-t-[3rem] sm:rounded-[3.5rem] shadow-2xl overflow-hidden animate-slide-up flex flex-col max-h-[94vh]">
            <div className="px-10 py-8 flex justify-between items-center border-b border-slate-50 bg-white sticky top-0 z-10 shadow-sm">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                  {editingCustomer ? 'Editar Cliente' : 'Novo Cadastro'}
                </h2>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-1">Isolamento Multi-empresa Ativo</p>
              </div>
              <button onClick={() => { setShowForm(false); setEditingCustomer(null); }} className="w-12 h-12 flex items-center justify-center bg-slate-50 text-slate-400 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-colors">✕</button>
            </div>

            <form onSubmit={handleSaveCustomer} className="flex-1 overflow-y-auto px-10 py-10 space-y-8 safe-bottom custom-scroll">
               <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo do Cliente</label>
                  <input name="name" required defaultValue={editingCustomer?.name} className="w-full px-7 py-5 rounded-3xl border-2 border-slate-50 focus:border-indigo-500 outline-none bg-slate-50/30 font-bold text-slate-800 placeholder:text-slate-300" placeholder="Nome completo" />
               </div>
               
               <div className="grid grid-cols-2 gap-6">
                 <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefone / WhatsApp</label>
                    <input name="phone" required defaultValue={editingCustomer?.phone} className="w-full px-7 py-5 rounded-3xl border-2 border-slate-50 focus:border-indigo-500 outline-none bg-slate-50/30 font-bold text-slate-800 placeholder:text-slate-300" placeholder="(00) 00000-0000" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Data de Início</label>
                    <input type="date" name="date" required defaultValue={editingCustomer?.registration_date || new Date().toISOString().split('T')[0]} className="w-full px-7 py-5 rounded-3xl border-2 border-slate-50 focus:border-indigo-500 outline-none bg-slate-50/30 font-bold text-slate-800" />
                 </div>
               </div>

               <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">E-mail para Contato (Opcional)</label>
                  <input name="email" type="email" defaultValue={editingCustomer?.email} className="w-full px-7 py-5 rounded-3xl border-2 border-slate-50 focus:border-indigo-500 outline-none bg-slate-50/30 font-bold text-slate-800 placeholder:text-slate-300" placeholder="cliente@email.com" />
               </div>

               <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Classificação Atual</label>
                  <select name="status" defaultValue={editingCustomer?.status || CustomerStatus.ACTIVE} className="w-full px-7 py-5 rounded-3xl border-2 border-slate-50 bg-slate-50 outline-none font-black text-slate-700 cursor-pointer appearance-none transition-all focus:border-indigo-500">
                    <option value={CustomerStatus.ACTIVE}>Status: ATIVO</option>
                    <option value={CustomerStatus.PENDING}>Status: PENDENTE</option>
                    <option value={CustomerStatus.INACTIVE}>Status: INATIVO</option>
                  </select>
               </div>

               <div className="space-y-2">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Anotações Privadas</label>
                  <textarea name="observations" rows={4} defaultValue={editingCustomer?.observations} className="w-full px-7 py-5 rounded-3xl border-2 border-slate-50 outline-none bg-slate-50/30 resize-none font-medium text-sm text-slate-600 placeholder:text-slate-300" placeholder="Informações adicionais importantes sobre o cliente..." />
               </div>

               <div className="pt-6">
                 <Button type="submit" fullWidth className="py-6 text-lg shadow-[0_20px_40px_-10px_rgba(79,70,229,0.3)] font-black uppercase tracking-widest" disabled={loading}>
                   {loading ? (
                     <div className="flex items-center gap-3">
                        <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-white"></div>
                        <span>Processando...</span>
                     </div>
                   ) : (editingCustomer ? 'Salvar Alterações' : 'Confirmar Cadastro')}
                 </Button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
