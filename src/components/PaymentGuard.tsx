import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface PaymentGuardProps {
  children: React.ReactNode;
}

export const PaymentGuard = ({ children }: PaymentGuardProps) => {
  const [loading, setLoading] = useState(true);
  const [isPaid, setIsPaid] = useState(true);

  useEffect(() => {
    // 1. Consulta inicial
    const checkStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('assinatura')
          .select('ativo')
          .eq('id', 1)
          .single();

        if (!error && data) {
          setIsPaid(data.ativo);
        }
      } catch (err) {
        console.error("Erro ao validar assinatura:", err);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();

    // 2. Configuração do Realtime para bloquear "na hora"
    const channel = supabase
      .channel('assinatura_status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'assinatura',
          filter: 'id=eq.1'
        },
        (payload) => {
          // Quando houver um update na tabela, atualiza o estado na hora
          setIsPaid(payload.new.ativo);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen bg-[#0a0a0a] items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isPaid) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#18181b] border border-red-900/30 rounded-xl p-8 text-center shadow-2xl animate-in fade-in zoom-in duration-300">
          <div className="w-16 h-16 bg-red-950/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-100 mb-4 uppercase tracking-tighter">Acesso Suspenso</h1>
          <p className="text-gray-400 mb-8 text-sm leading-relaxed">
            Sua mensalidade está vencida. Para liberação imediata, contate o suporte e regularize suas pendências.
          </p>
          <a 
            href="https://wa.me/5516988392871" 
            target="_blank"
            className="inline-block w-full bg-[#3b82f6] hover:bg-[#2563eb] text-white font-bold py-3 rounded-md transition-all duration-200"
          >
            FALAR COM SUPORTE
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};