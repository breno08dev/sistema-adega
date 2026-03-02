import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Plus, ShoppingCart, User, List, Minus, Search, Trash2, ChevronRight, Lock } from "lucide-react"; 

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
  
  // Controle de Caixa
  const [caixaId, setCaixaId] = useState<string | null>(null);

  const [isComandaModalOpen, setIsComandaModalOpen] = useState(false);
  const [isCancelAlertOpen, setIsCancelAlertOpen] = useState(false);
  const [newComandaNumber, setNewComandaNumber] = useState("");
  const [newComandaName, setNewComandaName] = useState("");

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    const { data } = await supabase.from("caixas").select("id").eq("colaborador_id", user.id).eq("status", "aberto").single();
    setCaixaId(data?.id || null);
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
    const { data, error } = await supabase.from('sales').select('*, sale_items(*, products(nome))').eq('id', comandaId).single();
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
    if (!user || !caixaId) {
      toast.error("Caixa Fechado", { description: "Abra o caixa no 'Caixa Rápido' antes de iniciar comandas." });
      return;
    }
    const { data, error } = await supabase.from('sales').insert([{ colaborador_id: user.id, nome_cliente: newComandaName || null, numero_comanda: newComandaNumber || null, status: 'aberta' }]).select().single();
    if (data) {
      toast.success(`Comanda #${data.numero_comanda || ''} aberta!`);
      setIsComandaModalOpen(false); setNewComandaName(""); setNewComandaNumber("");
      loadOpenComandas(); handleSelectComanda(data.id);
    }
  };

  const handleCancelComanda = async () => {
    if (!selectedComanda) return;
    const { error } = await supabase.from('sales').delete().eq('id', selectedComanda.id);
    if (!error) {
      toast.success("Comanda cancelada com sucesso!");
      setSelectedComanda(null);
      loadOpenComandas();
      setIsCancelAlertOpen(false);
    }
  };

  const handleAttemptFinishSale = () => {
    if (!selectedComanda) return;
    if (selectedComanda.sale_items.length === 0) {
        setIsCancelAlertOpen(true);
        return;
    }
    setPayments([]); setCurrentMethod(""); setCurrentAmount(selectedComanda.total.toFixed(2)); setIsPaymentModalOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedComanda || !user || !caixaId) return;
    setIsSubmitting(true);
    try {
      const metodoPrincipal = payments.length > 0 ? payments[0].method : null;
      const { error } = await supabase.from('sales').update({ 
          status: 'finalizada', 
          caixa_id: caixaId, 
          metodo_pagamento: metodoPrincipal 
      }).eq('id', selectedComanda.id);
      
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
    } catch (e: any) { 
        toast.error("Erro", { description: e.message }); 
    } finally { 
        setIsSubmitting(false); 
    }
  };

  const handleAddItem = async (product: Product) => {
    if (!selectedComanda) return toast.error("Selecione uma comanda primeiro!");
    if (product.quantidade <= 0) return toast.error("Produto sem estoque!");
    await supabase.from('products').update({ quantidade: product.quantidade - 1 }).eq('id', product.id);
    const existingItem = selectedComanda.sale_items.find(item => item.produto_id === product.id);
    if (existingItem) await supabase.from('sale_items').update({ quantidade: existingItem.quantidade + 1, subtotal: (existingItem.quantidade + 1) * existingItem.preco_unitario }).eq('id', existingItem.id);
    else await supabase.from('sale_items').insert([{ venda_id: selectedComanda.id, produto_id: product.id, quantidade: 1, preco_unitario: product.preco_venda, subtotal: product.preco_venda }]);
    refreshData();
  };

  const handleIncrementItem = async (item: SaleItem) => {
    const product = products.find(p => p.id === item.produto_id);
    if (!product || product.quantidade <= 0) return toast.error("Sem estoque!");
    await supabase.from('products').update({ quantidade: product.quantidade - 1 }).eq('id', product.id);
    await supabase.from('sale_items').update({ quantidade: item.quantidade + 1, subtotal: (item.quantidade + 1) * item.preco_unitario }).eq('id', item.id);
    refreshData();
  };

  const handleDecrementItem = async (item: SaleItem) => {
    const product = products.find(p => p.id === item.produto_id);
    if(product) await supabase.from('products').update({ quantidade: product.quantidade + 1 }).eq('id', product.id);
    if (item.quantidade === 1) await supabase.from('sale_items').delete().eq('id', item.id);
    else await supabase.from('sale_items').update({ quantidade: item.quantidade - 1, subtotal: (item.quantidade - 1) * item.preco_unitario }).eq('id', item.id);
    refreshData();
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
    <div className="flex flex-col h-[calc(100vh-4rem)] gap-2 overflow-hidden bg-gray-50/50 dark:bg-gray-950">
      <div className="flex-shrink-0 flex justify-between items-center px-4 py-2">
        <h1 className="text-xl font-bold tracking-tight">Comandas</h1>
      </div>

      <div className="grid gap-2 grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 px-2 pb-2">
        <Card className="lg:col-span-3 flex flex-col border-none shadow-sm ring-1 ring-gray-200 dark:ring-gray-800 bg-white dark:bg-gray-900 overflow-hidden h-full">
          <CardHeader className="p-3 border-b flex-shrink-0 bg-gray-50/80">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold flex items-center gap-2"><List className="h-5 w-5 text-orange-600" /> Abertas ({openComandas.length})</CardTitle>
              <Button 
                size="sm" 
                className="h-8 shadow-sm bg-orange-600 hover:bg-orange-700"
                onClick={() => {
                  if (!caixaId) {
                    toast.error("Caixa Fechado", { description: "Abra o caixa no 'Caixa Rápido' primeiro." });
                    return;
                  }
                  setIsComandaModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" /> Nova
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-2 space-y-2 bg-gray-100/50">
            {openComandas.map((comanda) => (
              <div key={comanda.id} onClick={() => handleSelectComanda(comanda.id)} className={`cursor-pointer p-3 rounded-xl border transition-all duration-150 relative group ${selectedComanda?.id === comanda.id ? "bg-white border-orange-500 shadow-md ring-2 ring-orange-500 z-10" : "bg-white border-gray-200 hover:border-orange-300 shadow-sm"}`}>
                <div className="flex justify-between items-center mb-1"><span className={`font-extrabold text-2xl ${selectedComanda?.id === comanda.id ? "text-orange-600" : "text-gray-800"}`}>#{comanda.numero_comanda || "?"}</span><span className="font-bold text-base bg-gray-100 px-2 py-1 rounded-md text-gray-900">R$ {Number(comanda.total).toFixed(2)}</span></div>
                <div className="flex items-center justify-between text-sm text-muted-foreground"><div className="flex items-center gap-1 font-medium"><User className="h-3 w-3" /><span className="truncate max-w-[100px]">{comanda.nome_cliente || "Balcão"}</span></div>{selectedComanda?.id === comanda.id && <ChevronRight className="h-4 w-4 text-orange-500" />}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5 flex flex-col border-none shadow-sm ring-1 ring-gray-200 dark:ring-gray-800 bg-white dark:bg-gray-900 overflow-hidden h-full">
          <CardHeader className="p-3 border-b flex-shrink-0"><div className="relative"><Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" /><Input placeholder="Buscar produto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} disabled={!selectedComanda} className="pl-10 bg-gray-50 border-gray-200 focus:bg-white transition-all h-12 text-lg" /></div></CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0 bg-gray-50/30">
            <div className="divide-y divide-gray-100">
              {filteredProducts.map((product) => (
                <div key={product.id} onClick={() => selectedComanda && handleAddItem(product)} className={`flex items-center justify-between p-3 transition-colors ${!selectedComanda ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:bg-blue-50 active:bg-blue-100'}`}>
                  <div className="flex flex-col gap-0.5"><span className="font-bold text-base text-gray-900">{product.nome}</span><span className={`text-xs font-medium ${product.quantidade <= 0 ? 'text-red-500' : 'text-muted-foreground'}`}>Estoque: {product.quantidade}</span></div>
                  <div className="flex items-center gap-3"><span className="font-extrabold text-gray-900 text-lg bg-gray-100 px-2 py-1 rounded">R$ {Number(product.preco_venda).toFixed(2)}</span>{selectedComanda && <Button size="icon" variant="ghost" className="h-10 w-10 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full"><Plus className="h-6 w-6" /></Button>}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4 flex flex-col border-none shadow-lg ring-1 ring-gray-200 bg-white z-10 overflow-hidden h-full">
          <CardHeader className="p-3 bg-gray-50 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><div className="p-1.5 rounded-md bg-blue-100 text-blue-600"><ShoppingCart className="h-5 w-5" /></div>{selectedComanda ? <div className="flex flex-col leading-none"><span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Mesa</span><span className="font-extrabold text-xl">#{selectedComanda.numero_comanda || "S/N"}</span></div> : "Carrinho"}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0 scrollbar-thin">
            {selectedComanda && (
              <Table><TableHeader className="bg-white sticky top-0 z-10 shadow-sm"><TableRow className="h-8 hover:bg-transparent"><TableHead className="w-[50%] pl-3 h-8 text-xs font-bold uppercase text-gray-500">Produto</TableHead><TableHead className="text-center h-8 text-xs font-bold uppercase text-gray-500">Qtd</TableHead><TableHead className="text-right pr-3 h-8 text-xs font-bold uppercase text-gray-500">Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {selectedComanda.sale_items.map((item) => (
                    <TableRow key={item.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium pl-3 py-1.5 align-middle"><div className="flex flex-col leading-tight"><span className="text-sm text-gray-900 font-semibold line-clamp-1">{item.nome}</span><span className="text-[10px] text-muted-foreground">Un: R$ {item.preco_unitario.toFixed(2)}</span></div></TableCell>
                      <TableCell className="text-center p-0 align-middle"><div className="flex items-center justify-center gap-0.5 bg-gray-100 rounded-lg mx-1 py-0.5"><Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white hover:shadow-sm rounded-md" onClick={() => handleDecrementItem(item)}><Minus className="h-3 w-3" /></Button><span className="text-sm font-bold w-5">{item.quantidade}</span><Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white hover:shadow-sm rounded-md" onClick={() => handleIncrementItem(item)}><Plus className="h-3 w-3" /></Button></div></TableCell>
                      <TableCell className="text-right pr-3 font-bold text-sm text-gray-900 align-middle">R$ {item.subtotal.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
          <CardFooter className="p-0 border-t bg-gray-50 flex-shrink-0 flex flex-col">
            <div className="flex justify-between items-center w-full px-4 py-3 border-b border-dashed border-gray-200"><span className="text-muted-foreground font-bold uppercase text-xs tracking-wider">Total</span><span className="text-4xl font-extrabold text-gray-900">R$ {selectedComanda ? Number(selectedComanda.total).toFixed(2) : "0.00"}</span></div>
            <div className="p-3 pb-6 w-full bg-white">
              <Button 
                size="lg" 
                className={`w-full h-14 font-extrabold text-xl shadow-lg ${selectedComanda?.sale_items.length === 0 ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'}`} 
                disabled={!selectedComanda} 
                onClick={handleAttemptFinishSale}
              >
                {selectedComanda?.sale_items.length === 0 ? "CANCELAR" : "RECEBER"}
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>

      <AlertDialog open={isCancelAlertOpen} onOpenChange={setIsCancelAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deseja cancelar esta comanda?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta comanda está vazia. Ao confirmar, ela será removida permanentemente do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelComanda} className="bg-red-500 hover:bg-red-600">Sim, Cancelar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle className="text-xl">Pagamento da Comanda</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 my-2">
            <div className="bg-gray-100 p-4 rounded-xl flex flex-col justify-center items-center"><span className="text-xs text-muted-foreground uppercase font-bold">Total da Venda</span><span className="text-3xl font-extrabold">R$ {Number(selectedComanda?.total).toFixed(2)}</span></div>
            <div className={`p-4 rounded-xl flex flex-col justify-center items-center border-2 ${faltaPagar === 0 ? 'bg-green-100 border-green-500 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}><span className="text-xs uppercase font-bold">{faltaPagar === 0 ? 'Troco' : 'Falta Pagar'}</span><span className="text-3xl font-extrabold">R$ {faltaPagar === 0 ? troco.toFixed(2) : faltaPagar.toFixed(2)}</span></div>
          </div>
          <div className="grid grid-cols-12 gap-2 mt-2">
            <Select value={currentMethod} onValueChange={(val: any) => setCurrentMethod(val)}><SelectTrigger className="col-span-6 h-12 bg-white"><SelectValue placeholder="Forma de Pgto" /></SelectTrigger><SelectContent><SelectItem value="dinheiro">Dinheiro</SelectItem><SelectItem value="pix">Pix</SelectItem><SelectItem value="cartao_debito">Débito</SelectItem><SelectItem value="cartao_credito">Crédito</SelectItem></SelectContent></Select>
            <div className="col-span-4 relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">R$</span><Input type="number" placeholder="0.00" className="pl-9 h-12 font-bold" value={currentAmount} onChange={(e) => setCurrentAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddPayment()} /></div>
            <Button className="col-span-2 h-12 bg-blue-600 hover:bg-blue-700" onClick={handleAddPayment}>Add</Button>
          </div>
          <div className="mt-4 border rounded-md max-h-40 overflow-y-auto bg-gray-50/50">
             <Table><TableHeader><TableRow><TableHead>Método</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="w-[50px]"></TableHead></TableRow></TableHeader>
                <TableBody>
                  {payments.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">Nenhum pagamento adicionado</TableCell></TableRow>}
                  {payments.map((p, i) => (<TableRow key={i}><TableCell className="font-semibold">{paymentLabels[p.method]}</TableCell><TableCell className="text-right font-bold">R$ {p.value.toFixed(2)}</TableCell><TableCell><Button variant="ghost" size="icon" className="text-red-500" onClick={() => handleRemovePayment(i)}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>))}
                </TableBody>
             </Table>
          </div>
          <DialogFooter className="mt-4 pt-4 border-t"><Button className="w-full h-14 text-lg font-bold bg-green-600 hover:bg-green-700" onClick={handleConfirmPayment} disabled={totalPago < (selectedComanda?.total || 0) || isSubmitting}>CONFIRMAR</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isComandaModalOpen} onOpenChange={setIsComandaModalOpen}><DialogContent className="sm:max-w-[400px]"><form onSubmit={handleCreateSale}><DialogHeader><DialogTitle>Abrir Comanda</DialogTitle></DialogHeader><div className="grid gap-4 py-4"><div className="space-y-2"><Label>Mesa / Nº</Label><Input value={newComandaNumber} onChange={(e) => setNewComandaNumber(e.target.value)} placeholder="10" className="text-2xl font-bold h-14" autoFocus /></div><div className="space-y-2"><Label>Cliente</Label><Input value={newComandaName} onChange={(e) => setNewComandaName(e.target.value)} placeholder="Nome" className="h-12" /></div></div><DialogFooter><Button type="submit" className="w-full h-12 text-lg">Abrir</Button></DialogFooter></form></DialogContent></Dialog>
    </div>
  );
}