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
import { FileText, Wallet, Lock, Unlock, Download } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type CaixaRow = Database["public"]["Tables"]["caixas"]["Row"] & { profiles: { nome: string } | null };
type PaymentMethod = Database["public"]["Enums"]["payment_method"];
type SalePayment = { metodo_pagamento: PaymentMethod; valor: number };
type Sale = Database["public"]["Tables"]["sales"]["Row"] & { sale_payments?: SalePayment[] };
type Movement = Database["public"]["Tables"]["movements"]["Row"];

const paymentMethodLabels: Record<PaymentMethod, string> = { dinheiro: "Dinheiro", pix: "Pix", cartao_credito: "Crédito", cartao_debito: "Débito" };

export default function AdminCaixas() {
  const [caixas, setCaixas] = useState<CaixaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  useEffect(() => { loadCaixas(); }, []);

  const loadCaixas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('caixas')
      .select('*, profiles(nome)')
      .order('data_abertura', { ascending: false })
      .limit(100); 

    if (error) toast.error("Erro ao carregar caixas");
    else setCaixas(data as CaixaRow[]);
    setLoading(false);
  };

  const generateCaixaPDF = async (caixa: CaixaRow) => {
    setGeneratingId(caixa.id);
    toast.info("A gerar relatório PDF...");

    try {
      const { data: salesData } = await supabase.from('sales').select('*, sale_payments(metodo_pagamento, valor)').eq('caixa_id', caixa.id).eq('status', 'finalizada');
      const sales = (salesData as Sale[]) || [];

      let movQuery = supabase.from('movements').select('*').eq('responsavel_id', caixa.colaborador_id).gte('created_at', caixa.data_abertura);
      if (caixa.data_fechamento) movQuery = movQuery.lte('created_at', caixa.data_fechamento);
      const { data: movementsData } = await movQuery;
      const movements = (movementsData as Movement[]) || [];

      let tVendas = 0; let tDinheiro = 0; let tPix = 0; let tCartao = 0;
      sales.forEach(sale => {
        tVendas += Number(sale.total) || 0;
        if (sale.sale_payments && sale.sale_payments.length > 0) {
          sale.sale_payments.forEach(payment => {
              const val = Number(payment.valor);
              if (payment.metodo_pagamento === 'dinheiro') tDinheiro += val;
              else if (payment.metodo_pagamento === 'pix') tPix += val;
              else if (['cartao_credito', 'cartao_debito'].includes(payment.metodo_pagamento)) tCartao += val;
          });
        } else {
          const val = Number(sale.total) || 0;
          if (sale.metodo_pagamento === 'dinheiro') tDinheiro += val;
          else if (sale.metodo_pagamento === 'pix') tPix += val;
          else if (['cartao_credito', 'cartao_debito'].includes(sale.metodo_pagamento || '')) tCartao += val;
        }
      });

      let tEntradas = 0; let tSaidas = 0;
      movements.forEach(mov => {
        if (mov.tipo === 'entrada') tEntradas += Number(mov.valor);
        else if (mov.descricao !== 'Fechamento de Caixa') tSaidas += Number(mov.valor); 
      });
      const saldoFisico = tDinheiro + tEntradas - tSaidas;

      const historicoUnificado = [];
      sales.forEach(sale => {
          let pgtoTexto = 'N/A';
          if (sale.sale_payments && sale.sale_payments.length > 0) pgtoTexto = "Misto (" + sale.sale_payments.map(p => paymentMethodLabels[p.metodo_pagamento]).join(", ") + ")";
          else if (sale.metodo_pagamento) pgtoTexto = paymentMethodLabels[sale.metodo_pagamento];

          historicoUnificado.push({ tipo: 'venda', data: sale.updated_at || sale.created_at, descricao: sale.nome_cliente || "Cliente Balcão", pagamentoTexto: pgtoTexto, valor: Number(sale.total) || 0 });
      });

      movements.forEach(mov => {
          if (mov.tipo === 'saida' && mov.descricao.includes('[Sangria]')) {
              historicoUnificado.push({ tipo: 'sangria', data: mov.created_at, descricao: mov.descricao, pagamentoTexto: "Sangria (Saída)", valor: Number(mov.valor) || 0 });
          }
      });
      historicoUnificado.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

      const doc = new jsPDF();
      doc.text("Relatório de Turno (Admin)", 14, 16);
      doc.setFontSize(10);
      doc.text(`Abertura: ${format(new Date(caixa.data_abertura), "dd/MM/yyyy HH:mm")}`, 14, 22);
      doc.text(`Colaborador: ${caixa.profiles?.nome || 'Desconhecido'}`, 14, 28);
      if (caixa.data_fechamento) doc.text(`Fecho: ${format(new Date(caixa.data_fechamento), "dd/MM/yyyy HH:mm")}`, 100, 22);
      
      const historyBody = historicoUnificado.map(item => [
        format(new Date(item.data), "HH:mm"),
        item.descricao,
        item.pagamentoTexto, 
        `${item.tipo === 'sangria' ? '- ' : ''}R$ ${item.valor.toFixed(2)}`
      ]);
      
      autoTable(doc, { startY: 35, head: [['Hora', 'Cliente / Descrição', 'Pagamento/Tipo', 'Valor']], body: historyBody });

      const lastY = (doc as any).lastAutoTable.finalY + 10;
      doc.text("Resumo Financeiro:", 14, lastY);
      autoTable(doc, {
          startY: lastY + 5,
          body: [
              ['Dinheiro (Vendas)', `R$ ${tDinheiro.toFixed(2)}`],
              ['Pix', `R$ ${tPix.toFixed(2)}`],
              ['Cartão', `R$ ${tCartao.toFixed(2)}`],
              ['Abertura/Entradas', `R$ ${tEntradas.toFixed(2)}`],
              ['Saídas/Sangrias', `R$ ${tSaidas.toFixed(2)}`],
              ['SALDO DA GAVETA', `R$ ${saldoFisico.toFixed(2)}`],
          ]
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
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
           <Wallet className="h-6 w-6 md:h-8 md:w-8 text-primary" /> Fechamentos
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground">Acompanhe os caixas e gere relatórios de dias passados.</p>
      </div>

      <Card className="border-none shadow-sm ring-1 ring-gray-200 dark:ring-gray-800 overflow-hidden">
        <CardHeader className="bg-gray-50/30 dark:bg-gray-900/30 border-b p-4 md:pb-4"><CardTitle className="text-base md:text-lg">Registo de Turnos</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-50/50 dark:bg-gray-900/50">
                <TableRow>
                  <TableHead className="pl-4 md:pl-6 text-xs md:text-sm w-[130px] md:w-[180px]">Abertura</TableHead>
                  <TableHead className="text-xs md:text-sm">Colaborador</TableHead>
                  <TableHead className="text-xs md:text-sm">Status</TableHead>
                  {/* Esconde a data de Fecho no celular para poupar espaço */}
                  <TableHead className="hidden sm:table-cell text-xs md:text-sm">Fecho</TableHead>
                  <TableHead className="text-right text-xs md:text-sm">Gaveta</TableHead>
                  <TableHead className="text-center pr-4 md:pr-6 text-xs md:text-sm">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 animate-pulse text-sm">A carregar turnos...</TableCell></TableRow>
                ) : caixas.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-10 text-xs md:text-sm text-muted-foreground">Nenhum turno registado.</TableCell></TableRow>
                ) : (
                  caixas.map((caixa) => (
                    <TableRow key={caixa.id} className="hover:bg-muted/30">
                      <TableCell className="pl-4 md:pl-6 font-medium text-muted-foreground text-[11px] md:text-sm whitespace-nowrap">
                        {format(new Date(caixa.data_abertura), "dd/MM/yy HH:mm")}
                      </TableCell>
                      <TableCell className="font-semibold text-[11px] md:text-sm truncate max-w-[90px] md:max-w-none">
                        {caixa.profiles?.nome || "Sistema"}
                      </TableCell>
                      <TableCell>
                        {caixa.status === 'aberto' ? 
                          <Badge className="bg-green-500 hover:bg-green-600 gap-1 text-[10px] md:text-xs px-1.5 md:px-2.5"><Unlock className="h-3 w-3"/> Aberto</Badge> : 
                          <Badge variant="secondary" className="gap-1 text-[10px] md:text-xs px-1.5 md:px-2.5"><Lock className="h-3 w-3"/> Fechado</Badge>}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-[11px] md:text-sm hidden sm:table-cell whitespace-nowrap">
                         {caixa.data_fechamento ? format(new Date(caixa.data_fechamento), "dd/MM/yy HH:mm") : '-'}
                      </TableCell>
                      <TableCell className="text-right font-bold text-[11px] md:text-sm whitespace-nowrap">
                         {caixa.status === 'fechado' ? `R$ ${Number(caixa.valor_fechamento || 0).toFixed(2)}` : 'Em uso'}
                      </TableCell>
                      <TableCell className="text-center pr-4 md:pr-6">
                         <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50 px-2 md:px-3 h-8 md:h-9" onClick={() => generateCaixaPDF(caixa)} disabled={generatingId === caixa.id}>
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