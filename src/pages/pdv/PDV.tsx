import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, ShoppingCart, User, List, Minus, Search, Trash2, ChevronRight, Lock, Loader2 } from "lucide-react"; 

type PaymentMethod = "dinheiro" | "pix" | "cartao_credito" | "cartao_debito";

interface Product { id: string; nome: string; preco_venda: number; quantidade: number; }
interface SaleItem { id: string; produto_id: string; nome: string; quantidade: number; preco_unitario: number; subtotal: number; }
interface OpenSale { id: string; nome_cliente: string | null; numero_comanda: string | null; total: number; }
interface SelectedSale extends OpenSale { sale_items: SaleItem[]; }

export default function PDV() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [openComandas, setOpenComandas] = useState<OpenSale[]>([]);
  const [selectedComanda, setSelectedComanda] = useState<SelectedSale | null>(null);
  const [caixaId, setCaixaId] = useState<string | null>(null);

  const [isComandaModalOpen, setIsComandaModalOpen] = useState(false);
  const [isCancelAlertOpen, setIsCancelAlertOpen] = useState(false);
  const [newComandaNumber, setNewComandaNumber] = useState("");
  const [newComandaName, setNewComandaName] = useState("");

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Prevenção de múltiplos cliques rápidos
  const [isUpdatingItem, setIsUpdatingItem] = useState(false);

  const [payments, setPayments] = useState<{ method: PaymentMethod; value: number }[]>([]);
  const [currentMethod, setCurrentMethod] = useState<PaymentMethod | "">("");
  const [currentAmount, setCurrentAmount] = useState("");

  useEffect(() => { 
    loadProducts(); 
    loadOpenComandas();
    checkCaixaStatus();
  }, [user]);

  const checkCaixaStatus = async () => {
    if (!user) return;
    try {
      const { data } = await supabase.from("caixas").select("id").eq("colaborador_id", user.id).eq("status", "aberto").order("data_abertura", { ascending: false }).limit(1);
      if (data && data.length > 0) setCaixaId(data[0].id);
      else setCaixaId(null);
    } catch {
      setCaixaId(null);
    }
  };

  const loadProducts = async () => {
    const { data } = await supabase.from('products').select('id, nome, preco_venda, quantidade').order('nome');
    if (data) setProducts(data);
  };

  const loadOpenComandas = async () => {
    const { data, error } = await supabase.from('sales').select('id, nome_cliente, numero_comanda, total').eq('status', 'aberta').order('created_at', { ascending: true });
    if (!error && data) setOpenComandas(data);
  };

  const handleSelectComanda = async (comandaId: string) => {
    const { data } = await supabase.from('sales').select('*, sale_items(*, products(nome))').eq('id', comandaId).single();
    if (data) {
      const items = (data.sale_items || []).map((item: any) => ({
        id: item.id, produto_id: item.produto_id, nome: item.products?.nome || 'Produto desconhecido', quantidade: item.quantidade, preco_unitario: Number(item.preco_unitario), subtotal: Number(item.subtotal),
      }));
      setSelectedComanda({ ...data, sale_items: items });
    }
  };

  const refreshData = async () => {
    if (selectedComanda) await handleSelectComanda(selectedComanda.id);
    await loadProducts();
    await loadOpenComandas();
  };

  const handleCreateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !caixaId) return toast.error("Caixa Fechado", { description: "Abra o caixa no 'Caixa Rápido' antes de iniciar comandas." });
    
    setIsSubmitting(true);
    const { data } = await supabase.from('sales').insert([{ colaborador_id: user.id, caixa_id: caixaId, nome_cliente: newComandaName || null, numero_comanda: newComandaNumber || null, status: 'aberta' }]).select().single();
    if (data) {
      toast.success(`Comanda #${data.numero_comanda || ''} aberta!`);
      setIsComandaModalOpen(false); setNewComandaName(""); setNewComandaNumber("");
      await loadOpenComandas(); await handleSelectComanda(data.id);
    }
    setIsSubmitting(false);
  };

  const handleCancelComanda = async () => {
    if (!selectedComanda) return;
    const { error } = await supabase.from('sales').delete().eq('id', selectedComanda.id);
    if (!error) {
      toast.success("Comanda cancelada com sucesso!");
      setSelectedComanda(null); loadOpenComandas(); setIsCancelAlertOpen(false);
    }
  };

  const handleAttemptFinishSale = () => {
    if (!selectedComanda) return;
    if (selectedComanda.sale_items.length === 0) return setIsCancelAlertOpen(true);
    setPayments([]); setCurrentMethod(""); setCurrentAmount(selectedComanda.total.toFixed(2)); setIsPaymentModalOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedComanda || !user || !caixaId) return;
    setIsSubmitting(true);
    try {
      const metodoPrincipal = payments.length > 0 ? payments[0].method : null;
      const { error } = await supabase.from('sales').update({ status: 'finalizada', caixa_id: caixaId, metodo_pagamento: metodoPrincipal }).eq('id', selectedComanda.id);
      if (error) throw error;

      let remainingToPay = selectedComanda.total;
      const paymentInserts = [];
      for (const p of payments) {
          if (remainingToPay <= 0) break;
          const valToSave = Math.min(p.value, remainingToPay);
          paymentInserts.push({ venda_id: selectedComanda.id, metodo_pagamento: p.method, valor: valToSave });
          remainingToPay -= valToSave;
      }
      await supabase.from('sale_payments').insert(paymentInserts);
      
      toast.success("Venda finalizada com sucesso!");
      setIsPaymentModalOpen(false); setSelectedComanda(null); loadOpenComandas();   
    } catch (e: any) { toast.error("Erro", { description: e.message }); } finally { setIsSubmitting(false); }
  };

  // --- LÓGICA DE ESTOQUE TEMPO REAL (COMANDAS) ---
  const handleAddItem = async (product: Product) => {
    if (!selectedComanda || isUpdatingItem) return;
    if (product.quantidade <= 0) return toast.error(`Estoque insuficiente para ${product.nome}!`);
    
    setIsUpdatingItem(true);
    try {
        // Abate imediato no banco (Pois a comanda já está aberta no DB)
        await supabase.from('products').update({ quantidade: product.quantidade - 1 }).eq('id', product.id);
        
        const existingItem = selectedComanda.sale_items.find(item => item.produto_id === product.id);
        if (existingItem) {
            await supabase.from('sale_items').update({ quantidade: existingItem.quantidade + 1, subtotal: (existingItem.quantidade + 1) * existingItem.preco_unitario }).eq('id', existingItem.id);
        } else {
            await supabase.from('sale_items').insert([{ venda_id: selectedComanda.id, produto_id: product.id, quantidade: 1, preco_unitario: product.preco_venda, subtotal: product.preco_venda }]);
        }
        await refreshData();
    } finally {
        setIsUpdatingItem(false);
    }
  };

  const handleIncrementItem = async (item: SaleItem) => {
    if (isUpdatingItem) return;
    const product = products.find(p => p.id === item.produto_id);
    if (!product || product.quantidade <= 0) return toast.error("Não há mais stock disponível!");
    
    setIsUpdatingItem(true);
    try {
        await supabase.from('products').update({ quantidade: product.quantidade - 1 }).eq('id', product.id);
        await supabase.from('sale_items').update({ quantidade: item.quantidade + 1, subtotal: (item.quantidade + 1) * item.preco_unitario }).eq('id', item.id);
        await refreshData();
    } finally {
        setIsUpdatingItem(false);
    }
  };

  const handleDecrementItem = async (item: SaleItem) => {
    if (isUpdatingItem) return;
    setIsUpdatingItem(true);
    try {
        const product = products.find(p => p.id === item.produto_id);
        // Devolve o stock ao banco de dados
        if (product) await supabase.from('products').update({ quantidade: product.quantidade + 1 }).eq('id', product.id);
        
        if (item.quantidade === 1) {
            await supabase.from('sale_items').delete().eq('id', item.id);
        } else {
            await supabase.from('sale_items').update({ quantidade: item.quantidade - 1, subtotal: (item.quantidade - 1) * item.preco_unitario }).eq('id', item.id);
        }
        await refreshData();
    } finally {
        setIsUpdatingItem(false);
    }
  };

  const totalPago = useMemo(() => payments.reduce((sum, p) => sum + p.value, 0), [payments]);
  const faltaPagar = Math.max(0, (selectedComanda?.total || 0) - totalPago);
  const troco = Math.max(0, totalPago - (selectedComanda?.total || 0));
  const filteredProducts = products.filter(p => p.nome.toLowerCase().includes(searchTerm.toLowerCase()));
  const paymentLabels: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", cartao_credito: "Crédito", cartao_debito: "Débito" };

  const handleAddPayment = () => {
    if (!currentMethod) return toast.error("Selecione a forma de pagamento");
    const val = parseFloat(currentAmount.replace(",", "."));
    if (isNaN(val) || val <= 0) return toast.error("Valor inválido");
    setPayments([...payments, { method: currentMethod, value: val }]);
    setCurrentMethod(""); setCurrentAmount("");
  };

  const handleRemovePayment = (index: number) => { setPayments(payments.filter((_, i) => i !== index)); };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] gap-2 overflow-hidden bg-background text-foreground animate-in fade-in duration-500">
      <div className="flex-shrink-0 flex justify-between items-center px-4 py-2">
        <h1 className="text-2xl font-bold tracking-tight">Comandas (Mesas)</h1>
      </div>

      <div className="grid gap-3 grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 px-2 pb-2">
        {/* CARD COMANDAS ABERTAS */}
        <Card className="lg:col-span-3 flex flex-col border border-border bg-card overflow-hidden h-full shadow-sm">
          <CardHeader className="p-4 border-b border-border flex-shrink-0 bg-muted/20">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-foreground"><List className="h-5 w-5 text-primary" /> Abertas ({openComandas.length})</CardTitle>
              <Button size="sm" className="h-8 shadow-sm bg-primary hover:bg-primary/90 text-primary-foreground font-bold" onClick={() => { if (!caixaId) { toast.error("Caixa Fechado"); return; } setIsComandaModalOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Nova
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-3 space-y-2 bg-muted/10 scrollbar-thin">
            {openComandas.map((comanda) => (
              <div key={comanda.id} onClick={() => handleSelectComanda(comanda.id)} className={`cursor-pointer p-3 rounded-xl border transition-all duration-200 relative group 
                ${selectedComanda?.id === comanda.id ? "bg-card border-primary shadow-md ring-1 ring-primary/50 z-10" : "bg-card border-border hover:border-primary/50 shadow-sm hover:shadow-md"}`}>
                <div className="flex justify-between items-center mb-2">
                    <span className={`font-extrabold text-2xl ${selectedComanda?.id === comanda.id ? "text-primary" : "text-foreground"}`}>#{comanda.numero_comanda || "?"}</span>
                    <span className="font-bold text-base bg-secondary px-2 py-1 rounded-md text-foreground">R$ {Number(comanda.total).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <div className="flex items-center gap-1.5 font-medium"><User className="h-3.5 w-3.5" /><span className="truncate max-w-[100px]">{comanda.nome_cliente || "Balcão"}</span></div>
                    {selectedComanda?.id === comanda.id && <ChevronRight className="h-4 w-4 text-primary" />}
                </div>
              </div>
            ))}
            {openComandas.length === 0 && <div className="text-center py-10 text-muted-foreground text-sm font-medium">Nenhuma comanda aberta.</div>}
          </CardContent>
        </Card>

        {/* CARD PRODUTOS */}
        <Card className="lg:col-span-5 flex flex-col border border-border bg-card overflow-hidden h-full shadow-sm">
          <CardHeader className="p-4 border-b border-border flex-shrink-0 bg-muted/10">
              <div className="relative">
                  <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
                  <Input placeholder="Buscar produto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} disabled={!selectedComanda} className="pl-10 bg-background border-border focus:bg-background transition-all h-12 text-lg text-foreground shadow-sm" />
              </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0 bg-muted/10 scrollbar-thin">
            <div className="divide-y divide-border">
              {filteredProducts.map((product) => {
                  const isOutOfStock = product.quantidade <= 0;
                  const isDisabled = isOutOfStock || !selectedComanda || isUpdatingItem;
                  return (
                    <div key={product.id} onClick={() => !isDisabled && handleAddItem(product)} className={`flex items-center justify-between p-4 transition-colors 
                        ${!selectedComanda ? 'opacity-50 cursor-not-allowed bg-muted/20' : 
                        isOutOfStock ? 'opacity-60 cursor-not-allowed bg-destructive/5' : 'cursor-pointer hover:bg-muted/50 active:bg-muted'}`}>
                      
                      <div className="flex flex-col gap-1">
                          <span className={`font-bold text-base ${isOutOfStock ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{product.nome}</span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${isOutOfStock ? 'text-destructive' : 'text-muted-foreground'}`}>Estoque: {product.quantidade}</span>
                      </div>
                      <div className="flex items-center gap-3">
                          <span className={`font-extrabold text-lg px-2 py-1 rounded ${isOutOfStock ? 'text-muted-foreground' : 'text-foreground bg-secondary'}`}>R$ {Number(product.preco_venda).toFixed(2)}</span>
                          {selectedComanda && (
                              <Button size="icon" variant="ghost" disabled={isDisabled} className={`h-10 w-10 rounded-full ${isOutOfStock ? 'bg-muted text-muted-foreground' : 'text-primary bg-primary/10 hover:bg-primary/20'}`}>
                                  <Plus className="h-6 w-6" />
                              </Button>
                          )}
                      </div>
                    </div>
                  )
              })}
            </div>
          </CardContent>
        </Card>

        {/* CARD CARRINHO */}
        <Card className="lg:col-span-4 flex flex-col border border-border shadow-md bg-card z-10 overflow-hidden h-full">
          <CardHeader className="p-4 bg-muted/30 border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary"><ShoppingCart className="h-5 w-5" /></div>
                    {selectedComanda ? <div className="flex flex-col leading-none"><span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Mesa / Comanda</span><span className="font-extrabold text-xl text-foreground">#{selectedComanda.numero_comanda || "S/N"}</span></div> : <span className="text-muted-foreground">Selecione uma mesa</span>}
                </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0 scrollbar-thin bg-card">
            {selectedComanda ? (
                selectedComanda.sale_items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4 p-8 text-center opacity-70">
                        <ShoppingCart className="h-12 w-12 text-muted-foreground/50" />
                        <p className="text-sm font-medium">Comanda vazia.<br/>Adicione produtos.</p>
                    </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm border-b border-border">
                        <TableRow className="h-8 hover:bg-transparent border-none">
                            <TableHead className="w-[50%] pl-4 h-8 text-[10px] font-bold uppercase text-muted-foreground">Produto</TableHead>
                            <TableHead className="text-center h-8 text-[10px] font-bold uppercase text-muted-foreground">Qtd</TableHead>
                            <TableHead className="text-right pr-4 h-8 text-[10px] font-bold uppercase text-muted-foreground">Total</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedComanda.sale_items.map((item) => (
                        <TableRow key={item.id} className="hover:bg-muted/30 border-border">
                          <TableCell className="font-medium pl-4 py-3 align-middle">
                              <div className="flex flex-col leading-tight gap-0.5">
                                  <span className="text-sm text-foreground font-bold line-clamp-2">{item.nome}</span>
                                  <span className="text-[10px] text-muted-foreground font-medium">Un: R$ {item.preco_unitario.toFixed(2)}</span>
                              </div>
                          </TableCell>
                          <TableCell className="text-center p-0 align-middle">
                              <div className="flex items-center justify-center gap-0.5 bg-background border border-border shadow-sm rounded-lg mx-1 py-0.5">
                                  <Button variant="ghost" size="icon" disabled={isUpdatingItem} className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive rounded-md" onClick={() => handleDecrementItem(item)}><Minus className="h-3 w-3" /></Button>
                                  <span className="text-sm font-bold w-5 text-foreground">{item.quantidade}</span>
                                  <Button variant="ghost" size="icon" disabled={isUpdatingItem} className="h-7 w-7 hover:bg-primary/10 hover:text-primary rounded-md" onClick={() => handleIncrementItem(item)}><Plus className="h-3 w-3" /></Button>
                              </div>
                          </TableCell>
                          <TableCell className="text-right pr-4 font-bold text-sm text-foreground align-middle">
                              R$ {item.subtotal.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4 p-8 text-center opacity-50">
                    <List className="h-16 w-16 bg-muted p-4 rounded-full" />
                    <p>Selecione uma comanda ao lado<br/>para visualizar os itens.</p>
                </div>
            )}
          </CardContent>
          
          <CardFooter className="p-0 border-t border-border bg-card flex-shrink-0 flex flex-col z-20">
            <div className="flex justify-between items-center w-full px-5 py-4 border-b border-dashed border-border bg-muted/10">
                <span className="text-muted-foreground font-bold uppercase text-xs tracking-wider">Total da Mesa</span>
                <span className="text-4xl font-extrabold text-foreground tracking-tight">R$ {selectedComanda ? Number(selectedComanda.total).toFixed(2) : "0.00"}</span>
            </div>
            <div className="p-4 w-full bg-card">
              <Button 
                size="lg" 
                className={`w-full h-16 font-extrabold text-xl shadow-lg text-white transition-all 
                    ${!selectedComanda ? 'bg-muted text-muted-foreground border border-border cursor-not-allowed hover:bg-muted' : 
                      selectedComanda?.sale_items.length === 0 ? 'bg-destructive hover:bg-destructive/90 shadow-destructive/20' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'}`} 
                disabled={!selectedComanda || isUpdatingItem} 
                onClick={handleAttemptFinishSale}
              >
                {!selectedComanda ? "MESA NÃO SELECIONADA" : selectedComanda?.sale_items.length === 0 ? "CANCELAR COMANDA VAZIA" : "RECEBER PAGAMENTO"}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>

      <AlertDialog open={isCancelAlertOpen} onOpenChange={setIsCancelAlertOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
              <AlertDialogTitle className="text-foreground text-xl">Deseja cancelar esta comanda?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground text-base">Esta comanda está vazia. Ao confirmar, ela será removida permanentemente do sistema.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
              <AlertDialogCancel className="bg-background text-foreground border-border hover:bg-muted font-bold">Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancelComanda} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold">Sim, Cancelar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="sm:max-w-xl bg-card border-border p-6 shadow-2xl">
          <DialogHeader><DialogTitle className="text-2xl font-bold text-foreground">Pagamento da Comanda</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 my-4">
            <div className="bg-muted/30 border border-border p-4 rounded-xl flex flex-col justify-center items-center">
                <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Total da Venda</span>
                <span className="text-3xl font-extrabold text-foreground">R$ {Number(selectedComanda?.total).toFixed(2)}</span>
            </div>
            <div className={`p-4 rounded-xl flex flex-col justify-center items-center border-2 transition-colors ${faltaPagar === 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-orange-500/10 border-orange-500/30 text-orange-500'}`}>
                <span className="text-xs uppercase font-bold tracking-wider">{faltaPagar === 0 ? 'Troco' : 'Falta Pagar'}</span>
                <span className="text-3xl font-extrabold">R$ {faltaPagar === 0 ? troco.toFixed(2) : faltaPagar.toFixed(2)}</span>
            </div>
          </div>
          <div className="grid grid-cols-12 gap-3 mt-4">
            <Select value={currentMethod} onValueChange={(val: any) => setCurrentMethod(val)}>
                <SelectTrigger className="col-span-6 h-12 bg-background border-border text-foreground font-medium"><SelectValue placeholder="Forma de Pgto" /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                    <SelectItem value="dinheiro" className="hover:bg-muted font-medium">Dinheiro</SelectItem>
                    <SelectItem value="pix" className="hover:bg-muted font-medium">Pix</SelectItem>
                    <SelectItem value="cartao_debito" className="hover:bg-muted font-medium">Débito</SelectItem>
                    <SelectItem value="cartao_credito" className="hover:bg-muted font-medium">Crédito</SelectItem>
                </SelectContent>
            </Select>
            <div className="col-span-4 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">R$</span>
                <Input type="number" placeholder="0.00" className="pl-9 h-12 font-bold bg-background border-border text-foreground text-lg" value={currentAmount} onChange={(e) => setCurrentAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddPayment()} />
            </div>
            <Button className="col-span-2 h-12 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-bold shadow-sm" onClick={handleAddPayment}>Add</Button>
          </div>
          <div className="mt-4 border border-border rounded-xl max-h-40 overflow-y-auto bg-muted/10 shadow-inner">
             <Table>
                 <TableHeader><TableRow className="border-border hover:bg-transparent"><TableHead className="text-muted-foreground font-bold text-xs uppercase">Método</TableHead><TableHead className="text-right text-muted-foreground font-bold text-xs uppercase">Valor</TableHead><TableHead className="w-[50px]"></TableHead></TableRow></TableHeader>
                <TableBody>
                  {payments.length === 0 && <TableRow className="border-border hover:bg-transparent"><TableCell colSpan={3} className="text-center text-muted-foreground py-6 text-sm">Nenhum valor inserido.</TableCell></TableRow>}
                  {payments.map((p, i) => (
                      <TableRow key={i} className="border-border hover:bg-muted/30">
                          <TableCell className="font-bold text-foreground">{paymentLabels[p.method]}</TableCell>
                          <TableCell className="text-right font-extrabold text-foreground text-lg">R$ {p.value.toFixed(2)}</TableCell>
                          <TableCell><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleRemovePayment(i)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                  ))}
                </TableBody>
             </Table>
          </div>
          <DialogFooter className="mt-6 pt-4 border-t border-border">
              <Button className="w-full h-16 text-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20" onClick={handleConfirmPayment} disabled={totalPago < (selectedComanda?.total || 0) || isSubmitting}>
                  {isSubmitting ? <><Loader2 className="mr-2 h-6 w-6 animate-spin" /> PROCESSANDO...</> : "CONFIRMAR PAGAMENTOS"}
              </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isComandaModalOpen} onOpenChange={setIsComandaModalOpen}>
        <DialogContent className="sm:max-w-[400px] bg-card border-border shadow-xl">
            <form onSubmit={handleCreateSale}>
                <DialogHeader>
                    <DialogTitle className="text-foreground text-xl">Abrir Nova Mesa/Comanda</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-6">
                    <div className="space-y-2">
                        <Label className="text-foreground font-semibold">Número da Mesa / Comanda</Label>
                        <Input value={newComandaNumber} onChange={(e) => setNewComandaNumber(e.target.value)} placeholder="Ex: 10" className="text-2xl font-bold h-14 bg-background border-border text-foreground tracking-wider" autoFocus />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-foreground font-semibold">Nome do Cliente (Opcional)</Label>
                        <Input value={newComandaName} onChange={(e) => setNewComandaName(e.target.value)} placeholder="Ex: João Silva" className="h-12 bg-background border-border text-foreground" />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="submit" disabled={isSubmitting} className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg">
                        {isSubmitting ? <Loader2 className="h-6 w-6 animate-spin" /> : "ABRIR MESA"}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}