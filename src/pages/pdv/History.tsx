// src/pages/pdv/History.tsx
import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
    ArrowDownCircle,
    Receipt
} from "lucide-react"; 

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// --- TIPOS ---
type Sale = Database["public"]["Tables"]["sales"]["Row"];
type Movement = Database["public"]["Tables"]["movements"]["Row"];
type Caixa = Database["public"]["Tables"]["caixas"]["Row"];
type SaleItem = Database["public"]["Tables"]["sale_items"]["Row"] & {
  products: { nome: string } | null;
};
type PaymentMethod = Database["public"]["Enums"]["payment_method"];

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
  const [isCloseCaixaAlertOpen, setIsCloseCaixaAlertOpen] = useState(false);

  // --- 1. CARREGAR DADOS ---
  const checkCaixaAberto = async () => {
    if (!user) return;
    setLoading(true);
    
    // Busca o caixa aberto
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
      // Carrega vendas e movimentos a partir da data de abertura
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
      .select('*')
      .eq('colaborador_id', user.id)
      .eq('status', 'finalizada') 
      .gte('updated_at', dataInicio)
      .order('created_at', { ascending: false });
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

  // --- 2. CÁLCULOS (CORRIGIDOS) ---
  const { 
    totalVendas, 
    totalEntradas, 
    totalSaidas, 
    totalDinheiro, 
    totalPix, 
    totalCartao, 
    saldoFisico 
  } = useMemo(() => {
    let tVendas = 0;
    let tDinheiro = 0;
    let tPix = 0;
    let tCartao = 0;

    // Soma vendas e separa por método
    sales.forEach(sale => {
      const val = Number(sale.total) || 0;
      tVendas += val;
      if (sale.metodo_pagamento === 'dinheiro') tDinheiro += val;
      else if (sale.metodo_pagamento === 'pix') tPix += val;
      else if (['cartao_credito', 'cartao_debito'].includes(sale.metodo_pagamento || '')) tCartao += val;
    });

    let tEntradas = 0;
    let tSaidas = 0;

    // Soma movimentos (Suprimentos e Sangrias)
    // OBS: A Abertura de caixa já é salva como um movimento de 'entrada', então ela entra aqui em tEntradas.
    movements.forEach(mov => {
      if (mov.tipo === 'entrada') tEntradas += Number(mov.valor);
      else tSaidas += Number(mov.valor);
    });

    // Saldo Físico = O que deve ter de dinheiro vivo na gaveta
    // (Vendas em Dinheiro + Entradas/Suprimentos - Saídas/Sangrias)
    const saldoFisico = tDinheiro + tEntradas - tSaidas;

    return { 
        totalVendas: tVendas, 
        totalEntradas: tEntradas, 
        totalSaidas: tSaidas,
        totalDinheiro: tDinheiro,
        totalPix: tPix,
        totalCartao: tCartao,
        saldoFisico: saldoFisico
    };
  }, [sales, movements]);

  // --- 3. AÇÕES (PDF e FECHAR) ---
  const generatePDF = () => {
    if (!caixaAberto) return; 
    const doc = new jsPDF();
    const today = format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR });
    
    doc.text("Relatório de Caixa", 14, 16);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${today}`, 14, 22);
    doc.text(`Colaborador: ${userName || user?.email}`, 14, 28);
    
    // Tabela de Vendas
    const salesBody = sales.map(sale => [
      format(new Date(sale.updated_at || sale.created_at), "HH:mm"),
      sale.nome_cliente || "Cliente Balcão",
      sale.metodo_pagamento ? paymentMethodLabels[sale.metodo_pagamento] : 'N/A',
      `R$ ${Number(sale.total).toFixed(2)}`
    ]);
    
    autoTable(doc, {
      startY: 35,
      head: [['Hora', 'Cliente', 'Pagamento', 'Valor']], 
      body: salesBody,
      foot: [['Total Vendas', '', '', `R$ ${totalVendas.toFixed(2)}`]],
    });

    // Resumo Final
    const lastY = (doc as any).lastAutoTable.finalY + 10;
    doc.text("Resumo Financeiro:", 14, lastY);
    autoTable(doc, {
        startY: lastY + 5,
        body: [
            ['Dinheiro (Vendas)', `R$ ${totalDinheiro.toFixed(2)}`],
            ['Pix', `R$ ${totalPix.toFixed(2)}`],
            ['Cartão', `R$ ${totalCartao.toFixed(2)}`],
            ['Abertura', `R$ ${totalEntradas.toFixed(2)}`],
            ['SALDO FINAL (GAVETA)', `R$ ${saldoFisico.toFixed(2)}`],
        ]
    });

    doc.save(`Relatorio_Caixa_${format(new Date(), "dd-MM")}.pdf`);
  };
  
  const handleConfirmCloseCaixa = async () => {
    if (!user || !caixaAberto) return; 

    // O valor de fechamento é tudo o que foi movimentado (Vendas + Entradas - Saídas)
    // Se quiser fechar só com o dinheiro físico, altere para `valorFechamento = saldoFisico`
    const valorFechamento = totalVendas + totalEntradas - totalSaidas;

    // 1. Registra a saída do valor (zera o caixa)
    await supabase.from('movements').insert({
      responsavel_id: user.id,
      tipo: 'saida',
      valor: valorFechamento, 
      descricao: 'Fechamento de Caixa'
    });

    // 2. Atualiza o status do caixa
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
        <div className="bg-gray-100 dark:bg-gray-800 p-6 rounded-full">
            <Lock className="h-10 w-10 text-muted-foreground" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Caixa Fechado</h1>
        <p className="text-muted-foreground max-w-md">
            Seu turno não foi iniciado. Vá para a tela de <strong>Caixa Rápido</strong> para abrir o caixa.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* --- HEADER --- */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" /> Meu Caixa
          </h1>
          <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
             <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
             Aberto em: {format(new Date(caixaAberto.data_abertura), "dd/MM 'às' HH:mm")}
          </p>
        </div>
        
        <AlertDialog open={isCloseCaixaAlertOpen} onOpenChange={setIsCloseCaixaAlertOpen}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 text-gray-700 border-gray-300 hover:bg-gray-50 shadow-sm">
                Opções <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={generatePDF} className="cursor-pointer">
                <Download className="h-4 w-4 mr-2" /> Relatório PDF
              </DropdownMenuItem>
              <AlertDialogTrigger asChild>
                <DropdownMenuItem className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer">
                  <Lock className="h-4 w-4 mr-2" /> Fechar Caixa
                </DropdownMenuItem>
              </AlertDialogTrigger>
            </DropdownMenuContent>
          </DropdownMenu>
          
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Fechar Caixa?</AlertDialogTitle>
              <AlertDialogDescription>
                Isso encerrará seu turno e registrará a saída do valor total.
                <div className="mt-4 p-3 bg-muted rounded-md text-sm font-medium text-center">
                    Valor Final Estimado: R$ {(totalVendas + totalEntradas - totalSaidas).toFixed(2)}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmCloseCaixa} className="bg-red-600 hover:bg-red-700">
                Confirmar Fechamento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* --- CARDS DE RESUMO (Visual da Imagem) --- */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        
        {/* 1. Valor em Caixa (Principal) */}
        <Card className="border-l-4 border-l-emerald-500 shadow-sm hover:shadow-md transition-all bg-white dark:bg-gray-900">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Gaveta (Dinheiro)</CardTitle>
            <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Wallet className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                R$ {saldoFisico.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Físico disponível</p>
          </CardContent>
        </Card>

        {/* 2. Dinheiro (Apenas Vendas) */}
        <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-all bg-white dark:bg-gray-900">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vendas Dinheiro</CardTitle>
            <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                R$ {totalDinheiro.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Entrada em espécie</p>
          </CardContent>
        </Card>

        {/* 3. Pix */}
        <Card className="border-l-4 border-l-cyan-500 shadow-sm hover:shadow-md transition-all bg-white dark:bg-gray-900">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vendas Pix</CardTitle>
            <div className="h-8 w-8 rounded-full bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
                <Smartphone className="h-4 w-4 text-cyan-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                R$ {totalPix.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Transf. Digital</p>
          </CardContent>
        </Card>

        {/* 4. Cartão */}
        <Card className="border-l-4 border-l-purple-500 shadow-sm hover:shadow-md transition-all bg-white dark:bg-gray-900">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vendas Cartão</CardTitle>
            <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                R$ {totalCartao.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Crédito / Débito</p>
          </CardContent>
        </Card>
      </div>
      
      {/* Indicadores Secundários */}
      <div className="flex flex-wrap gap-4 text-sm px-1 py-2 bg-gray-50/50 dark:bg-gray-900/30 rounded-lg border border-dashed border-gray-200 dark:border-gray-800">
         <div className="flex items-center gap-2">
            <div className="p-1 bg-blue-100 rounded text-blue-600"><TrendingUp className="h-3 w-3" /></div>
            <span className="text-muted-foreground">Total Vendido: <strong className="text-foreground">R$ {totalVendas.toFixed(2)}</strong></span>
         </div>
         <div className="w-px h-4 bg-gray-300 dark:bg-gray-700 self-center hidden sm:block"></div>
         <div className="flex items-center gap-2">
            <div className="p-1 bg-green-100 rounded text-green-600"><ArrowUpCircle className="h-3 w-3" /></div>
            <span className="text-muted-foreground">Abertura: <strong className="text-foreground">R$ {totalEntradas.toFixed(2)}</strong></span>
         </div>
      </div>

      {/* --- TABELA DE VENDAS --- */}
      <Card className="border shadow-sm ring-1 ring-gray-200 dark:ring-gray-800 overflow-hidden">
        <CardHeader className="bg-gray-50/50 dark:bg-gray-900/50 border-b py-3 px-6">
          <CardTitle className="text-base font-semibold">Últimas Vendas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6 w-[100px]">Horário</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right pr-6">Valor Total</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                        <Receipt className="h-8 w-8 opacity-20" />
                        <span>Nenhuma venda registrada neste turno.</span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {sales.map((sale) => (
                <TableRow key={sale.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/50 transition-colors">
                  <TableCell className="pl-6 font-medium text-muted-foreground tabular-nums">
                    {format(new Date(sale.updated_at || sale.created_at), "HH:mm")}
                  </TableCell>
                  <TableCell>
                     <span className="font-medium text-gray-900 dark:text-gray-100">{sale.nome_cliente || "Cliente Balcão"}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal bg-white border border-gray-200 text-gray-700 hover:bg-gray-50">
                      {sale.metodo_pagamento ? paymentMethodLabels[sale.metodo_pagamento] : "N/A"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-6 font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                    R$ {Number(sale.total).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <SaleDetailsDialog saleId={sale.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Componente Detalhes da Venda ---
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
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-primary">
            Detalhes
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Itens da Venda</DialogTitle>
        </DialogHeader>
        {loading ? (
            <div className="py-8 flex justify-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div></div>
        ) : (
            <div className="border rounded-md overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50">
                            <TableHead className="h-9">Produto</TableHead>
                            <TableHead className="h-9 text-center">Qtd.</TableHead>
                            <TableHead className="h-9 text-right">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {items.map(item => (
                            <TableRow key={item.id} className="hover:bg-transparent">
                                <TableCell className="py-2 text-sm">{item.products?.nome}</TableCell>
                                <TableCell className="py-2 text-sm text-center">{item.quantidade}</TableCell>
                                <TableCell className="py-2 text-sm text-right font-medium">R$ {Number(item.subtotal).toFixed(2)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        )}
      </DialogContent>
    </Dialog>
  );
}