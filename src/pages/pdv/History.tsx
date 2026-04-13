import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Lock, ChevronDown, Wallet, CreditCard, Smartphone, DollarSign, TrendingUp, ArrowUpCircle, Receipt, MinusCircle, FileText, AlertTriangle } from "lucide-react"; 
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Tipos definidos para aceitar 'fiado'
type PaymentMethod = "dinheiro" | "pix" | "cartao_credito" | "cartao_debito" | "fiado";
type SalePayment = { metodo_pagamento: PaymentMethod; valor: number };
type Sale = any; 
type Movement = any;
type Caixa = any;
type SaleItem = any;

const paymentMethodLabels: Record<string, string> = { 
  dinheiro: "Dinheiro", 
  pix: "Pix", 
  cartao_credito: "Crédito", 
  cartao_debito: "Débito", 
  fiado: "CREDIÁRIO" 
};

export default function CollaboratorHistory() {
  const { user, userName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Sale[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]); 
  const [credPgtos, setCredPgtos] = useState<any[]>([]); // Pagamentos parciais ou totais de Fiado
  const [caixaAberto, setCaixaAberto] = useState<Caixa | null>(null);
  
  const [isCloseCaixaAlertOpen, setIsCloseCaixaAlertOpen] = useState(false);
  const [isSangriaModalOpen, setIsSangriaModalOpen] = useState(false);
  const [sangriaValor, setSangriaValor] = useState("");
  const [sangriaDescricao, setSangriaDescricao] = useState("");
  const [isSubmittingSangria, setIsSubmittingSangria] = useState(false);

  const checkCaixaAberto = async () => {
    if (!user) return;
    setLoading(true);
    
    const { data: caixaData, error: caixaError } = await supabase
      .from('caixas')
      .select('*')
      .eq('colaborador_id', user.id)
      .eq('status', 'aberto')
      .single();

    if (caixaError && caixaError.code !== 'PGRST116') { 
        toast.error("Erro ao verificar status do caixa"); 
        setLoading(false); 
        return; 
    }

    if (caixaData) {
      setCaixaAberto(caixaData);
      await Promise.all([
        loadSales(caixaData.data_abertura),
        loadMovements(caixaData.data_abertura),
        loadCredPgtos(caixaData.id) // Carrega recebimentos do Crediário deste caixa
      ]);
    } else { 
        setCaixaAberto(null); 
        setSales([]); 
        setMovements([]); 
        setCredPgtos([]); 
    }
    setLoading(false);
  };
  
  useEffect(() => { if (user) checkCaixaAberto(); }, [user]);

  const loadSales = async (dataInicio: string) => {
    if (!user) return;
    const { data } = await supabase
      .from('sales')
      .select('*, sale_payments(metodo_pagamento, valor)')
      .eq('colaborador_id', user.id)
      .eq('status', 'finalizada')
      .gte('updated_at', dataInicio)
      .order('updated_at', { ascending: false });
      
    if (data) setSales(data);
  };

  const loadMovements = async (dataInicio: string) => {
    if (!user) return;
    const { data } = await supabase
      .from('movements')
      .select('*')
      .eq('responsavel_id', user.id)
      .gte('created_at', dataInicio)
      .order('created_at', { ascending: false });
      
    if (data) setMovements(data);
  };

  // BUSCA OS PAGAMENTOS DE FIADO (Mesmo que a pessoa pague só R$ 10, vai aparecer aqui)
  const loadCredPgtos = async (caixaId: string) => {
    const { data } = await supabase
      .from('crediario_pagamentos')
      .select(`
          id, valor, metodo_pagamento, created_at,
          crediarios ( clients ( nome ) )
      `)
      .eq('caixa_id', caixaId);
      
    if (data) setCredPgtos(data);
  };

  const { totalVendas, totalEntradasAbertura, totalSaidasSangria, totalDinheiroVendas, totalPix, totalCartao, saldoFisico } = useMemo(() => {
    let tVendas = 0; let tDinheiro = 0; let tPix = 0; let tCartao = 0;

    // 1. Soma das Vendas normais (IGNORA OS VALORES DE FIADO PARA NÃO DUPLICAR FATURAMENTO)
    sales.forEach(sale => {
      if (sale.sale_payments && sale.sale_payments.length > 0) {
        sale.sale_payments.forEach((payment: any) => {
            if (payment.metodo_pagamento === 'fiado') return; // Fiado não é dinheiro no caixa hoje
            const val = Number(payment.valor);
            tVendas += val;
            if (payment.metodo_pagamento === 'dinheiro') tDinheiro += val;
            else if (payment.metodo_pagamento === 'pix') tPix += val;
            else if (['cartao_credito', 'cartao_debito'].includes(payment.metodo_pagamento)) tCartao += val;
        });
      } else {
        if (sale.metodo_pagamento === 'fiado') return; // Fiado não é dinheiro no caixa hoje
        const val = Number(sale.total) || 0;
        tVendas += val;
        if (sale.metodo_pagamento === 'dinheiro') tDinheiro += val;
        else if (sale.metodo_pagamento === 'pix') tPix += val;
        else if (['cartao_credito', 'cartao_debito'].includes(sale.metodo_pagamento || '')) tCartao += val;
      }
    });

    // 2. Soma os Pagamentos do Crediário (AGORA SIM É FATURAMENTO, porque o dinheiro entrou!)
    credPgtos.forEach(pgto => {
        const val = Number(pgto.valor);
        tVendas += val; // Entra no faturamento do turno
        
        if (pgto.metodo_pagamento === 'dinheiro') tDinheiro += val;
        else if (pgto.metodo_pagamento === 'pix') tPix += val;
        else if (['cartao_credito', 'cartao_debito'].includes(pgto.metodo_pagamento)) tCartao += val;
    });

    let tAbertura = 0; let tSaidas = 0;
    movements.forEach(mov => {
      if (mov.tipo === 'entrada') tAbertura += Number(mov.valor);
      else if (mov.descricao !== 'Fechamento de Caixa') tSaidas += Number(mov.valor);
    });

    const saldoFinal = tAbertura + tDinheiro - tSaidas;
    return { totalVendas: tVendas, totalEntradasAbertura: tAbertura, totalSaidasSangria: tSaidas, totalDinheiroVendas: tDinheiro, totalPix: tPix, totalCartao: tCartao, saldoFisico: saldoFinal };
  }, [sales, movements, credPgtos]);

const getPaymentText = (sale: Sale): string => {
    if (sale.sale_payments && sale.sale_payments.length > 1) {
        return "Misto (" + sale.sale_payments.map((p: any) => paymentMethodLabels[p.metodo_pagamento]).join(", ") + ")";
    } else if (sale.sale_payments && sale.sale_payments.length === 1) {
        return paymentMethodLabels[sale.sale_payments[0].metodo_pagamento];
    } else if (sale.metodo_pagamento) {
        return paymentMethodLabels[sale.metodo_pagamento];
    }
    return 'N/A';
  };

  const renderPaymentBadge = (sale: Sale) => {
    if (sale.sale_payments && sale.sale_payments.length > 1) {
        return (
           <div className="flex flex-col gap-1 items-start">
             <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 font-bold shadow-none">Misto</Badge>
             {sale.sale_payments.map((p: any, idx: number) => (
               <Badge key={idx} variant="outline" className="bg-muted text-foreground border-border text-[10px] shadow-none">
                 {paymentMethodLabels[p.metodo_pagamento]}: R$ {Number(p.valor).toFixed(2)}
               </Badge>
             ))}
           </div>
        );
    } else if (sale.sale_payments && sale.sale_payments.length === 1) {
        const isFiado = sale.sale_payments[0].metodo_pagamento === 'fiado';
        return <Badge variant="outline" className={`border-border ${isFiado ? 'text-orange-500 bg-orange-500/10' : 'text-foreground'}`}>{paymentMethodLabels[sale.sale_payments[0].metodo_pagamento]}</Badge>;
    } else if (sale.metodo_pagamento) {
        const isFiado = sale.metodo_pagamento === 'fiado';
        return <Badge variant="outline" className={`border-border ${isFiado ? 'text-orange-500 bg-orange-500/10' : 'text-foreground'}`}>{paymentMethodLabels[sale.metodo_pagamento]}</Badge>;
    }
    return <Badge variant="destructive">N/A</Badge>;
  };
  
  const historicoUnificado = useMemo(() => {
    const itens: any[] = [];
    
    // As Vendas Realizadas (Inclui fiado para mostrar o produto que saiu, mas sem somar nos cartões acima)
    sales.forEach(sale => {
        itens.push({ id: sale.id, tipo: 'venda', data: sale.updated_at || sale.created_at, descricao: sale.nome_cliente || "Cliente Balcão", pagamentoTexto: getPaymentText(sale), pagamentoBadge: renderPaymentBadge(sale), valor: Number(sale.total) || 0 });
    });
    
    // Os Pagamentos Recebidos do Fiado (As parcelas que o cliente veio pagar hoje)
    credPgtos.forEach(pgto => {
        itens.push({ 
            id: pgto.id, 
            tipo: 'recebimento_fiado', 
            data: pgto.created_at, 
            descricao: `Rec. Crediário - ${pgto.crediarios?.clients?.nome || 'Cliente'}`, 
            pagamentoTexto: paymentMethodLabels[pgto.metodo_pagamento], 
            pagamentoBadge: <Badge className="bg-emerald-500 text-white shadow-none hover:bg-emerald-600">Rec. Crediário</Badge>, 
            valor: Number(pgto.valor) 
        });
    });
    
    // As Sangrias Realizadas
    movements.forEach(mov => {
        if (mov.tipo === 'saida' && mov.descricao.includes('[Sangria]')) {
            itens.push({ id: mov.id, tipo: 'sangria', data: mov.created_at, descricao: mov.descricao, pagamentoTexto: "Sangria (Saída)", pagamentoBadge: <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 font-semibold shadow-none">Sangria</Badge>, valor: Number(mov.valor) || 0 });
        }
    });
    
    return itens.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [sales, movements, credPgtos]);


  const generatePDF = () => {
      if (!caixaAberto) return; 
      const doc = new jsPDF();
      const dataAbertura = format(new Date(caixaAberto.data_abertura), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      const dataAtual = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text("Relatório de Fechamento de Turno", 14, 20);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      doc.text(`Colaborador: ${userName || user?.email}`, 14, 28); doc.text(`Abertura do Caixa: ${dataAbertura}`, 14, 34); doc.text(`Horário do Relatório: ${dataAtual}`, 14, 40);
      doc.line(14, 45, 196, 45); 

      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Resumo Financeiro:", 14, 55);
      doc.setFont("helvetica", "normal");
      autoTable(doc, {
          startY: 60, theme: 'grid', headStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' }, bodyStyles: { textColor: 50 }, columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
          body: [ 
              ['Total de Faturamento do Turno', `R$ ${totalVendas.toFixed(2)}`], 
              ['Dinheiro', `R$ ${totalDinheiroVendas.toFixed(2)}`], 
              ['Pix', `R$ ${totalPix.toFixed(2)}`], 
              ['Cartão', `R$ ${totalCartao.toFixed(2)}`], 
              ['Abertura / Entradas (Fundo de Caixa)', `R$ ${totalEntradasAbertura.toFixed(2)}`], 
              ['Saídas / Sangrias', `R$ ${totalSaidasSangria.toFixed(2)}`] 
          ],
      });

      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFillColor(240, 240, 240); doc.rect(14, finalY, 182, 12, 'F'); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(0, 0, 0); doc.text("SALDO FINAL ESPERADO NA GAVETA:", 18, finalY + 8); doc.text(`R$ ${saldoFisico.toFixed(2)}`, 140, finalY + 8);
      doc.line(14, finalY + 20, 196, finalY + 20); 
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Histórico Detalhado de Movimentações:", 14, finalY + 30);
      
      const historyBody = historicoUnificado.map(item => [ format(new Date(item.data), "HH:mm"), item.descricao, item.pagamentoTexto, `${item.tipo === 'sangria' ? '- ' : ''}R$ ${item.valor.toFixed(2)}` ]);
      autoTable(doc, { startY: finalY + 35, theme: 'striped', headStyles: { fillColor: [100, 116, 139], textColor: 255 }, head: [['Hora', 'Cliente / Descrição', 'Pagamento/Tipo', 'Valor']], body: historyBody });
      
      const pageHeight = doc.internal.pageSize.height;
      if ((doc as any).lastAutoTable.finalY > pageHeight - 40) doc.addPage();
      const sigY = doc.internal.pageSize.height - 20; doc.line(60, sigY - 5, 150, sigY - 5); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text("Assinatura do Colaborador", 105, sigY, { align: "center" });
      doc.save(`Relatorio_Caixa_${format(new Date(), "dd-MM")}.pdf`);
  };

  const handleSangria = async () => {
    if (!user || !caixaAberto) return;
    const valorNum = parseFloat(sangriaValor.replace(",", "."));
    if (isNaN(valorNum) || valorNum <= 0) return toast.error("Por favor, insira um valor válido maior que zero.");
    if (valorNum > saldoFisico) return toast.error(`A sangria não pode ser maior que o saldo na gaveta (R$ ${saldoFisico.toFixed(2)}).`);
    if (!sangriaDescricao.trim()) return toast.error("A descrição da sangria é obrigatória.");
    setIsSubmittingSangria(true);
    try {
      const { error } = await supabase.from('movements').insert({
        responsavel_id: user.id,
        tipo: 'saida',
        valor: valorNum,
        descricao: `[Sangria] ${sangriaDescricao}`
      });
      if (error) throw error;
      toast.success("Sangria registrada com sucesso!");
      setIsSangriaModalOpen(false);
      setSangriaValor("");
      setSangriaDescricao("");
      loadMovements(caixaAberto.data_abertura); 
    } catch (e: any) {
      toast.error("Erro ao registrar sangria: " + e.message);
    } finally {
      setIsSubmittingSangria(false);
    }
  };
  
  const handleConfirmCloseCaixa = async () => {
    if (!user || !caixaAberto) return; 
    const valorFechamento = saldoFisico; 
    await supabase.from('movements').insert({
      responsavel_id: user.id,
      tipo: 'saida',
      valor: valorFechamento, 
      descricao: 'Fechamento de Caixa'
    });
    const { error } = await supabase.from('caixas').update({
      status: 'fechado',
      valor_fechamento: valorFechamento,
      data_fechamento: new Date().toISOString()
    }).eq('id', caixaAberto.id);
    if (error) toast.error("Erro ao fechar caixa");
    else {
      toast.success("Caixa fechado com sucesso!");
      setIsCloseCaixaAlertOpen(false); 
      checkCaixaAberto(); 
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground animate-pulse">A procurar informações...</div>;

  if (!caixaAberto) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)] text-center space-y-4 animate-in fade-in">
        <div className="bg-card p-6 rounded-full border border-border shadow-sm"><Lock className="h-10 w-10 text-muted-foreground" /></div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Caixa Fechado</h1>
        <p className="text-muted-foreground max-w-md">O seu turno não foi iniciado. Vá para a tela de <strong>Caixa Rápido</strong> para abrir o caixa.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-foreground"><Receipt className="h-6 w-6 text-primary" /> Meu Caixa</h1>
          <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>Aberto em: {format(new Date(caixaAberto.data_abertura), "dd/MM 'às' HH:mm")}</p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" className="text-destructive border-destructive/20 bg-destructive/10 hover:bg-destructive/20 shadow-sm" onClick={() => setIsSangriaModalOpen(true)}>
                <MinusCircle className="h-4 w-4 mr-2" /> Sangria
            </Button>
            <AlertDialog open={isCloseCaixaAlertOpen} onOpenChange={setIsCloseCaixaAlertOpen}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 text-foreground border-border bg-background hover:bg-muted shadow-sm">
                    Opções <ChevronDown className="h-4 w-4" />
                </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                <DropdownMenuItem onClick={generatePDF} className="cursor-pointer text-foreground hover:bg-muted"><FileText className="h-4 w-4 mr-2 text-primary" /> Relatório PDF</DropdownMenuItem>
                <AlertDialogTrigger asChild><DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer"><Lock className="h-4 w-4 mr-2" /> Fechar Caixa</DropdownMenuItem></AlertDialogTrigger>
                </DropdownMenuContent>
            </DropdownMenu>
            
            <AlertDialogContent className="bg-card border-border">
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-foreground text-xl flex items-center gap-2">
                        <AlertTriangle className="h-6 w-6 text-yellow-500" />
                        Atenção: Já tirou o relatório?
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-muted-foreground text-base mt-2">
                        Antes de fechar o caixa, é imprescindível que tenha gerado o <strong>Relatório PDF</strong> deste turno para conferência.
                        <div className="mt-4 p-3 bg-muted rounded-md text-sm font-medium text-center text-foreground border border-border">
                            Valor Final Estimado: R$ {saldoFisico.toFixed(2)}
                        </div>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2 sm:gap-0 mt-4">
                    <AlertDialogCancel className="bg-background text-foreground border-border hover:bg-muted font-bold">
                        Não, voltar
                    </AlertDialogCancel>
                    <AlertDialogAction onClick={handleConfirmCloseCaixa} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold">
                        Sim, fechar caixa
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
            </AlertDialog>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-emerald-500 shadow-sm transition-all bg-card border-y-border border-r-border"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Gaveta (Dinheiro)</CardTitle><div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center"><Wallet className="h-4 w-4 text-emerald-500" /></div></CardHeader><CardContent><div className="text-2xl font-bold text-foreground">R$ {saldoFisico.toFixed(2)}</div><p className="text-[10px] text-muted-foreground mt-1">Físico disponível</p></CardContent></Card>
        <Card className="border-l-4 border-l-primary shadow-sm transition-all bg-card border-y-border border-r-border"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Dinheiro</CardTitle><div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center"><DollarSign className="h-4 w-4 text-primary" /></div></CardHeader><CardContent><div className="text-2xl font-bold text-foreground">R$ {totalDinheiroVendas.toFixed(2)}</div><p className="text-[10px] text-muted-foreground mt-1">Entrada em espécie</p></CardContent></Card>
        <Card className="border-l-4 border-l-cyan-500 shadow-sm transition-all bg-card border-y-border border-r-border"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Pix</CardTitle><div className="h-8 w-8 rounded-full bg-cyan-500/10 flex items-center justify-center"><Smartphone className="h-4 w-4 text-cyan-500" /></div></CardHeader><CardContent><div className="text-2xl font-bold text-foreground">R$ {totalPix.toFixed(2)}</div><p className="text-[10px] text-muted-foreground mt-1">Transf. Digital</p></CardContent></Card>
        <Card className="border-l-4 border-l-purple-500 shadow-sm transition-all bg-card border-y-border border-r-border"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Cartão</CardTitle><div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center"><CreditCard className="h-4 w-4 text-purple-500" /></div></CardHeader><CardContent><div className="text-2xl font-bold text-foreground">R$ {totalCartao.toFixed(2)}</div><p className="text-[10px] text-muted-foreground mt-1">Crédito / Débito</p></CardContent></Card>
      </div>
      
      <div className="flex flex-wrap gap-4 text-sm px-4 py-3 bg-muted/30 rounded-lg border border-dashed border-border">
         <div className="flex items-center gap-2"><div className="p-1 bg-primary/10 rounded text-primary"><TrendingUp className="h-3 w-3" /></div><span className="text-muted-foreground">Faturamento: <strong className="text-foreground">R$ {totalVendas.toFixed(2)}</strong></span></div>
         <div className="w-px h-4 bg-border self-center hidden sm:block"></div>
         <div className="flex items-center gap-2"><div className="p-1 bg-emerald-500/10 rounded text-emerald-500"><ArrowUpCircle className="h-3 w-3" /></div><span className="text-muted-foreground">Abertura: <strong className="text-foreground">R$ {totalEntradasAbertura.toFixed(2)}</strong></span></div>
         <div className="w-px h-4 bg-border self-center hidden sm:block"></div>
         <div className="flex items-center gap-2"><div className="p-1 bg-destructive/10 rounded text-destructive"><MinusCircle className="h-3 w-3" /></div><span className="text-muted-foreground">Saídas: <strong className="text-foreground">R$ {totalSaidasSangria.toFixed(2)}</strong></span></div>
      </div>

      <Card className="bg-card border-border shadow-sm overflow-hidden">
        <CardHeader className="bg-muted/30 border-b border-border py-3 px-6"><CardTitle className="text-base font-semibold text-foreground">Histórico de Movimentações</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/50 border-border"><TableRow className="border-border hover:bg-transparent"><TableHead className="pl-6 w-[100px] text-muted-foreground">Horário</TableHead><TableHead className="text-muted-foreground">Cliente / Descrição</TableHead><TableHead className="text-muted-foreground">Pagamento / Tipo</TableHead><TableHead className="text-right pr-6 text-muted-foreground">Valor Total</TableHead><TableHead className="w-[100px] text-muted-foreground"></TableHead></TableRow></TableHeader>
            <TableBody>
              {historicoUnificado.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/30 border-border transition-colors align-top">
                  <TableCell className="pl-6 font-medium text-muted-foreground tabular-nums pt-4">{format(new Date(item.data), "HH:mm")}</TableCell>
                  <TableCell className="pt-4"><span className={`font-medium ${item.tipo === 'sangria' ? 'text-destructive' : 'text-foreground'}`}>{item.descricao}</span></TableCell>
                  <TableCell className="pt-3 pb-3">{item.pagamentoBadge}</TableCell>
                  <TableCell className={`text-right pr-6 font-bold tabular-nums pt-4 ${item.tipo === 'sangria' ? 'text-destructive' : 'text-foreground'}`}>{item.tipo === 'sangria' ? '- ' : ''}R$ {item.valor.toFixed(2)}</TableCell>
                  <TableCell className="pt-3">{item.tipo === 'venda' && <SaleDetailsDialog saleId={item.id} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isSangriaModalOpen} onOpenChange={setIsSangriaModalOpen}>
        <DialogContent className="sm:max-w-[425px] bg-card border-border">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><MinusCircle className="h-5 w-5" /> Nova Sangria (Retirada)</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label className="text-foreground">Valor da Retirada (R$)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">R$</span>
                <Input type="number" value={sangriaValor} onChange={(e) => setSangriaValor(e.target.value)} placeholder="0.00" className="pl-9 h-12 font-bold text-lg bg-background border-border text-foreground" autoFocus />
              </div>
              <p className="text-xs text-muted-foreground">Saldo disponível na gaveta: <strong>R$ {saldoFisico.toFixed(2)}</strong></p>
            </div>
            <div className="space-y-2"><Label className="text-foreground">Descrição / Motivo</Label><Input value={sangriaDescricao} onChange={(e) => setSangriaDescricao(e.target.value)} placeholder="Ex: Pagamento fornecedor, Retirada cofre..." className="h-10 bg-background border-border text-foreground" /></div>
          </div>
          <DialogFooter>
             <Button variant="outline" className="bg-background text-foreground border-border hover:bg-muted" onClick={() => setIsSangriaModalOpen(false)}>Cancelar</Button>
             <Button className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={handleSangria} disabled={isSubmittingSangria}>{isSubmittingSangria ? "Registando..." : "Confirmar Sangria"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SaleDetailsDialog({ saleId }: { saleId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    const loadDetails = async () => {
        if (!isOpen) return;
        setLoading(true);
        const { data, error } = await supabase.from('sale_items').select('*, products(nome)').eq('venda_id', saleId);
        if (!error && data) setItems(data);
        setLoading(false);
    };
    loadDetails();
  }, [isOpen, saleId]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10">Detalhes</Button></DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-card border-border">
        <DialogHeader><DialogTitle className="text-foreground">Itens da Venda</DialogTitle></DialogHeader>
        {loading ? (<div className="py-8 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div></div>) : (
            <div className="border border-border rounded-md overflow-hidden">
                <Table>
                    <TableHeader><TableRow className="bg-muted/50 border-border hover:bg-transparent"><TableHead className="h-9 text-muted-foreground">Produto</TableHead><TableHead className="h-9 text-center text-muted-foreground">Qtd.</TableHead><TableHead className="h-9 text-right text-muted-foreground">Total</TableHead></TableRow></TableHeader>
                    <TableBody>{items.map((item: any) => (<TableRow key={item.id} className="hover:bg-muted/30 border-border"><TableCell className="py-2 text-sm text-foreground">{item.products?.nome}</TableCell><TableCell className="py-2 text-sm text-center text-foreground">{item.quantidade}</TableCell><TableCell className="py-2 text-sm text-right font-medium text-foreground">R$ {Number(item.subtotal).toFixed(2)}</TableCell></TableRow>))}</TableBody>
                </Table>
            </div>
        )}
      </DialogContent>
    </Dialog>
  );
}