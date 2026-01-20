// src/pages/pdv/CaixaRapido.tsx
import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Minus, X, Search, ShoppingCart, CreditCard, Landmark, Wallet, DollarSign, Package, Lock } from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type Category = Database["public"]["Tables"]["categories"]["Row"];
type Product = ProductRow & { categories: { nome: string } | null; };
type CartItem = Product & { quantidade_venda: number; };
type PaymentMethod = Database["public"]["Enums"]["payment_method"];
type CaixaStatus = "aberto" | "fechado" | "loading";

export default function CaixaRapido() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [amountPaid, setAmountPaid] = useState(""); // Valor Recebido
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCaixaModalOpen, setIsCaixaModalOpen] = useState(false);
  const [valorAbertura, setValorAbertura] = useState("");
  const [caixaStatus, setCaixaStatus] = useState<CaixaStatus>("loading");
  const [isSubmittingCaixa, setIsSubmittingCaixa] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const { data: prodData } = await supabase.from('products').select('*, categories(nome)').order('nome');
        const { data: catData } = await supabase.from('categories').select('*').order('nome');
        if (prodData) setProducts(prodData as Product[]);
        if (catData) setCategories(catData);
      } catch (error) { toast.error("Erro ao carregar dados"); } finally { setLoading(false); }
    };
    loadData();
  }, []); 

  const checkCaixaStatus = async () => {
    if (!user) { setCaixaStatus("fechado"); return; }
    setCaixaStatus("loading");
    try {
      const { data } = await supabase.from("caixas").select("id").eq("colaborador_id", user.id).eq("status", "aberto").single();
      setCaixaStatus(data ? "aberto" : "fechado");
    } catch { setCaixaStatus("fechado"); }
  };
  useEffect(() => { checkCaixaStatus(); }, [user]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.nome.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || p.categoria_id === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const addToCart = (product: Product) => {
    if (caixaStatus !== 'aberto') return toast.error("Caixa fechado!");
    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.id === product.id);
      if (existingItem) return prevCart.map(item => item.id === product.id ? { ...item, quantidade_venda: item.quantidade_venda + 1 } : item);
      return [...prevCart, { ...product, quantidade_venda: 1 }];
    });
  };

  const updateCartQuantity = (productId: string, amount: number) => {
    setCart(prevCart => {
      const newAmount = Math.max(0, amount);
      if (newAmount === 0) return prevCart.filter(item => item.id !== productId);
      return prevCart.map(item => item.id === productId ? { ...item, quantidade_venda: newAmount } : item);
    });
  };

  const totalCompra = useMemo(() => {
    return cart.reduce((sum, item) => sum + (Number(item.preco_venda) * item.quantidade_venda), 0);
  }, [cart]);

  // CÁLCULO DO TROCO
  const troco = useMemo(() => {
    if (paymentMethod !== 'dinheiro') return 0;
    const pago = parseFloat(amountPaid) || 0;
    return pago > totalCompra ? pago - totalCompra : 0;
  }, [amountPaid, totalCompra, paymentMethod]);

  const handleFinalizeSale = async () => {
    if (!user || cart.length === 0 || !paymentMethod) return;
    if (caixaStatus !== 'aberto') return toast.error("Caixa fechado!");
    
    if (paymentMethod === 'dinheiro') {
        if ((parseFloat(amountPaid) || 0) < totalCompra) return toast.error("Valor insuficiente!");
    }

    setIsSubmitting(true);
    try {
      const { data: saleData, error: saleError } = await supabase.from('sales').insert({ colaborador_id: user.id, status: 'finalizada', metodo_pagamento: paymentMethod }).select().single();
      if (saleError) throw saleError;

      const saleItems = cart.map(item => ({ venda_id: saleData.id, produto_id: item.id, quantidade: item.quantidade_venda, preco_unitario: Number(item.preco_venda), subtotal: Number(item.preco_venda) * item.quantidade_venda }));
      const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
      if (itemsError) throw itemsError;
      
      toast.success("Venda realizada!");
      setCart([]); setPaymentMethod(""); setAmountPaid(""); setIsPaymentModalOpen(false);
    } catch (error: any) { toast.error("Erro na venda"); } finally { setIsSubmitting(false); }
  };

  const handleOpenCaixa = async () => {
    if (!user) return;
    const valorNum = parseFloat(valorAbertura.replace(",", "."));
    if (isNaN(valorNum)) return toast.error("Valor inválido");
    setIsSubmittingCaixa(true);
    try {
      const { data: caixaData, error: caixaError } = await supabase.from("caixas").insert({ colaborador_id: user.id, valor_abertura: valorNum, status: "aberto" }).select().single();
      if (caixaError) throw caixaError;
      await supabase.from("movements").insert({ responsavel_id: user.id, tipo: "entrada", descricao: 'Abertura de Caixa', valor: valorNum, created_at: caixaData.data_abertura });
      toast.success("Caixa aberto!");
      setCaixaStatus("aberto"); setIsCaixaModalOpen(false); setValorAbertura("");
    } catch (error: any) { toast.error("Erro ao abrir caixa"); } finally { setIsSubmittingCaixa(false); }
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-4 overflow-hidden">
      <Card className="flex-1 md:w-2/3 flex flex-col border-none shadow-sm ring-1 ring-gray-200 dark:ring-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        <CardHeader className="p-4 border-b space-y-4 flex-shrink-0">
            <div className="flex justify-between items-center">
                 <h1 className="text-xl font-bold flex items-center gap-2"><Package className="h-5 w-5 text-primary" /> Produtos</h1>
                 <Badge variant="outline" className="px-3 py-1 bg-gray-100">{filteredProducts.length} itens</Badge>
            </div>
            <div className="flex gap-2">
                <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Buscar..." className="pl-9 bg-gray-50" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-[180px] bg-gray-50"><SelectValue placeholder="Categoria" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Todas</SelectItem>{categories.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>)}</SelectContent>
                </Select>
            </div>
        </CardHeader>

        <CardContent className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
           {loading ? <div className="flex items-center justify-center h-full text-muted-foreground">Carregando...</div> : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredProducts.map(product => (
                    <div key={product.id} className={`group relative bg-white rounded-xl border p-3 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between h-[130px] ${product.quantidade <= 0 ? 'opacity-60 grayscale' : 'hover:border-primary/50'}`} onClick={() => product.quantidade > 0 && caixaStatus === 'aberto' && addToCart(product)}>
                        <div className="flex flex-col gap-1"><span className="text-[10px] uppercase font-bold text-muted-foreground truncate">{product.categories?.nome}</span><span className="font-semibold text-sm leading-tight line-clamp-2">{product.nome}</span></div>
                        <div className="flex justify-between items-end mt-2">
                             <div className="flex flex-col"><span className="text-[10px] text-muted-foreground">Estoque: {product.quantidade}</span><span className="text-lg font-bold text-primary">R$ {Number(product.preco_venda).toFixed(2)}</span></div>
                             <div className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors ${product.quantidade <= 0 ? 'bg-gray-100 text-gray-400' : 'bg-gray-100 text-gray-600 group-hover:bg-primary group-hover:text-white'}`}><Plus className="h-4 w-4" /></div>
                        </div>
                    </div>
                ))}
            </div>
           )}
        </CardContent>
      </Card>

      <Card className="w-full md:w-1/3 flex flex-col border-none shadow-lg ring-1 ring-gray-200 bg-white z-10 overflow-hidden h-full">
        <CardHeader className="p-4 bg-gray-50 border-b flex-shrink-0">
           <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Carrinho</CardTitle>
              {caixaStatus === 'aberto' ? <div className="px-3 py-1.5 rounded-full bg-green-100 text-green-700 text-xs font-bold uppercase flex items-center gap-2 border border-green-200"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-600"></span></span>Caixa Aberto</div> : <Button size="sm" variant="destructive" className="h-8 text-xs font-bold gap-2 animate-pulse shadow-sm" onClick={() => setIsCaixaModalOpen(true)} disabled={caixaStatus === 'loading'}><Lock className="h-3 w-3" /> ABRIR CAIXA</Button>}
           </div>
        </CardHeader>
        
        <CardContent className="flex-1 overflow-y-auto p-0 scrollbar-thin">
            {cart.length === 0 ? <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4 p-8 text-center opacity-50"><ShoppingCart className="h-16 w-16 bg-gray-100 p-4 rounded-full" /><p>Carrinho vazio</p></div> : (
              <Table>
                <TableHeader className="bg-white sticky top-0 z-10 shadow-sm"><TableRow><TableHead className="pl-4 h-10 text-xs uppercase">Item</TableHead><TableHead className="w-[80px] text-center h-10 text-xs uppercase">Qtd</TableHead><TableHead className="text-right pr-4 h-10 text-xs uppercase">Total</TableHead></TableRow></TableHeader>
                <TableBody>{cart.map(item => (<TableRow key={item.id} className="group"><TableCell className="pl-4 font-medium py-2"><div className="flex flex-col"><span className="text-sm line-clamp-1">{item.nome}</span><span className="text-[10px] text-muted-foreground">Unit: R$ {Number(item.preco_venda).toFixed(2)}</span></div></TableCell><TableCell className="text-center p-0"><div className="flex items-center justify-center bg-gray-100 rounded-md mx-1 py-1"><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateCartQuantity(item.id, item.quantidade_venda - 1)}><Minus className="h-3 w-3" /></Button><span className="text-xs w-6 font-bold">{item.quantidade_venda}</span><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateCartQuantity(item.id, item.quantidade_venda + 1)}><Plus className="h-3 w-3" /></Button></div></TableCell><TableCell className="text-right pr-4 font-bold text-sm">R$ {(Number(item.preco_venda) * item.quantidade_venda).toFixed(2)}</TableCell></TableRow>))}</TableBody>
              </Table>
            )}
        </CardContent>

        <CardFooter className="flex flex-col p-0 border-t bg-gray-50 flex-shrink-0 z-20">
             <div className="w-full p-4 flex justify-between items-center border-b border-dashed border-gray-300"><span className="text-sm font-medium text-muted-foreground uppercase">Total a Pagar</span><span className="text-3xl font-extrabold text-gray-900 tracking-tight">R$ {totalCompra.toFixed(2)}</span></div>
             <div className="p-4 w-full bg-white"><Button className="w-full h-14 text-xl font-bold shadow-lg bg-green-600 hover:bg-green-700" onClick={() => setIsPaymentModalOpen(true)} disabled={cart.length === 0 || isSubmitting || caixaStatus !== 'aberto'}>{caixaStatus !== 'aberto' ? <span className="flex items-center gap-2"><Lock className="h-5 w-5" /> CAIXA FECHADO</span> : <span className="flex items-center gap-2"><DollarSign className="h-5 w-5" /> RECEBER</span>}</Button></div>
        </CardFooter>
      </Card>

      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-center text-xl">Finalizar Venda</DialogTitle></DialogHeader>
          <div className="flex flex-col items-center justify-center py-2"><span className="text-sm text-muted-foreground uppercase font-semibold">Valor Total</span><span className="text-4xl font-extrabold text-primary">R$ {totalCompra.toFixed(2)}</span></div>
          <div className="space-y-4">
             <div className="grid grid-cols-2 gap-3">
                {[{ id: "dinheiro", label: "Dinheiro", icon: Wallet }, { id: "pix", label: "Pix", icon: Landmark }, { id: "cartao_debito", label: "Débito", icon: CreditCard }, { id: "cartao_credito", label: "Crédito", icon: CreditCard }].map((m) => (
                    <Button key={m.id} variant={paymentMethod === m.id ? "default" : "outline"} className={`h-16 flex flex-col gap-1 border-2 ${paymentMethod === m.id ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-gray-50'}`} onClick={() => { setPaymentMethod(m.id as PaymentMethod); if (m.id !== 'dinheiro') setAmountPaid(""); }}>
                        <m.icon className="h-5 w-5" /><span className="font-bold text-xs">{m.label}</span>
                    </Button>
                ))}
             </div>
             {paymentMethod === 'dinheiro' && (
                <div className="bg-gray-50 p-4 rounded-xl space-y-3 animate-in fade-in border">
                    <div className="space-y-1.5"><Label className="text-xs uppercase font-bold text-muted-foreground">Valor Recebido</Label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground text-lg">R$</span><Input type="number" placeholder="0.00" className="pl-10 h-12 text-xl font-bold bg-white" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} autoFocus /></div></div>
                    <div className="flex justify-between items-center pt-2 border-t border-dashed"><span className="font-semibold text-muted-foreground">Troco:</span><span className={`text-2xl font-bold ${troco >= 0 ? 'text-green-600' : 'text-gray-300'}`}>R$ {troco.toFixed(2)}</span></div>
                </div>
             )}
          </div>
          <DialogFooter className="mt-2"><Button className="w-full h-12 text-lg font-bold" onClick={handleFinalizeSale} disabled={!paymentMethod || isSubmitting || (paymentMethod === 'dinheiro' && (parseFloat(amountPaid) || 0) < totalCompra)}>{isSubmitting ? "Processando..." : "CONFIRMAR PAGAMENTO"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCaixaModalOpen} onOpenChange={setIsCaixaModalOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Abertura de Caixa</DialogTitle><DialogDescription>Insira o valor inicial.</DialogDescription></DialogHeader>
          <div className="py-4"><Label>Valor Inicial (R$)</Label><div className="relative mt-2"><span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">R$</span><Input type="number" placeholder="0,00" className="pl-10 text-xl font-bold h-14" value={valorAbertura} onChange={(e) => setValorAbertura(e.target.value)} disabled={isSubmittingCaixa} autoFocus /></div></div>
          <DialogFooter><Button variant="outline" onClick={() => setIsCaixaModalOpen(false)}>Cancelar</Button><Button onClick={handleOpenCaixa} disabled={isSubmittingCaixa}>Confirmar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}