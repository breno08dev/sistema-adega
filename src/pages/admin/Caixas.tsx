import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Wallet, Lock, Unlock, Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// --- TIPOS ---
type SalePayment = { metodo_pagamento: string; valor: number };
type Sale = Database["public"]["Tables"]["sales"]["Row"] & { sale_payments?: SalePayment[] };
type Movement = Database["public"]["Tables"]["movements"]["Row"];

type CaixaRow = Database["public"]["Tables"]["caixas"]["Row"] & { 
  profiles: { nome: string } | null;
  totalVendasCalculado?: number;
};

// ATUALIZADO: Inclui fiado
const paymentMethodLabels: Record<string, string> = { 
    dinheiro: "Dinheiro", 
    pix: "Pix", 
    cartao_credito: "Crédito", 
    cartao_debito: "Débito",
    fiado: "Crediário"
};

export default function AdminCaixas() {
  const [caixas, setCaixas] = useState<CaixaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  useEffect(() => { loadCaixas(); }, []);

  const loadCaixas = async () => {
    setLoading(true);
    
    try {
        // 1. Busca os últimos 100 caixas
        const { data: caixasData, error: caixasError } = await supabase
            .from('caixas')
            .select('*, profiles(nome)')
            .order('data_abertura', { ascending: false })
            .limit(100); 

        if (caixasError) throw caixasError;
        
        if (!caixasData || caixasData.length === 0) {
            setCaixas([]);
            return;
        }

        const caixaIds = caixasData.map(c => c.id);

        // 2. BUSCA EM LOOP (Fura o bloqueio de 1000 linhas do Supabase)
        let allSalesData: any[] = [];
        let hasMore = true;
        let offset = 0;

        while (hasMore) {
            const { data: salesChunk, error: salesError } = await supabase
                .from('sales')
                .select('caixa_id, total, metodo_pagamento, sale_payments(metodo_pagamento, valor)')
                .eq('status', 'finalizada')
                .in('caixa_id', caixaIds)
                .range(offset, offset + 999);
                
            if (salesError) throw salesError;

            if (!salesChunk || salesChunk.length === 0) {
                hasMore = false;
            } else {
                allSalesData = [...allSalesData, ...salesChunk];
                if (salesChunk.length < 1000) hasMore = false;
                else offset += 1000;
            }
        }

        // 3. Busca Recebimentos de Crediário do turno
        const { data: credPgtosChunk } = await supabase
            .from('crediario_pagamentos')
            .select('caixa_id, valor')
            .in('caixa_id', caixaIds);

        // 4. Agrupa e soma os totais localmente
        const salesTotalsByCaixa = allSalesData.reduce((acc: Record<string, number>, sale) => {
            const cId = sale.caixa_id;
            if (!cId) return acc;
            
            let val = 0;
            if (sale.sale_payments && sale.sale_payments.length > 0) {
                sale.sale_payments.forEach((p: any) => { 
                    if (p.metodo_pagamento !== 'fiado') val += Number(p.valor); 
                });
            } else {
                if (sale.metodo_pagamento !== 'fiado') val = Number(sale.total || 0);
            }
            
            acc[cId] = (acc[cId] || 0) + val;
            return acc;
        }, {});

        // Soma os recebimentos de fiado ao faturamento do caixa
        if (credPgtosChunk) {
            credPgtosChunk.forEach(p => {
                if (p.caixa_id) salesTotalsByCaixa[p.caixa_id] = (salesTotalsByCaixa[p.caixa_id] || 0) + Number(p.valor);
            });
        }

        // 5. Junta os dados para a tabela
        const caixasProcessados = caixasData.map(caixa => ({
            ...caixa,
            totalVendasCalculado: salesTotalsByCaixa[caixa.id] || 0
        }));

        setCaixas(caixasProcessados as CaixaRow[]);
        
    } catch (e) {
        toast.error("Erro ao carregar caixas antigos.");
    } finally {
        setLoading(false);
    }
  };

  const generateCaixaPDF = async (caixa: CaixaRow) => {
    setGeneratingId(caixa.id);
    toast.info("A gerar relatório PDF...");

    try {
      // Vendas normais
      const { data: salesData } = await supabase.from('sales').select('*, sale_payments(metodo_pagamento, valor)').eq('caixa_id', caixa.id).eq('status', 'finalizada');
      const sales = (salesData as any[]) || [];

      // Recebimentos de Crediário
      const { data: credPgtosData } = await supabase.from('crediario_pagamentos').select('*, crediarios(clients(nome))').eq('caixa_id', caixa.id);
      const credPgtos = credPgtosData || [];

      // Movimentações (Entradas/Saídas)
      let movQuery = supabase.from('movements').select('*').eq('responsavel_id', caixa.colaborador_id).gte('created_at', caixa.data_abertura);
      if (caixa.data_fechamento) movQuery = movQuery.lte('created_at', caixa.data_fechamento);
      const { data: movementsData } = await movQuery;
      const movements = (movementsData as Movement[]) || [];

      // Lógica de Soma (Ignora fiado nas vendas, soma os recebimentos)
      let tVendas = 0; let tDinheiro = 0; let tPix = 0; let tCartao = 0;
      
      sales.forEach(sale => {
        if (sale.sale_payments && sale.sale_payments.length > 0) {
          sale.sale_payments.forEach((payment: any) => {
              if (payment.metodo_pagamento === 'fiado') return; // Ignora fiado
              const val = Number(payment.valor);
              tVendas += val;
              if (payment.metodo_pagamento === 'dinheiro') tDinheiro += val;
              else if (payment.metodo_pagamento === 'pix') tPix += val;
              else if (['cartao_credito', 'cartao_debito'].includes(payment.metodo_pagamento)) tCartao += val;
          });
        } else {
          if (sale.metodo_pagamento === 'fiado') return; // Ignora fiado
          const val = Number(sale.total) || 0;
          tVendas += val;
          if (sale.metodo_pagamento === 'dinheiro') tDinheiro += val;
          else if (sale.metodo_pagamento === 'pix') tPix += val;
          else if (['cartao_credito', 'cartao_debito'].includes(sale.metodo_pagamento || '')) tCartao += val;
        }
      });

      // Adiciona o Fiado que foi RECEBIDO no dia
      credPgtos.forEach(pgto => {
          const val = Number(pgto.valor);
          tVendas += val; 
          if (pgto.metodo_pagamento === 'dinheiro') tDinheiro += val;
          else if (pgto.metodo_pagamento === 'pix') tPix += val;
          else if (['cartao_credito', 'cartao_debito'].includes(pgto.metodo_pagamento)) tCartao += val;
      });

      let tEntradas = 0; let tSaidas = 0;
      movements.forEach(mov => {
        if (mov.tipo === 'entrada') tEntradas += Number(mov.valor);
        else if (mov.descricao !== 'Fechamento de Caixa') tSaidas += Number(mov.valor); 
      });
      const saldoFisico = tEntradas + tDinheiro - tSaidas;

      // Histórico Unificado para a Tabela PDF
      const historicoUnificado: any[] = [];
      sales.forEach(sale => {
          let pgtoTexto = 'N/A';
          // AGORA SÓ É MISTO SE TIVER MAIS DE 1 PAGAMENTO
          if (sale.sale_payments && sale.sale_payments.length > 1) {
              pgtoTexto = "Misto (" + sale.sale_payments.map((p: any) => paymentMethodLabels[p.metodo_pagamento]).join(", ") + ")";
          } else if (sale.sale_payments && sale.sale_payments.length === 1) {
              pgtoTexto = paymentMethodLabels[sale.sale_payments[0].metodo_pagamento];
          } else if (sale.metodo_pagamento) {
              pgtoTexto = paymentMethodLabels[sale.metodo_pagamento];
          }

          historicoUnificado.push({ tipo: 'venda', data: sale.updated_at || sale.created_at, descricao: sale.nome_cliente || "Cliente Balcão", pagamentoTexto: pgtoTexto, valor: Number(sale.total) || 0 });
      });

      credPgtos.forEach(pgto => {
          historicoUnificado.push({ tipo: 'recebimento_fiado', data: pgto.created_at, descricao: `Rec. Crediário - ${pgto.crediarios?.clients?.nome || 'Cliente'}`, pagamentoTexto: paymentMethodLabels[pgto.metodo_pagamento], valor: Number(pgto.valor) });
      });

      movements.forEach(mov => {
          if (mov.tipo === 'saida' && mov.descricao.includes('[Sangria]')) {
              historicoUnificado.push({ tipo: 'sangria', data: mov.created_at, descricao: mov.descricao, pagamentoTexto: "Sangria (Saída)", valor: Number(mov.valor) || 0 });
          }
      });
      historicoUnificado.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

      // --- PDF PREMIUM PADRÃO CONECT NEW ---
      const doc = new jsPDF();
      const dataAbertura = format(new Date(caixa.data_abertura), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Relatório de Fechamento de Turno", 14, 20);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Colaborador: ${caixa.profiles?.nome || 'Desconhecido'}`, 14, 28);
      doc.text(`Abertura do Caixa: ${dataAbertura}`, 14, 34);
      if (caixa.data_fechamento) doc.text(`Fechamento do Caixa: ${format(new Date(caixa.data_fechamento), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, 14, 40);
      
      doc.line(14, 45, 196, 45); 

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Resumo Financeiro:", 14, 55);
      
      doc.setFont("helvetica", "normal");
      autoTable(doc, {
          startY: 60,
          theme: 'grid',
          headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
          bodyStyles: { textColor: 50 },
          columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
          body: [
              ['Total de Faturamento (Vendas e Recebimentos)', `R$ ${tVendas.toFixed(2)}`],
              ['Dinheiro', `R$ ${tDinheiro.toFixed(2)}`],
              ['Pix', `R$ ${tPix.toFixed(2)}`],
              ['Cartão', `R$ ${tCartao.toFixed(2)}`],
              ['Abertura / Entradas (Fundo de Caixa)', `R$ ${tEntradas.toFixed(2)}`],
              ['Saídas / Sangrias', `R$ ${tSaidas.toFixed(2)}`],
          ],
      });

      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFillColor(240, 240, 240); 
      doc.rect(14, finalY, 182, 12, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text("SALDO FINAL ESPERADO NA GAVETA:", 18, finalY + 8);
      doc.text(`R$ ${saldoFisico.toFixed(2)}`, 140, finalY + 8);

      doc.line(14, finalY + 20, 196, finalY + 20); 

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Histórico Detalhado de Movimentações:", 14, finalY + 30);
      
      const historyBody = historicoUnificado.map(item => [
        format(new Date(item.data), "HH:mm"),
        item.descricao,
        item.pagamentoTexto, 
        `${item.tipo === 'sangria' ? '- ' : ''}R$ ${item.valor.toFixed(2)}`
      ]);
      
      autoTable(doc, {
        startY: finalY + 35,
        theme: 'striped',
        headStyles: { fillColor: [100, 116, 139], textColor: 255 },
        head: [['Hora', 'Cliente / Descrição', 'Pagamento/Tipo', 'Valor']], 
        body: historyBody,
      });

      doc.save(`Turno_${caixa.profiles?.nome || 'Caixa'}_${format(new Date(caixa.data_abertura), "dd-MM")}.pdf`);
      toast.success("PDF gerado com sucesso!");
    } catch (e: any) {
      toast.error("Erro ao gerar PDF", { description: e.message });
    } finally {
      setGeneratingId(null);
    }
  };

  return (
    <div className="space-y-4 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-10 px-1 md:px-0">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
           <Wallet className="h-6 w-6 md:h-8 md:w-8 text-primary" /> Fechamentos
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground">Acompanhe os caixas e gere relatórios detalhados antigos.</p>
      </div>

      <Card className="border border-border bg-card shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border p-4 md:pb-4">
          <CardTitle className="text-base md:text-lg text-foreground">Registo de Turnos (Admin)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50 border-border">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="pl-4 md:pl-6 text-xs md:text-sm w-[130px] md:w-[180px] text-muted-foreground">Abertura</TableHead>
                  <TableHead className="text-xs md:text-sm text-muted-foreground">Colaborador</TableHead>
                  <TableHead className="text-xs md:text-sm text-muted-foreground">Status</TableHead>
                  <TableHead className="hidden sm:table-cell text-xs md:text-sm text-muted-foreground">Fecho</TableHead>
                  <TableHead className="text-right text-xs md:text-sm text-muted-foreground">Faturamento</TableHead>
                  <TableHead className="text-center pr-4 md:pr-6 text-xs md:text-sm text-muted-foreground">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 animate-pulse text-sm text-muted-foreground">A carregar turnos antigos...</TableCell></TableRow>
                ) : caixas.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-xs md:text-sm text-muted-foreground">Nenhum turno registado.</TableCell></TableRow>
                ) : (
                  caixas.map((caixa) => (
                    <TableRow key={caixa.id} className="hover:bg-muted/30 border-border transition-colors">
                      <TableCell className="pl-4 md:pl-6 font-medium text-muted-foreground text-[11px] md:text-sm whitespace-nowrap">
                        {format(new Date(caixa.data_abertura), "dd/MM/yy HH:mm")}
                      </TableCell>
                      <TableCell className="font-semibold text-foreground text-[11px] md:text-sm truncate max-w-[90px] md:max-w-none">
                        {caixa.profiles?.nome || "Sistema"}
                      </TableCell>
                      <TableCell>
                        {caixa.status === 'aberto' ? 
                          <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 gap-1 text-[10px] md:text-xs px-1.5 md:px-2.5 shadow-none">
                            <Unlock className="h-3 w-3"/> Aberto
                          </Badge> : 
                          <Badge className="bg-muted/50 text-muted-foreground border-border hover:bg-muted gap-1 text-[10px] md:text-xs px-1.5 md:px-2.5 shadow-none">
                            <Lock className="h-3 w-3"/> Fechado
                          </Badge>}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[11px] md:text-sm hidden sm:table-cell whitespace-nowrap">
                         {caixa.data_fechamento ? format(new Date(caixa.data_fechamento), "dd/MM/yy HH:mm") : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold text-foreground text-[11px] md:text-sm whitespace-nowrap">
                         R$ {Number(caixa.totalVendasCalculado || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-center pr-4 md:pr-6">
                         <Button 
                            size="sm" 
                            variant="outline" 
                            className="bg-background text-primary border-primary/20 hover:bg-primary/10 px-2 md:px-3 h-8 md:h-9 shadow-sm" 
                            onClick={() => generateCaixaPDF(caixa)} 
                            disabled={generatingId === caixa.id}
                         >
                            {generatingId === caixa.id ? (
                                <span className="animate-pulse text-xs">...</span>
                            ) : (
                                <>
                                  <Download className="h-4 w-4 md:mr-2" /> 
                                  <span className="hidden md:inline text-sm">Gerar PDF</span>
                                </>
                            )}
                         </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}