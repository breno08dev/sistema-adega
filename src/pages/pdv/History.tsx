// src/pages/pdv/History.tsx
import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { 
    Download, 
    Lock, 
    ChevronDown, 
    Wallet, 
    CreditCard, 
    Smartphone, 
    DollarSign, 
    TrendingUp,
    ArrowUpCircle,
    Receipt,
    MinusCircle
} from "lucide-react"; 

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// --- TIPOS ATUALIZADOS ---
type PaymentMethod = Database["public"]["Enums"]["payment_method"];
type SalePayment = { metodo_pagamento: PaymentMethod; valor: number };

type Sale = Database["public"]["Tables"]["sales"]["Row"] & {
  sale_payments?: SalePayment[]; 
};
type Movement = Database["public"]["Tables"]["movements"]["Row"];
type Caixa = Database["public"]["Tables"]["caixas"]["Row"];
type SaleItem = Database["public"]["Tables"]["sale_items"]["Row"] & {
  products: { nome: string } | null;
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao_credito: "Crédito",
  cartao_debito: "Débito",
};

export default function CollaboratorHistory() {
  const { user, userName } = useAuth();
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Sale[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]); 
  const [caixaAberto, setCaixaAberto] = useState<Caixa | null>(null);
  
  // Modais
  const [isCloseCaixaAlertOpen, setIsCloseCaixaAlertOpen] = useState(false);
  const [isSangriaModalOpen, setIsSangriaModalOpen] = useState(false);
  
  // Estado Sangria
  const [sangriaValor, setSangriaValor] = useState("");
  const [sangriaDescricao, setSangriaDescricao] = useState("");
  const [isSubmittingSangria, setIsSubmittingSangria] = useState(false);

  // --- 1. CARREGAR DADOS ---
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
      setCaixaAberto(caixaData as Caixa);
      await Promise.all([
        loadSales(caixaData.data_abertura),
        loadMovements(caixaData.data_abertura)
      ]);
    } else {
      setCaixaAberto(null);
      setSales([]);
      setMovements([]);
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
    if (data) setSales(data as Sale[]);
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

  // --- 2. CÁLCULOS E HISTÓRICO UNIFICADO ---
  const { 
    totalVendas, 
    totalEntradas, 
    totalSaidas, 
    totalDinheiro, 
    totalPix, 
    totalCartao, 
    saldoFisico 
  } = useMemo(() => {
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
      else tSaidas += Number(mov.valor);
    });

    const saldoFisico = tDinheiro + tEntradas - tSaidas;

    return { 
        totalVendas: tVendas, totalEntradas: tEntradas, totalSaidas: tSaidas,
        totalDinheiro: tDinheiro, totalPix: tPix, totalCartao: tCartao, saldoFisico: saldoFisico
    };
  }, [sales, movements]);

  // FUNÇÕES HELPER PARA PAGAMENTO
  const getPaymentText = (sale: Sale): string => {
    if (sale.sale_payments && sale.sale_payments.length > 0) {
        return "Misto (" + sale.sale_payments.map(p => paymentMethodLabels[p.metodo_pagamento]).join(", ") + ")";
    } else if (sale.metodo_pagamento) {
        return paymentMethodLabels[sale.metodo_pagamento];
    }
    return 'N/A';
  };

  const renderPaymentBadge = (sale: Sale) => {
    if (sale.sale_payments && sale.sale_payments.length > 0) {
        return (
           <div className="flex flex-col gap-1 items-start">
             {sale.sale_payments.map((p, idx) => (
               <Badge key={idx} variant="outline" className="bg-gray-50 text-gray-700 shadow-sm border-gray-200">
                 {paymentMethodLabels[p.metodo_pagamento]}: R$ {Number(p.valor).toFixed(2)}
               </Badge>
             ))}
           </div>
        );
    } else if (sale.metodo_pagamento) {
        return <Badge variant="outline">{paymentMethodLabels[sale.metodo_pagamento]}</Badge>;
    }
    return <Badge variant="destructive">N/A</Badge>;
  };

  // --- NOVA LÓGICA: JUNTAR VENDAS E SANGRIAS NUMA ÚNICA LISTA DE TEMPO ---
  const historicoUnificado = useMemo(() => {
    const itens = [];

    // Adiciona as Vendas
    sales.forEach(sale => {
        itens.push({
            id: sale.id,
            tipo: 'venda',
            data: sale.updated_at || sale.created_at,
            descricao: sale.nome_cliente || "Cliente Balcão",
            pagamentoTexto: getPaymentText(sale),
            pagamentoBadge: renderPaymentBadge(sale),
            valor: Number(sale.total) || 0,
        });
    });

    // Adiciona as Sangrias (Movimentos de saída que contém a tag [Sangria])
    movements.forEach(mov => {
        if (mov.tipo === 'saida' && mov.descricao.includes('[Sangria]')) {
            itens.push({
                id: mov.id,
                tipo: 'sangria',
                data: mov.created_at,
                descricao: mov.descricao, 
                pagamentoTexto: "Sangria (Saída)",
                pagamentoBadge: <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200 font-semibold">Sangria</Badge>,
                valor: Number(mov.valor) || 0,
            });
        }
    });

    // Ordenar do mais recente para o mais antigo
    return itens.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [sales, movements]);


  // --- 3. AÇÕES (PDF, FECHAR E SANGRIA) ---
  const generatePDF = () => {
    if (!caixaAberto) return; 
    const doc = new jsPDF();
    const today = format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR });
    
    doc.text("Relatório de Caixa", 14, 16);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${today}`, 14, 22);
    doc.text(`Colaborador: ${userName || user?.email}`, 14, 28);
    
    // Tabela do PDF usando o Histórico Unificado
    const historyBody = historicoUnificado.map(item => [
      format(new Date(item.data), "HH:mm"),
      item.descricao,
      item.pagamentoTexto, 
      `${item.tipo === 'sangria' ? '- ' : ''}R$ ${item.valor.toFixed(2)}`
    ]);
    
    autoTable(doc, {
      startY: 35,
      head: [['Hora', 'Cliente / Descrição', 'Pagamento/Tipo', 'Valor']], 
      body: historyBody,
    });

    const lastY = (doc as any).lastAutoTable.finalY + 10;
    doc.text("Resumo Financeiro:", 14, lastY);
    autoTable(doc, {
        startY: lastY + 5,
        body: [
            ['Dinheiro (Vendas)', `R$ ${totalDinheiro.toFixed(2)}`],
            ['Pix', `R$ ${totalPix.toFixed(2)}`],
            ['Cartão', `R$ ${totalCartao.toFixed(2)}`],
            ['Abertura/Entradas', `R$ ${totalEntradas.toFixed(2)}`],
            ['Saídas/Sangrias', `R$ ${totalSaidas.toFixed(2)}`],
            ['SALDO FINAL (GAVETA)', `R$ ${saldoFisico.toFixed(2)}`],
        ]
    });

    doc.save(`Relatorio_Caixa_${format(new Date(), "dd-MM")}.pdf`);
  };

  const handleSangria = async () => {
    if (!user || !caixaAberto) return;

    const valorNum = parseFloat(sangriaValor.replace(",", "."));
    if (isNaN(valorNum) || valorNum <= 0) {
      return toast.error("Por favor, insira um valor válido maior que zero.");
    }

    if (valorNum > saldoFisico) {
      return toast.error(`A sangria não pode ser maior que o saldo na gaveta (R$ ${saldoFisico.toFixed(2)}).`);
    }

    if (!sangriaDescricao.trim()) {
      return toast.error("A descrição da sangria é obrigatória.");
    }

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
      
      // Recarrega os movimentos para atualizar a Gaveta e Saídas na tela
      loadMovements(caixaAberto.data_abertura); 
    } catch (e: any) {
      toast.error("Erro ao registrar sangria: " + e.message);
    } finally {
      setIsSubmittingSangria(false);
    }
  };
  
  const handleConfirmCloseCaixa = async () => {
    if (!user || !caixaAberto) return; 

    const valorFechamento = totalVendas + totalEntradas - totalSaidas;

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
    
    if (error) {
      toast.error("Erro ao fechar caixa");
    } else {
      toast.success("Caixa fechado com sucesso!");
      setIsCloseCaixaAlertOpen(false); 
      checkCaixaAberto(); 
    }
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Carregando informações...</div>;

  if (!caixaAberto) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)] text-center space-y-4 animate-in fade-in">
        <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-full"><Lock className="h-10 w-10 text-muted-foreground" /></div>
        <h1 className="text-2xl font-bold tracking-tight">Caixa Fechado</h1>
        <p className="text-muted-foreground max-w-md">Seu turno não foi iniciado. Vá para a tela de <strong>Caixa Rápido</strong> para abrir o caixa.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Receipt className="h-6 w-6 text-primary" /> Meu Caixa</h1>
          <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1"><span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>Aberto em: {format(new Date(caixaAberto.data_abertura), "dd/MM 'às' HH:mm")}</p>
        </div>
        
        <div className="flex items-center gap-2">
            <Button variant="outline" className="text-red-600 border-red-200 bg-red-50 hover:bg-red-100 shadow-sm" onClick={() => setIsSangriaModalOpen(true)}>
                <MinusCircle className="h-4 w-4 mr-2" /> Sangria
            </Button>

            <AlertDialog open={isCloseCaixaAlertOpen} onOpenChange={setIsCloseCaixaAlertOpen}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 text-gray-700 border-gray-300 hover:bg-gray-50 shadow-sm">
                    Opções <ChevronDown className="h-4 w-4" />
                </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={generatePDF} className="cursor-pointer"><Download className="h-4 w-4 mr-2" /> Relatório PDF</DropdownMenuItem>
                <AlertDialogTrigger asChild><DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"><Lock className="h-4 w-4 mr-2" /> Fechar Caixa</DropdownMenuItem></AlertDialogTrigger>
                </DropdownMenuContent>
            </DropdownMenu>
            
            <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Fechar Caixa?</AlertDialogTitle>
                <AlertDialogDescription>
                    Isso encerrará seu turno e registrará a saída do valor total.
                    <div className="mt-4 p-3 bg-muted rounded-md text-sm font-medium text-center">Valor Final Estimado: R$ {(totalVendas + totalEntradas - totalSaidas).toFixed(2)}</div>
                </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={handleConfirmCloseCaixa} className="bg-red-600 hover:bg-red-700">Confirmar Fechamento</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
            </AlertDialog>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-all bg-white dark:bg-gray-900"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Gaveta (Dinheiro)</CardTitle><div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"><Wallet className="h-4 w-4 text-emerald-600" /></div></CardHeader><CardContent><div className="text-2xl font-bold text-gray-900 dark:text-gray-100">R$ {saldoFisico.toFixed(2)}</div><p className="text-xs text-muted-foreground mt-1">Físico disponível</p></CardContent></Card>
        <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-all bg-white dark:bg-gray-900"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Vendas Dinheiro</CardTitle><div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"><DollarSign className="h-4 w-4 text-green-600" /></div></CardHeader><CardContent><div className="text-2xl font-bold text-gray-900 dark:text-gray-100">R$ {totalDinheiro.toFixed(2)}</div><p className="text-xs text-muted-foreground mt-1">Entrada em espécie</p></CardContent></Card>
        <Card className="border-l-4 border-l-cyan-500 shadow-sm hover:shadow-md transition-all bg-white dark:bg-gray-900"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Vendas Pix</CardTitle><div className="h-8 w-8 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center"><Smartphone className="h-4 w-4 text-cyan-600" /></div></CardHeader><CardContent><div className="text-2xl font-bold text-gray-900 dark:text-gray-100">R$ {totalPix.toFixed(2)}</div><p className="text-xs text-muted-foreground mt-1">Transf. Digital</p></CardContent></Card>
        <Card className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-all bg-white dark:bg-gray-900"><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Vendas Cartão</CardTitle><div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center"><CreditCard className="h-4 w-4 text-purple-600" /></div></CardHeader><CardContent><div className="text-2xl font-bold text-gray-900 dark:text-gray-100">R$ {totalCartao.toFixed(2)}</div><p className="text-xs text-muted-foreground mt-1">Crédito / Débito</p></CardContent></Card>
      </div>
      
      <div className="flex flex-wrap gap-4 text-sm px-1 py-2 bg-gray-50/50 dark:bg-gray-900/30 rounded-lg border border-dashed border-gray-200 dark:border-gray-800">
         <div className="flex items-center gap-2"><div className="p-1 bg-blue-100 rounded text-blue-600"><TrendingUp className="h-3 w-3" /></div><span className="text-muted-foreground">Total Vendido: <strong className="text-foreground">R$ {totalVendas.toFixed(2)}</strong></span></div>
         <div className="w-px h-4 bg-gray-300 dark:bg-gray-700 self-center hidden sm:block"></div>
         <div className="flex items-center gap-2"><div className="p-1 bg-green-100 rounded text-green-600"><ArrowUpCircle className="h-3 w-3" /></div><span className="text-muted-foreground">Abertura: <strong className="text-foreground">R$ {totalEntradas.toFixed(2)}</strong></span></div>
         <div className="w-px h-4 bg-gray-300 dark:bg-gray-700 self-center hidden sm:block"></div>
         <div className="flex items-center gap-2"><div className="p-1 bg-red-100 rounded text-red-600"><MinusCircle className="h-3 w-3" /></div><span className="text-muted-foreground">Saídas: <strong className="text-foreground">R$ {totalSaidas.toFixed(2)}</strong></span></div>
      </div>

      <Card className="border shadow-sm ring-1 ring-gray-200 dark:ring-gray-800 overflow-hidden">
        <CardHeader className="bg-gray-50/50 dark:bg-gray-900/50 border-b py-3 px-6"><CardTitle className="text-base font-semibold">Histórico de Movimentações</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
                <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-6 w-[100px]">Horário</TableHead>
                    <TableHead>Cliente / Descrição</TableHead>
                    <TableHead>Pagamento / Tipo</TableHead>
                    <TableHead className="text-right pr-6">Valor Total</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
              {historicoUnificado.length === 0 && (<TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground"><div className="flex flex-col items-center gap-2"><Receipt className="h-8 w-8 opacity-20" /><span>Nenhuma movimentação neste turno.</span></div></TableCell></TableRow>)}
              {historicoUnificado.map((item) => (
                <TableRow key={item.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/50 transition-colors align-top">
                  <TableCell className="pl-6 font-medium text-muted-foreground tabular-nums pt-4">
                    {format(new Date(item.data), "HH:mm")}
                  </TableCell>
                  <TableCell className="pt-4">
                    <span className={`font-medium ${item.tipo === 'sangria' ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                      {item.descricao}
                    </span>
                  </TableCell>
                  <TableCell className="pt-3 pb-3">
                    {item.pagamentoBadge}
                  </TableCell>
                  <TableCell className={`text-right pr-6 font-bold tabular-nums pt-4 ${item.tipo === 'sangria' ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                    {item.tipo === 'sangria' ? '- ' : ''}R$ {item.valor.toFixed(2)}
                  </TableCell>
                  <TableCell className="pt-3">
                    {item.tipo === 'venda' && <SaleDetailsDialog saleId={item.id} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* MODAL DE SANGRIA */}
      <Dialog open={isSangriaModalOpen} onOpenChange={setIsSangriaModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <MinusCircle className="h-5 w-5" /> Nova Sangria (Retirada)
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Valor da Retirada (R$)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">R$</span>
                <Input 
                  type="number" 
                  value={sangriaValor} 
                  onChange={(e) => setSangriaValor(e.target.value)} 
                  placeholder="0.00" 
                  className="pl-9 h-12 font-bold text-lg"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">
                 Saldo disponível na gaveta: <strong>R$ {saldoFisico.toFixed(2)}</strong>
              </p>
            </div>
            <div className="space-y-2">
              <Label>Descrição / Motivo</Label>
              <Input 
                value={sangriaDescricao} 
                onChange={(e) => setSangriaDescricao(e.target.value)} 
                placeholder="Ex: Pagamento fornecedor, Retirada cofre..." 
                className="h-10"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSangriaModalOpen(false)}>Cancelar</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleSangria} disabled={isSubmittingSangria}>
              {isSubmittingSangria ? "Registrando..." : "Confirmar Sangria"}
            </Button>
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
        if (error) toast.error("Erro ao carregar detalhes");
        else setItems(data as unknown as SaleItem[]);
        setLoading(false);
    };
    loadDetails();
  }, [isOpen, saleId]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-primary">Detalhes</Button></DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader><DialogTitle>Itens da Venda</DialogTitle></DialogHeader>
        {loading ? (<div className="py-8 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div></div>) : (
            <div className="border rounded-md overflow-hidden">
                <Table>
                    <TableHeader><TableRow className="bg-muted/50"><TableHead className="h-9">Produto</TableHead><TableHead className="h-9 text-center">Qtd.</TableHead><TableHead className="h-9 text-right">Total</TableHead></TableRow></TableHeader>
                    <TableBody>{items.map(item => (<TableRow key={item.id} className="hover:bg-transparent"><TableCell className="py-2 text-sm">{item.products?.nome}</TableCell><TableCell className="py-2 text-sm text-center">{item.quantidade}</TableCell><TableCell className="py-2 text-sm text-right font-medium">R$ {Number(item.subtotal).toFixed(2)}</TableCell></TableRow>))}</TableBody>
                </Table>
            </div>
        )}
      </DialogContent>
    </Dialog>
  );
}